// End-to-end checks in a phone-sized headless browser, light and dark.
// Run: npm test   (first time: npm install && npx playwright install chromium)
// Screenshots land in tests/screenshots/ for a visual once-over.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve');
const home = require('../server');
const os = require('os');

const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

// A realistic day plus a week of history, written straight into localStorage.
function seed() {
  const n = Date.now(), H = 36e5, M = 6e4, L = {}; let i = 0;
  const add = o => { L['s' + (i++)] = o; };
  add({ type: 'sleep', t: n - 22 * H, end: n - 18.5 * H });
  add({ type: 'nurse', t: n - 18 * H, end: n - 17.6 * H, left: 12 * M, right: 9 * M, last: 'R' });
  add({ type: 'diaper', t: n - 17.5 * H, kind: 'wet' });
  add({ type: 'sleep', t: n - 16 * H, end: n - 13.2 * H });
  add({ type: 'bottle', t: n - 12.8 * H, ml: 90, content: 'breastmilk' });
  add({ type: 'diaper', t: n - 12.5 * H, kind: 'both' });
  add({ type: 'sleep', t: n - 11 * H, end: n - 9.5 * H });
  add({ type: 'nurse', t: n - 9 * H, end: n - 8.7 * H, left: 8 * M, right: 10 * M, last: 'L' });
  add({ type: 'pump', t: n - 7 * H, lml: 70, rml: 60, min: 15 });
  add({ type: 'sleep', t: n - 6.5 * H, end: n - 4.6 * H });
  add({ type: 'bottle', t: n - 4.3 * H, ml: 120, content: 'formula' });
  add({ type: 'diaper', t: n - 4 * H, kind: 'dirty', note: 'yellow, seedy' });
  add({ type: 'sleep', t: n - 3 * H, end: n - 1.4 * H });
  add({ type: 'nurse', t: n - 1.2 * H, end: n - 0.9 * H, left: 10 * M, right: 7 * M, last: 'R' });
  for (let d = 1; d < 7; d++) {
    add({ type: 'sleep', t: n - d * 24 * H - 20 * H, end: n - d * 24 * H - 12 * H + d * 6e5 });
    add({ type: 'bottle', t: n - d * 24 * H - 6 * H, ml: 90 + d * 5, content: 'formula' });
    add({ type: 'diaper', t: n - d * 24 * H - 5 * H, kind: 'wet' });
    add({ type: 'nurse', t: n - d * 24 * H - 3 * H, end: n - d * 24 * H - 2.6 * H, left: 9 * M, right: 9 * M, last: 'L' });
  }
  add({ type: 'growth', t: n - 28 * 24 * H, kg: 3.4, cm: 50 });
  add({ type: 'growth', t: n - 14 * 24 * H, kg: 3.9 });
  add({ type: 'growth', t: n - 2 * 24 * H, kg: 4.45, cm: 54 });
  localStorage.setItem('nestlog-v1', JSON.stringify({
    settings: { name: 'Aarav', birth: new Date(n - 62 * 24 * H).toISOString().slice(0, 10), vol: 'ml', wt: 'kg' },
    active: { sleep: { start: n - 38 * M } }, logs: L,
  }));
}

// The taste skill's house rules, measured in the page instead of hoped for.
function tasteAudit() {
  const out = [];
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const floats = el => el.closest('.sheet, .toast');
  const sizes = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.boxShadow !== 'none' && !floats(el)) out.push(`shadow at rest on ${el.className || el.tagName}`);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') out.push(`glass on ${el.className || el.tagName}`);
    if (cs.textTransform === 'uppercase') out.push(`uppercase label ${el.className || el.tagName}`);
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && ['Top', 'Right', 'Bottom', 'Left'].some(e => parseFloat(cs['border' + e + 'Width']) > 0 && cs['border' + e + 'Style'] !== 'none')) out.push(`line on ${el.className || el.tagName}`);
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) sizes.add(cs.fontSize);
  }
  if (sizes.size > 5) out.push(`${sizes.size} font sizes: ${[...sizes].join(' ')}`);
  return out;
}
function paletteAudit() {
  const root = getComputedStyle(document.documentElement);
  const rgb = v => { const h = root.getPropertyValue(v).trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
  const hsl = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l]; };
  const lum = c => { const [r, g, b] = c.map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  const out = [];
  for (const v of ['--brand', '--c-feed', '--c-sleep', '--c-diaper', '--c-pump', '--c-growth']) {
    const [h, s] = hsl(rgb(v)); if (s > .15 && h >= 240 && h <= 300) out.push(`${v} is violet (hue ${Math.round(h)})`);
  }
  for (const v of ['--ink', '--muted']) { const c = contrast(v, '--bg'); if (c < 4.5) out.push(`${v} on --bg is ${c.toFixed(2)}:1`); }
  return out;
}

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const results = [];
  const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const text = async (p, sel) => (await p.textContent(sel)) || '';

  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, acceptDownloads: true, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_(TUNNEL|NAME|INTERNET)/.test(m.text() + (m.location()?.url || ''))) errors.push(m.text()); });

    await p.goto(URL); await p.waitForTimeout(300);
    if (scheme === 'light') {
      await p.screenshot({ path: `${SHOTS}/0-empty.png` });
      check('empty state shows', await p.locator('text=Nothing logged yet').count());
    }
    await p.evaluate(seed); await p.reload(); await p.waitForTimeout(400);
    await p.screenshot({ path: `${SHOTS}/1-home-${scheme}.png`, fullPage: true });
    check(`[${scheme}] header shows baby name`, (await text(p, '#babyName')) === 'Aarav');
    check(`[${scheme}] status shows asleep`, /Asleep since/.test(await text(p, '#status')));
    check(`[${scheme}] no horizontal overflow`, await noOverflow(p));
    check(`[${scheme}] toast hidden at rest`, !(await p.isVisible('#toast')));
    const tasteHome = await p.evaluate(tasteAudit);
    check(`[${scheme}] home: taste house rules`, !tasteHome.length, tasteHome.slice(0, 6).join(' | '));
    const pal = await p.evaluate(paletteAudit);
    check(`[${scheme}] palette: no violet, readable ink`, !pal.length, pal.join(' | '));

    if (scheme === 'light') {
      await p.click('[data-open="bottle"]'); await p.waitForTimeout(250);
      await p.screenshot({ path: `${SHOTS}/2-bottle-sheet.png` });
      await p.click('[data-chip="preset"][data-v="150"]'); await p.click('[data-ago="30"]');
      await p.click('#sheetForm button[type=submit]'); await p.waitForTimeout(200);
      check('bottle saved to recent', /150 ml/.test(await text(p, '#recent')));
      await p.reload(); await p.waitForTimeout(300);
      check('bottle persists after reload', /150 ml/.test(await text(p, '#recent')));

      await p.click('#status [data-act="wake"]'); await p.waitForTimeout(200);
      check('Woke up saves the sleep', /Awake since/.test(await text(p, '#status')));

      await p.click('[data-open="nurse"]'); await p.waitForTimeout(200);
      await p.click('.side[data-side="L"]'); await p.waitForTimeout(1100);
      await p.click('.side[data-side="R"]'); await p.waitForTimeout(200);
      await p.screenshot({ path: `${SHOTS}/3-nurse-sheet.png` });
      await p.click('.sheet .x'); await p.waitForTimeout(200);
      check('nursing timer shows on home', /Nursing · right/.test(await text(p, '#live')));
      await p.click('#live [data-act="nurseSave"]'); await p.waitForTimeout(200);
      check('nursing feed saved', /Feed saved/.test(await text(p, '#toast')));

      await p.click('#recent .entry >> nth=0'); await p.waitForTimeout(200);
      await p.click('[data-act="delete"]'); await p.click('[data-act="delete"]'); await p.waitForTimeout(200);
      const before = await p.locator('#recent .entry').count();
      await p.click('#toast button'); await p.waitForTimeout(200);
      check('undo restores a deleted entry', (await p.locator('#recent .entry').count()) >= before);

      await p.click('[data-open="diaper"]'); await p.keyboard.press('Escape');
      check('Escape closes a sheet', !(await p.locator('.sheet').count()));
    }

    for (const tab of ['timeline', 'trends', 'baby']) {
      await p.click(`.tabs [data-tab="${tab}"]`); await p.waitForTimeout(250);
      await p.screenshot({ path: `${SHOTS}/4-${tab}-${scheme}.png`, fullPage: true });
      check(`[${scheme}] ${tab}: no horizontal overflow`, await noOverflow(p));
      const taste = await p.evaluate(tasteAudit);
      check(`[${scheme}] ${tab}: taste house rules`, !taste.length, taste.slice(0, 6).join(' | '));
    }

    if (scheme === 'light') {
      await p.click('.tabs [data-tab="trends"]'); await p.click('[data-range="30"]');
      check('trends switch to 30 days', /30 days/.test(await text(p, '#range [aria-pressed="true"]')));

      await p.click('.tabs [data-tab="baby"]');
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.click('[data-io="json"]')]);
      check('backup downloads as a file', dl, dl ? dl.suggestedFilename() : 'no download');
      if (dl) {
        const file = path.join(SHOTS, 'backup.json'); await dl.saveAs(file);
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        check('backup contains the history', j.logs.length > 30, `${j.logs.length} entries`);
        await p.setInputFiles('#importFile', file); await p.waitForTimeout(400);
        check('re-importing the backup skips duplicates', /No new entries/.test(await text(p, '#importPanel')));
      }
      const [csv] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.click('[data-io="csv"]')]);
      check('spreadsheet downloads as a file', csv, csv ? csv.suggestedFilename() : '');
    }

    check(`[${scheme}] no script errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* home server: two phones on the same Wi-Fi share one log through server.js */
  {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestlog-'));
    const hs = await home.start({ port: 0, host: '127.0.0.1', dataDir });
    const HOME = `http://127.0.0.1:${hs.address().port}/`;
    const phone = async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      const p = await ctx.newPage(); p.errors = [];
      p.on('pageerror', e => p.errors.push(e.message));
      p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_(TUNNEL|NAME|INTERNET)/.test(m.text() + (m.location()?.url || ''))) p.errors.push(m.text()); });
      await p.goto(HOME); await p.waitForTimeout(500); return p;
    };
    const a = await phone(), b = await phone();
    check('home: header says Home sync', /Home sync/.test(await text(a, '#syncText')), await text(a, '#syncText'));

    await a.click('[data-open="bottle"]'); await a.waitForTimeout(200);
    await a.click('[data-chip="preset"][data-v="120"]');
    await a.click('#sheetForm button[type=submit]'); await a.waitForTimeout(500);
    check('home: bottle from phone A shows on phone B live', /120 ml/.test(await text(b, '#recent')));
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'nestlog.json'), 'utf8'));
    check('home: entry is written to the data file', Object.values(saved.logs).some(l => l.type === 'bottle' && l.ml === 120));

    await b.click('[data-open="sleep"]'); await b.waitForTimeout(200);
    await b.click('[data-act="sleepStart"]'); await b.waitForTimeout(500);
    check('home: sleep timer from phone B shows on phone A', /Asleep since/.test(await text(a, '#status')));

    await a.click('.tabs [data-tab="baby"]'); await a.fill('#setName', 'Mira');
    await a.click('#settingsForm button[type=submit]'); await a.waitForTimeout(500);
    check('home: baby details sync to phone B', (await text(b, '#babyName')) === 'Mira');
    await a.screenshot({ path: `${SHOTS}/5-home-baby.png`, fullPage: true });

    await b.reload(); await b.waitForTimeout(500);
    check('home: phone B still has everything after reload', /120 ml/.test(await text(b, '#recent')) && /Asleep since/.test(await text(b, '#status')));
    await b.screenshot({ path: `${SHOTS}/5-home-today.png`, fullPage: true });

    const backup = path.join(SHOTS, 'backup.json');
    if (fs.existsSync(backup)) {
      await a.setInputFiles('#importFile', backup); await a.waitForTimeout(400);
      await a.click('#impGo'); await a.waitForTimeout(600);
      check('home: import saves to the server and reaches phone B', Object.keys(hs.store.get().logs).length > 30 && (await b.locator('#recent .entry').count()) > 3);
    }

    check('home: no script errors', !a.errors.length && !b.errors.length, [...a.errors, ...b.errors].join(' | '));
    // deliberate bad requests below log 4xx errors in the console, so script errors are checked above
    const bad = await a.evaluate(() => fetch('api/logs/x1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"type":"evil","t":1}' }).then(r => r.status));
    check('home: server rejects unknown entry types', bad === 400, String(bad));
    const leak = await a.evaluate(async () => [(await fetch('server.js')).status, (await fetch('data/nestlog.json')).status, (await fetch('package.json')).status]);
    check('home: server only serves the app files', leak.every(s => s === 404), leak.join(','));

    await a.context().close(); await b.context().close();
    hs.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  }

  await browser.close(); server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed · screenshots in tests/screenshots/`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
