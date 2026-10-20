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
