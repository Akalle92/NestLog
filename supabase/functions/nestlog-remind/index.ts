// Nestlog reminders while the app is closed. pg_cron calls this every 5 minutes (see supabase/nestlog_init.sql).
// For each overdue feed or diaper it sends one Web Push to every phone in push_subs, once per entry,
// recording what was sent in push_sent. Phones that unsubscribed (404/410) are removed. It also reminds
// whoever started a sleep timer that has run past settings.sleepCheck.
// The active_sleep_push trigger calls it with {event:'sleep_start'|'sleep_end', start, actor} so the rest of
// the family hears when the baby falls asleep or wakes up (settings.sleepNotify, on unless false).
// Keys are in Vault (see supabase/nestlog_init.sql): the cron secret is made by the database, and the VAPID
// key pair is made on the first run and stored once. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are built in.
import webpush from 'npm:web-push@3.6.7';
import { dueFor, sleepCheckFor, sleepNews } from './due.js';

const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status} ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const latest = async (types: string) => (await db(`logs?select=id,t&data->>type=in.(${types})&order=t.desc&limit=1`))[0] || null;

const config = () => db('rpc/push_config', { method: 'POST', body: '{}' }).then(c => c || {});

Deno.serve(async req => {
  let c = await config();
  if (!c.nestlog_cron_secret || req.headers.get('x-cron-secret') !== c.nestlog_cron_secret) return new Response('forbidden', { status: 403 });
  if (!c.nestlog_vapid_public) { /* first run: make the key pair and store it once */
    const k = webpush.generateVAPIDKeys();
    await db('rpc/push_set_vapid', { method: 'POST', body: JSON.stringify({ pub: k.publicKey, priv: k.privateKey }) });
    c = await config();
  }
  webpush.setVapidDetails('mailto:ankurkalle@gmail.com', c.nestlog_vapid_public, c.nestlog_vapid_private);
  const test = new URL(req.url).searchParams.get('test'); // ?test=<email>: send one test notification to that person's phones
  /* only phones of people still on the family list */
  const members = await db('family_members?select=email,name'), names: Record<string, string> = {};
  members.forEach((f: any) => names[f.email] = f.name || f.email.split('@')[0]);
  const family = new Set(Object.keys(names));
  const subs = (await db('push_subs?select=endpoint,email,p256dh,auth')).filter((s: any) => family.has(s.email));
  const send = async (s: any, msg: object) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600, urgency: 'high' }); return true; }
    catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) await db(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
      else console.error('push failed', e.statusCode || '', String(e.body || e.message).slice(0, 200));
      return false;
    }
  };
  if (test) {
    let n = 0;
    for (const s of subs.filter((s: any) => s.email === test.toLowerCase())) if (await send(s, { title: 'Nestlog test', body: 'Reminders will arrive like this, even with the app closed.', tag: 'nestlog-test' })) n++;
    return Response.json({ test: n });
  }
  const [settings] = (await db('settings?select=data&id=eq.baby')).map((r: any) => r.data);
  if (!settings || !subs.length) return Response.json({ sent: 0 });
  /* push one message to some phones, once per (phone, kind, entry) */
  let sent = 0;
  const deliver = async (to: any[], kind: string, entry: string, msg: { title: string, body: string }) => {
    const done = new Set((await db(`push_sent?select=endpoint&kind=eq.${kind}&entry_id=eq.${encodeURIComponent(entry)}`)).map((r: any) => r.endpoint));
    for (const s of to) {
      if (done.has(s.endpoint)) continue;
      if (await send(s, { ...msg, tag: 'nestlog-' + kind })) {
        sent++;
        await db('push_sent', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ endpoint: s.endpoint, kind, entry_id: entry }) });
      }
    }
  };

  const ev = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  if (ev.event === 'sleep_start' || ev.event === 'sleep_end') {
    if (settings.sleepNotify === false || !(+ev.start > 0)) return Response.json({ sent: 0 });
    const actor = String(ev.actor || '').toLowerCase(), others = subs.filter((s: any) => s.email !== actor);
    if (ev.event === 'sleep_start') await deliver(others, 'sleep_start', `sleep-${ev.start}`, sleepNews(settings, 'sleep_start', names[actor] || ''));
    else {
      /* "Woke up" saves the sleep before clearing the timer; a discarded timer has no saved sleep, so nothing is sent */
      const recent = (await db('logs?select=data&data->>type=eq.sleep&order=t.desc&limit=3')).map((r: any) => r.data).find((l: any) => +l.end >= Date.now() - 3 * 60e3);
      if (recent) await deliver(others, 'sleep_end', `sleep-${ev.start}`, sleepNews(settings, 'sleep_end', names[actor] || '', recent.end - recent.t));
    }
    return Response.json({ sent, event: ev.event });
  }

  const [feed, diaper, active] = await Promise.all([latest('nurse,bottle'), latest('diaper'), db('active?select=kind,data')]);
  const nursing = active.some((a: any) => a.kind === 'nurse'), sleep = active.find((a: any) => a.kind === 'sleep')?.data;
  const due = dueFor(settings, feed, diaper, nursing, Date.now());
  for (const d of due) await deliver(subs, d.kind, d.entry, d);
  const check = sleepCheckFor(settings, sleep, Date.now());
  if (check) await deliver(subs.filter((s: any) => !check.to || s.email === check.to), check.kind, check.entry, check);
  return Response.json({ sent, due: due.map(d => d.kind).concat(check ? ['sleep_check'] : []) });
});
