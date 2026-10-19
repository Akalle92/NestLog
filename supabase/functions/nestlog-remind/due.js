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
