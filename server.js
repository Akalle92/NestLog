// Nestlog home server: runs the app on your laptop so every phone on your
// Wi-Fi shares one live log. No dependencies, no accounts, no cloud.
//
//   node server.js              → http://<laptop>:8080 on your home network
//   PORT=9000 node server.js    → another port
//   NESTLOG_DATA=~/nestlog node server.js   → keep the data somewhere else
//
// Data lives in data/nestlog.json (same shape as the browser's local copy),
// with a dated copy in data/backups/ each day, the last 30 kept.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const STATIC = new Set(['/index.html', '/manifest.webmanifest', '/sw.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};
const KEEP_BACKUPS = 30;

/* ---------- validation: known types and fields only, like the app's import ---------- */
const SAFE_ID = /^[A-Za-z0-9_\-.~:@+]{1,120}$/;
const num = v => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
const str = (v, n = 120) => (typeof v === 'string' ? v.slice(0, n) : '');
const who = v => (typeof v === 'string' && v.length < 80 ? v : null);
const vocab = list => v => String(v || '').toLowerCase().split(/[\s,]+/).filter((w, i, a) => list.includes(w) && a.indexOf(w) === i).join(' ');
const FIELDS = {
  nurse: { left: num, right: num, end: num, last: v => (v === 'R' ? 'R' : 'L') },
  bottle: { ml: num, content: v => (v === 'breastmilk' || v === 'mixed' ? v : 'formula'), brand: v => str(v, 40) },
  solids: { food: v => str(v), reaction: v => str(v, 30) },
  sleep: { end: num },
  diaper: { kind: v => (['wet', 'dirty', 'both', 'dry'].includes(v) ? v : 'wet'),
    color: vocab(['yellow', 'green', 'brown', 'black', 'red']), texture: vocab(['seedy', 'mush', 'runny', 'solid', 'pebble', 'mucous']), flags: vocab(['blowout', 'rash']) },
  pump: { lml: num, rml: num, tml: num, min: num },
  growth: { kg: num, cm: num, head: num },
  medicine: { name: v => str(v, 80), dose: v => str(v, 40) },
  vaccine: { name: v => str(v, 80) },
  temp: { c: num },
  milestone: { title: v => str(v, 80) },
};
const COMMON = { note: v => str(v, 200), byName: v => str(v, 40), photo: v => (/^[A-Za-z0-9_-]{1,120}\.jpg$/.test(v || '') ? v : '') };
function cleanLog(raw) {
  if (!raw || typeof raw !== 'object' || !FIELDS[raw.type]) return null;
  const t = num(raw.t); if (!t) return null;
  const o = { type: raw.type, t, created: num(raw.created) || Date.now(), by: who(raw.by) };
  for (const [k, fix] of Object.entries({ ...FIELDS[raw.type], ...COMMON })) if (raw[k] !== undefined) o[k] = fix(raw[k]);
  if (o.type === 'sleep' && !(o.end > t)) return null;
  if ((o.type === 'medicine' || o.type === 'vaccine') && !o.name) return null;
  if (o.type === 'milestone' && !o.title) return null;
  if (o.type === 'temp' && !(o.c >= 30 && o.c <= 45)) return null;
  return o;
}
const side = v => (v === 'L' || v === 'R' ? v : null);
function cleanActive(kind, raw) {
  if (!raw || typeof raw !== 'object' || !num(raw.start)) return null;
  if (kind === 'sleep') return { start: raw.start, by: who(raw.by) };
  if (kind === 'nurse') return { start: raw.start, left: num(raw.left), right: num(raw.right), side: side(raw.side), since: num(raw.since), lastSide: side(raw.lastSide), by: who(raw.by) };
  return null;
}
function cleanSettings(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return { name: str(raw.name, 40), birth: /^\d{4}-\d{2}-\d{2}$/.test(raw.birth || '') ? raw.birth : '', sex: ['M', 'F'].includes(raw.sex) ? raw.sex : '', chart: ['who', 'cdc', 'iap'].includes(raw.chart) ? raw.chart : 'who', vol: raw.vol === 'oz' ? 'oz' : 'ml', wt: raw.wt === 'lb' ? 'lb' : 'kg', temp: raw.temp === 'F' ? 'F' : 'C', feedGap: Math.min(720, num(raw.feedGap)), diaperGap: Math.min(720, num(raw.diaperGap)) };
}

/* ---------- storage: one JSON file, written atomically ---------- */
function createStore(dir) {
  const file = path.join(dir, 'nestlog.json');
  const backups = path.join(dir, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  let data = { settings: cleanSettings({}), active: {}, logs: {} };
  try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); data = { settings: cleanSettings(d.settings), active: d.active || {}, logs: d.logs || {} }; }
  catch (e) { if (e.code !== 'ENOENT') throw new Error(`Couldn't read ${file}: ${e.message}. Fix or move that file, then start again.`); }

  function backup() {
    if (!fs.existsSync(file)) return;
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(backups, `nestlog-${today}.json`);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(file, target);
    const old = fs.readdirSync(backups).filter(f => /^nestlog-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -KEEP_BACKUPS);
    old.forEach(f => fs.rmSync(path.join(backups, f), { force: true }));
  }
  function save() {
    backup();
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }
  return { get: () => data, save, file };
}

/* ---------- http ---------- */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
    req.on('error', reject);
  });
}
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

function start({ port = 8080, host = '0.0.0.0', dataDir = path.join(ROOT, 'data') } = {}) {
  const store = createStore(dataDir);
  const clients = new Set();
  const broadcast = change => { const msg = `data: ${JSON.stringify(change)}\n\n`; clients.forEach(c => c.write(msg)); };
  const commit = change => { store.save(); broadcast(change); return change; };

  async function api(req, res, parts) {
    const d = store.get();
    const [kind, id] = parts;
    const m = req.method;
    if (kind === 'state' && m === 'GET') return json(res, 200, { app: 'nestlog', ...d });
    if (kind === 'events' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (kind === 'logs' && SAFE_ID.test(id || '')) {
      if (m === 'PUT') {
        const log = cleanLog(await readBody(req, 64 * 1024));
        if (!log) return json(res, 400, { error: 'That entry is missing a type or time.' });
        d.logs[id] = log; return json(res, 200, commit({ op: 'log', id, data: log }));
      }
      if (m === 'DELETE') { delete d.logs[id]; return json(res, 200, commit({ op: 'log', id, data: null })); }
    }
    if (kind === 'active' && (id === 'nurse' || id === 'sleep')) {
      if (m === 'PUT') {
        const a = cleanActive(id, await readBody(req, 16 * 1024));
        if (!a) return json(res, 400, { error: 'That timer is missing a start time.' });
        d.active[id] = a; return json(res, 200, commit({ op: 'active', kind: id, data: a }));
      }
      if (m === 'DELETE') { delete d.active[id]; return json(res, 200, commit({ op: 'active', kind: id, data: null })); }
    }
    if (kind === 'settings' && m === 'PUT') {
      d.settings = cleanSettings(await readBody(req, 16 * 1024));
      return json(res, 200, commit({ op: 'settings', data: d.settings }));
    }
    if (kind === 'import' && m === 'POST') {
      const body = await readBody(req, 25 * 1024 * 1024) || {};
      let count = 0;
      for (const [lid, raw] of Object.entries(body.logs || {})) {
        const log = SAFE_ID.test(lid) && cleanLog(raw);
        if (log) { d.logs[lid] = log; count++; }
      }
      if (body.settings) d.settings = cleanSettings(body.settings);
      store.save(); broadcast({ op: 'reload' });
      return json(res, 200, { count });
    }
    json(res, 404, { error: 'Unknown request.' });
  }

  function serveFile(req, res, urlPath) {
    if (urlPath === '/') urlPath = '/index.html';
    const ok = STATIC.has(urlPath) || /^\/icons\/[\w.-]+\.(png|svg)$/.test(urlPath);
    if (!ok) { res.writeHead(404).end('Not found'); return; }
    fs.readFile(path.join(ROOT, urlPath), (err, buf) => {
      if (err) { res.writeHead(404).end('Not found'); return; }
      let body = buf;
      // Tell the page it's running on the home server, so it syncs here instead of keeping a per-phone copy.
      if (urlPath === '/index.html') body = buf.toString('utf8').replace('</head>', '<meta name="nestlog-server" content="home">\n</head>');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(urlPath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    });
  }

  const server = http.createServer(async (req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    try {
      if (urlPath.startsWith('/api/')) await api(req, res, urlPath.slice(5).split('/'));
      else if (req.method === 'GET' || req.method === 'HEAD') serveFile(req, res, urlPath);
      else res.writeHead(405).end();
    } catch (e) {
      if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'The server couldn’t save that.' });
      if (!e.status) console.error(e);
    }
  });
  server.store = store;
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server)); });
}

function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}/`);
  return out;
}

module.exports = { start, cleanLog };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  const dataDir = process.env.NESTLOG_DATA ? path.resolve(process.env.NESTLOG_DATA.replace(/^~(?=$|\/)/, os.homedir())) : undefined;
  start({ port, dataDir }).then(server => {
    console.log(`Nestlog is running.\n\n  On this laptop:   http://localhost:${port}/`);
    lanUrls(port).forEach(u => console.log(`  On your phones:   ${u}`));
    console.log(`\n  Data file: ${server.store.file}\n\nKeep this window open. Press Ctrl+C to stop.`);
  }).catch(e => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other program or run: PORT=8081 npm run home` : e.message);
    process.exit(1);
  });
}
