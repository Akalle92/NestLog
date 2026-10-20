// Which reminders are due, from the shared settings and the latest entries.
// Mirrors dueState() and checkReminders() in index.html: keep the two in step.
const MIN = 60e3;

// same output as dur() in index.html
export function dur(ms) {
  ms = Math.max(0, ms);
  const m = Math.floor(ms / MIN), h = Math.floor(m / 60);
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

// settings: { name, feedGap, diaperGap } (minutes, 0 = off); lastFeed / lastDiaper: { id, t } or null;
// nursing: true while a nursing timer runs (a feed is under way, so it isn't due)
export function dueFor(settings, lastFeed, lastDiaper, nursing, now) {
  const name = settings.name || 'Baby', out = [];
  const due = (gap, last) => !!(gap && last && now - last.t >= gap * MIN);
  if (!nursing && due(+settings.feedGap, lastFeed))
    out.push({ kind: 'feed', entry: lastFeed.id, title: `${name} may be hungry`, body: `${dur(now - lastFeed.t)} since the last feed.` });
  if (due(+settings.diaperGap, lastDiaper))
    out.push({ kind: 'diaper', entry: lastDiaper.id, title: `Time to check ${name}’s diaper`, body: `${dur(now - lastDiaper.t)} since the last diaper change.` });
  return out;
}

// A sleep timer left running past settings.sleepCheck minutes reminds the person who started it, once per timer.
// Mirrors the 'sleep' part of dueState() in index.html.
export function sleepCheckFor(settings, sleep, now) {
  const gap = +settings.sleepCheck, name = settings.name || 'Baby';
  if (!gap || !sleep || !sleep.start || now - sleep.start < gap * MIN) return null;
  return { kind: 'sleep_check', entry: `sleep-${sleep.start}`, to: sleep.by || null, title: 'Sleep timer still running', body: `Started ${dur(now - sleep.start)} ago. Did ${name} wake up?` };
}

// What the rest of the family hears when a sleep timer starts or a sleep is saved.
export function sleepNews(settings, event, who, slept) {
  const name = settings.name || 'Baby';
  if (event === 'sleep_start') return { title: `${name} fell asleep`, body: who ? `Sleep timer started by ${who}.` : 'Sleep timer started.' };
  return { title: `${name} woke up`, body: `Slept ${dur(slept)}${who ? `. Logged by ${who}` : ''}.` };
}

// Does this phone want this kind of notification now? prefs is the phone's own choice (push_subs.prefs, or
// localStorage['nestlog-notify'] in the app): {feed, diaper, sleepNews, sleepCheck: bool (missing = yes),
// quiet: [startMin, endMin] in the phone's tz, or null}. Quiet hours may wrap past midnight.
const PREF = { feed: 'feed', diaper: 'diaper', sleep_start: 'sleepNews', sleep_end: 'sleepNews', sleep_check: 'sleepCheck' };
export function localMinutes(now, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
    return +p.find(x => x.type === 'hour').value * 60 + +p.find(x => x.type === 'minute').value;
  } catch { const d = new Date(now); return d.getHours() * 60 + d.getMinutes(); }
}
export function wants(prefs, kind, now) {
  prefs = prefs || {};
  if (prefs[PREF[kind] || kind] === false) return false;
  const q = prefs.quiet;
  if (!Array.isArray(q) || q.length !== 2 || q[0] === q[1]) return true;
  const m = localMinutes(now, prefs.tz), [a, b] = q;
  return a < b ? !(m >= a && m < b) : !(m >= a || m < b);
}
