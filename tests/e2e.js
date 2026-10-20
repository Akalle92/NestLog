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

  /* Nara Baby export: every kind of row comes in, converted to Nestlog's units and fields */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL); await p.waitForTimeout(300);
    await p.click('.tabs [data-tab="baby"]');
    await p.setInputFiles('#importFile', path.join(__dirname, 'fixtures', 'nara-sample.csv')); await p.waitForTimeout(400);
    const prev = await text(p, '#importPanel');
    check('nara: preview finds 15 entries and nothing unreadable', /15 new entries/.test(prev) && !/couldn’t be read/.test(prev), prev.replace(/\s+/g, ' ').slice(0, 160));
    check('nara: offers the baby details from the export', /Test Baby, born 2026-01-15/.test(prev));
    await p.screenshot({ path: `${SHOTS}/7-nara-preview.png`, fullPage: true });
    await p.click('#impGo'); await p.waitForTimeout(400);
    const L = await p.evaluate(() => JSON.parse(localStorage.getItem('nestlog-v1')));
    const g = id => L.logs[id] || {};
    check('nara: baby details include the sex for growth curves', L.settings.name === 'Test Baby' && L.settings.sex === 'M', JSON.stringify(L.settings));
    const close = (a, b) => Math.abs(a - b) < 0.02;
    check('nara: formula bottle with brand, note and caregiver', g('nara-t-fx-bottle1').ml === 120 && g('nara-t-fx-bottle1').brand === 'Brand A' && g('nara-t-fx-bottle1').note === 'Leftover 20 ml' && g('nara-t-fx-bottle1').byName === 'Parent One');
    check('nara: ounces become ml', g('nara-t-fx-bottle2').ml === 59 && g('nara-t-fx-bottle2').content === 'breastmilk');
    check('nara: diaper colour, texture and blowout', g('nara-t-fx-diaper').kind === 'both' && g('nara-t-fx-diaper').color === 'brown yellow' && g('nara-t-fx-diaper').texture === 'mucous runny' && g('nara-t-fx-diaper').flags === 'blowout');
    check('nara: growth in lb and inches becomes kg and cm', close(g('nara-t-fx-growth').kg, 4.763) && g('nara-t-fx-growth').cm === 55.9 && g('nara-t-fx-growth').head === 38.5);
    check('nara: pumps with total only and duration only', g('nara-t-fx-pump1').tml === 40 && g('nara-t-fx-pump1').min === 25 && g('nara-t-fx-pump2').min === 20);
    check('nara: medicine with dose, temperature in °C', g('nara-t-fx-medical').name === 'Fever Reducer' && g('nara-t-fx-medical').dose === '1.25 ml' && close(g('nara-t-fx-medical-t').c, 38));
    check('nara: routine, vaccine and milestone', g('nara-t-fx-routine').type === 'medicine' && g('nara-t-fx-vaccine').name === 'Vaccine A, Vaccine B' && g('nara-t-fx-first').title === 'First smile');
    check('nara: combo feed becomes nursing plus bottle', g('nara-t-fx-combo').type === 'nurse' && g('nara-t-fx-combo').last === 'R' && g('nara-t-fx-combo-b').ml === 20);
    await p.click('.tabs [data-tab="timeline"]'); await p.waitForTimeout(200);
    check('nara: caregiver shows on the entry', /· Parent/.test(await text(p, '#timeline')));
    await p.screenshot({ path: `${SHOTS}/7-nara-timeline.png`, fullPage: true });
    await p.click('[data-filter="health"]'); await p.waitForTimeout(150);
    check('nara: health filter shows medicine, vaccine and temperature', /Fever Reducer/.test(await text(p, '#timeline')) && /Vaccine A/.test(await text(p, '#timeline')) && /°C/.test(await text(p, '#timeline')));
    await p.click('.tabs [data-tab="baby"]');
    await p.setInputFiles('#importFile', path.join(__dirname, 'fixtures', 'nara-sample.csv')); await p.waitForTimeout(400);
    check('nara: importing the same file again adds nothing', /No new entries/.test(await text(p, '#importPanel')));
    check('nara: no script errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  /* new log types: each sheet saves and shows */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL); await p.waitForTimeout(300);
    await p.click('[data-open="medicine"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${SHOTS}/8-medicine-sheet.png` });
    await p.fill('#fName', 'Vitamin D'); await p.fill('#fDose', '1 drop'); await p.click('#sheetForm button[type=submit]'); await p.waitForTimeout(200);
    await p.click('[data-open="temp"]'); await p.waitForTimeout(200);
    await p.fill('#fTemp', '37.8'); await p.click('#sheetForm button[type=submit]'); await p.waitForTimeout(200);
    await p.click('[data-open="milestone"]'); await p.waitForTimeout(200);
    check('photos: on this device the milestone sheet explains photos need the family cloud', /family cloud/.test(await text(p, '#photoBox')));
    await p.click('[data-fill="fTitle"] >> nth=0'); await p.click('#sheetForm button[type=submit]'); await p.waitForTimeout(200);
    await p.click('[data-open="medicine"]'); await p.click('[data-act="asVaccine"]'); await p.waitForTimeout(200);
    await p.fill('#fName', 'MMR'); await p.click('#sheetForm button[type=submit]'); await p.waitForTimeout(200);
    await p.click('[data-open="diaper"]'); await p.click('[data-chip="kind"][data-v="dirty"]');
    check('diaper: colour and texture appear for a dirty diaper', await p.isVisible('#dirtyBits'));
    await p.click('[data-chip="color"][data-v="yellow"]'); await p.click('[data-chip="texture"][data-v="seedy"]'); await p.click('[data-chip="flags"][data-v="rash"]');
    await p.screenshot({ path: `${SHOTS}/8-diaper-sheet.png` });
    await p.click('#sheetForm button[type=submit]'); await p.waitForTimeout(200);
    const rec = await text(p, '#recent');
    check('new types: medicine, temperature, milestone, vaccine, diaper details all saved', /Vitamin D · 1 drop/.test(rec) && /37.8 °C/.test(rec) && /First smile/.test(rec) && /MMR/.test(rec) && /yellow, seedy · Rash/.test(rec), rec.replace(/\s+/g, ' ').slice(0, 200));
    await p.click('.tabs [data-tab="trends"]'); await p.waitForTimeout(200);
    check('trends: temperature chart appears once there is a reading', /Temperature/.test(await text(p, '#trends')));
    const taste = await p.evaluate(tasteAudit);
    check('new types: taste house rules on trends', !taste.length, taste.join(' | '));
    await p.click('.tabs [data-tab="home"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${SHOTS}/8-home-new-types.png`, fullPage: true });
    check('new types: home has no horizontal overflow', await noOverflow(p));
    check('new types: no script errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  /* WHO growth percentiles on Trends */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL); await p.waitForTimeout(300);
    await p.evaluate(() => { const D = 864e5, birth = new Date(Date.now() - 120 * D); birth.setHours(12, 0, 0, 0);
      const b = birth.getTime(), iso = `${birth.getFullYear()}-${String(birth.getMonth() + 1).padStart(2, '0')}-${String(birth.getDate()).padStart(2, '0')}`;
      localStorage.setItem('nestlog-v1', JSON.stringify({ settings: { name: 'Kabir', birth: iso, vol: 'ml', wt: 'kg' }, active: {}, logs: {
        g1: { type: 'growth', t: b + 2 * 3600e3, kg: 3.3, cm: 50, head: 34.5 }, g2: { type: 'growth', t: b + 60 * D, kg: 5.0, cm: 58 }, g3: { type: 'growth', t: Date.now() - 3600e3, kg: 6.0, cm: 62, head: 41 } } })); });
    await p.reload(); await p.waitForTimeout(300);
    await p.click('.tabs [data-tab="trends"]'); await p.waitForTimeout(200);
    check('who: asks for boy or girl before showing percentiles', /Choose boy or girl/.test(await text(p, '#trends')));
    await p.click('.tabs [data-tab="baby"]'); await p.selectOption('#setSex', 'M'); await p.click('#settingsForm button[type=submit]'); await p.waitForTimeout(200);
    await p.click('.tabs [data-tab="trends"]'); await p.waitForTimeout(200);
    const t1 = await text(p, '#trends');
    check('who: 6.0 kg at 120 days for a boy is about the 10th percentile', /(9th|10th|11th) percentile/.test(t1), (t1.match(/\w+ percentile/) || [''])[0]);
    check('who: draws the five WHO reference curves', (await p.locator('.chart.k-growth svg path[stroke="var(--line-strong)"]').count()) === 5);
    await p.screenshot({ path: `${SHOTS}/11-who-weight.png`, fullPage: true });
    await p.click('[data-gm="head"]'); await p.waitForTimeout(150);
    const t2 = await text(p, '#trends');
    check('who: head size switch shows a head percentile', /Head/.test(t2) && /41 cm/.test(t2) && /percentile/.test(t2));
    await p.click('[data-gm="cm"]'); await p.waitForTimeout(150);
    check('who: length switch shows length', /62 cm/.test(await text(p, '#trends')));
    await p.click('[data-gm="kg"]'); await p.click('[data-std="cdc"]'); await p.waitForTimeout(200);
    const tc = await text(p, '#trends');
    check('charts: CDC puts 6.0 kg at 120 days for a boy at about the 20th percentile', /(19th|20th|21st) percentile/.test(tc) && /US doctors use the WHO charts under 2/.test(tc), (tc.match(/\w+ percentile/) || [''])[0]);
    check('charts: the chart choice is saved for everyone', await p.evaluate(() => JSON.parse(localStorage.getItem('nestlog-v1')).settings.chart) === 'cdc');
    await p.screenshot({ path: `${SHOTS}/11-cdc.png`, fullPage: true });
    await p.click('[data-std="iap"]'); await p.waitForTimeout(200);
    const ti = await text(p, '#trends');
    check('charts: India (IAP) uses the WHO curves and says so', /(9th|10th|11th) percentile/.test(ti) && /IAP uses the WHO charts from birth to 5 years/.test(ti));
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('nestlog-v1')), b = new Date(Date.now() - 1100 * 864e5);
      d.settings.birth = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-${String(b.getDate()).padStart(2, '0')}`; d.settings.chart = 'who';
      d.logs = { g9: { type: 'growth', t: Date.now() - 36e5, kg: 14.3 } }; localStorage.setItem('nestlog-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(300); await p.click('.tabs [data-tab="trends"]'); await p.waitForTimeout(200);
    check('charts: WHO now covers 3-year-olds', /\d+(st|nd|rd|th) percentile/.test(await text(p, '#trends')));
    await p.click('[data-std="cdc"]'); await p.waitForTimeout(200);
    check('charts: past the CDC infant charts it says what they cover', /These curves cover 0–2 years/.test(await text(p, '#trends')));
    await p.screenshot({ path: `${SHOTS}/11-who-length.png`, fullPage: true });
    check('who: no horizontal overflow', await noOverflow(p));
    const taste = await p.evaluate(tasteAudit);
    check('who: taste house rules', !taste.length, taste.join(' | '));
    check('who: no script errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  /* doctor report: summary of the last weeks, prints without the app around it */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL); await p.evaluate(seed);
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('nestlog-v1')), n = Date.now();
      d.settings.sex = 'M';
      d.logs.m1 = { type: 'medicine', t: n - 3 * 864e5, name: 'Vitamin D', dose: '1 drop' };
      d.logs.v1 = { type: 'vaccine', t: n - 5 * 864e5, name: 'DTaP' };
      d.logs.x1 = { type: 'diaper', t: n - 2 * 864e5, kind: 'dirty', color: 'green', flags: 'rash', note: '<b>check</b> at visit' };
      d.logs.ms = { type: 'milestone', t: n - 4 * 864e5, title: 'First smile' };
      localStorage.setItem('nestlog-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(300);
    await p.click('.tabs [data-tab="baby"]'); await p.click('[data-rw="1"]'); await p.click('[data-act="report"]'); await p.waitForTimeout(300);
    const r = await text(p, '#report');
    check('report: opens over the app with the baby and the range', await p.isVisible('#report') && !(await p.isVisible('#tabbar')) && /Aarav/.test(r) && /1 week/.test(r));
    check('report: feeds, sleep and diapers per day', /feeds per day/.test(r) && /hours per day/.test(r) && /wet per day/.test(r) && /longest stretch/.test(r));
    check('report: growth with WHO percentile', /4.45 kg/.test(r) && /WHO \w+ percentile/.test(r), (r.match(/Weight.{0,80}/) || [''])[0]);
    check('report: medicine, vaccine, milestone and diaper flags listed', /Vitamin D/.test(r) && /DTaP/.test(r) && /First smile/.test(r) && /green 1/.test(r) && /rash 1/.test(r));
    check('report: notes are shown as text, not HTML', /<b>check<\/b> at visit/.test(r) && !(await p.locator('#report b:text("check")').count()));
    check('report: no horizontal overflow', await noOverflow(p));
    const taste = await p.evaluate(tasteAudit);
    check('report: taste house rules', !taste.length, taste.join(' | '));
    await p.screenshot({ path: `${SHOTS}/12-report.png`, fullPage: true });
    await p.emulateMedia({ media: 'print' });
    check('report: printing hides the buttons and the app', !(await p.isVisible('#report .rbar')) && !(await p.isVisible('#top')));
    await p.pdf({ path: `${SHOTS}/12-report.pdf`, format: 'A4' }).catch(() => {});
    await p.emulateMedia({ media: 'screen' });
    await p.click('[data-act="reportClose"]'); await p.waitForTimeout(200);
    check('report: Back returns to the app', !(await p.isVisible('#report')) && await p.isVisible('#tabbar'));
    check('report: no script errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  /* appearance: each phone picks Match phone / Light / Dark for itself */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL); await p.evaluate(seed); await p.reload(); await p.waitForTimeout(300);
    const bg = () => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    const light = await bg();
    await p.click('.tabs [data-tab="baby"]'); await p.click('[data-theme-pick="dark"]'); await p.waitForTimeout(150);
    check('appearance: Dark turns this phone dark while the phone is in light mode', (await bg()) === '#121413' && (await p.getAttribute('meta[name="theme-color"]', 'content')) === '#121413', await bg());
    await p.reload(); await p.waitForTimeout(300);
    check('appearance: the choice stays after reopening', (await bg()) === '#121413' && await p.evaluate(() => localStorage.getItem('nestlog-theme')) === 'dark');
    await p.click('.tabs [data-tab="baby"]'); await p.waitForTimeout(150);
    await p.screenshot({ path: `${SHOTS}/15-this-phone-dark.png`, fullPage: true });
    for (const tab of ['home', 'trends', 'baby']) {
      await p.click(`.tabs [data-tab="${tab}"]`); await p.waitForTimeout(150);
      const t = await p.evaluate(tasteAudit), pal = await p.evaluate(paletteAudit);
      check(`appearance: forced dark ${tab} keeps the house rules`, !t.length && !pal.length, t.concat(pal).join(' | '));
    }
    await p.click('[data-theme-pick="auto"]'); await p.waitForTimeout(150);
    check('appearance: Match phone follows the phone again', (await bg()) === light && !(await p.evaluate(() => localStorage.getItem('nestlog-theme'))));
    await p.emulateMedia({ colorScheme: 'dark' }); await p.click('[data-theme-pick="light"]'); await p.waitForTimeout(150);
    check('appearance: Light stays light when the phone is in dark mode', (await bg()) === light);
    check('appearance: no script errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  /* reminders: due state on Today, one notification per gap */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => {
      window.__notes = [];
      window.Notification = class { constructor(t, o) { window.__notes.push(t); } static get permission() { return localStorage.getItem('fake-perm') || 'default'; }
        static async requestPermission() { localStorage.setItem('fake-perm', 'granted'); return 'granted'; } };
    });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL); await p.waitForTimeout(300);
    await p.evaluate(() => { const n = Date.now(), H = 36e5;
      localStorage.setItem('nestlog-v1', JSON.stringify({ settings: { name: 'Mira', birth: '', vol: 'ml', wt: 'kg' }, active: {},
        logs: { b1: { type: 'bottle', t: n - 3.2 * H, ml: 90, content: 'formula' }, d1: { type: 'diaper', t: n - 1 * H, kind: 'wet' } } })); });
    await p.reload(); await p.waitForTimeout(300);
    check('reminders: nothing is due while reminders are off', !(await p.locator('.fact.due').count()));
    await p.click('.tabs [data-tab="baby"]');
    await p.selectOption('#setFeedGap', '180'); await p.waitForTimeout(200);
    await p.selectOption('#setDiaperGap', '180'); await p.waitForTimeout(200);
    check('reminders: offers to allow notifications', await p.isVisible('[data-act="allowNotify"]'));
    await p.screenshot({ path: `${SHOTS}/9-reminders.png`, fullPage: true });
    await p.click('[data-act="allowNotify"]'); await p.waitForTimeout(300);
    await p.click('.tabs [data-tab="home"]'); await p.waitForTimeout(200);
    check('reminders: overdue feed shows as due on Today', /Feed due/.test(await text(p, '#status')) && (await p.locator('.fact.k-feed.due').count()) === 1);
    check('reminders: diaper within its gap is not due', (await p.locator('.fact.k-diaper.due').count()) === 0);
    await p.screenshot({ path: `${SHOTS}/9-feed-due.png` });
    await p.waitForTimeout(1200);
    let notes = await p.evaluate(() => window.__notes);
    check('reminders: one notification for the overdue feed', notes.length === 1 && /Mira may be hungry/.test(notes[0]), JSON.stringify(notes));
    await p.reload(); await p.waitForTimeout(1500);
    notes = await p.evaluate(() => window.__notes);
    check('reminders: not repeated for the same feed after reopening', notes.length === 0, JSON.stringify(notes));
    await p.click('[data-open="bottle"]'); await p.click('#sheetForm button[type=submit]'); await p.waitForTimeout(300);
    check('reminders: logging a feed clears the due state', !(await p.locator('.fact.k-feed.due').count()));
    /* a sleep timer left running past "Check sleep timer after" gives one nudge */
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('nestlog-v1')); d.active = { sleep: { start: Date.now() - 2.5 * 36e5, by: null } }; localStorage.setItem('nestlog-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(300);
    await p.click('.tabs [data-tab="baby"]'); await p.selectOption('#setSleepCheck', '120'); await p.waitForTimeout(1300);
    notes = await p.evaluate(() => window.__notes);
    check('reminders: a forgotten sleep timer gives one nudge', notes.filter(n => n === 'Sleep timer still running').length === 1, JSON.stringify(notes));
    check('reminders: the sleep check setting is saved', await p.evaluate(() => JSON.parse(localStorage.getItem('nestlog-v1')).settings.sleepCheck) === 120);
    check('reminders: sleep news is a family-cloud setting', !(await p.isVisible('#sleepNotifyField')));
    await p.reload(); await p.waitForTimeout(1500);
    check('reminders: the sleep nudge is not repeated', !(await p.evaluate(() => window.__notes.length)));
    const taste = await p.evaluate(tasteAudit);
    check('reminders: taste house rules', !taste.length, taste.join(' | '));
    check('reminders: no script errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  /* this phone's notification choices: kinds it hears and quiet hours */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => {
      window.__notes = [];
      window.Notification = class { constructor(t) { window.__notes.push(t); } static get permission() { return 'granted'; } static async requestPermission() { return 'granted'; } };
    });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL); await p.waitForTimeout(200);
    await p.evaluate(() => { const n = Date.now(), H = 36e5;
      localStorage.setItem('nestlog-v1', JSON.stringify({ settings: { name: 'Mira', birth: '', vol: 'ml', wt: 'kg', feedGap: 120 }, active: {},
        logs: { b1: { type: 'bottle', t: n - 3 * H, ml: 90, content: 'formula' } } }));
      localStorage.setItem('nestlog-notify', JSON.stringify({ feed: false })); });
    await p.reload(); await p.waitForTimeout(1500);
    check('notify: with Feeds off on this phone, an overdue feed stays quiet', !(await p.evaluate(() => window.__notes.length)));
    await p.click('.tabs [data-tab="baby"]'); await p.waitForTimeout(150);
    check('notify: the chip shows Feeds off', (await p.getAttribute('[data-npref="feed"]', 'aria-pressed')) === 'false');
    await p.evaluate(() => { const d = new Date(), m = d.getHours() * 60 + d.getMinutes(); localStorage.setItem('nestlog-notify', JSON.stringify({ quiet: [(m + 1430) % 1440, (m + 10) % 1440] })); });
    await p.reload(); await p.waitForTimeout(1500);
    check('notify: during quiet hours nothing fires', !(await p.evaluate(() => window.__notes.length)));
    await p.click('.tabs [data-tab="baby"]'); await p.selectOption('#setQuiet', 'null'); await p.waitForTimeout(100);
    await p.click('.tabs [data-tab="home"]'); await p.evaluate(() => localStorage.removeItem('nestlog-reminded')); await p.reload(); await p.waitForTimeout(1500);
    check('notify: once quiet hours are off, the overdue feed is announced', (await p.evaluate(() => window.__notes)).some(n => /Mira may be hungry/.test(n)));
    await p.click('.tabs [data-tab="baby"]'); await p.click('[data-npref="diaper"]'); await p.waitForTimeout(100);
    check('notify: tapping a chip saves it for this phone', await p.evaluate(() => JSON.parse(localStorage.getItem('nestlog-notify')).diaper === false));
    await p.screenshot({ path: `${SHOTS}/16-notify-prefs.png`, fullPage: true });
    const taste = await p.evaluate(tasteAudit);
    check('notify: taste house rules', !taste.length, taste.join(' | '));
    check('notify: no script errors', !errors.length, errors.join(' | '));
    await ctx.close();
    const { wants } = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'nestlog-remind', 'due.js')).href);
    const at = (h, m) => Date.UTC(2026, 9, 20, h, m); // times in UTC
    check('push: a phone can turn a kind off', !wants({ feed: false }, 'feed', at(12, 0)) && wants({ feed: false }, 'diaper', at(12, 0)) && !wants({ sleepNews: false }, 'sleep_end', at(12, 0)) && wants(null, 'sleep_check', at(12, 0)));
    check('push: quiet hours wrap past midnight', !wants({ quiet: [1320, 420], tz: 'UTC' }, 'feed', at(23, 30)) && !wants({ quiet: [1320, 420], tz: 'UTC' }, 'feed', at(6, 59)) && wants({ quiet: [1320, 420], tz: 'UTC' }, 'feed', at(7, 0)));
    check('push: quiet hours use the phone’s time zone', !wants({ quiet: [1320, 420], tz: 'Asia/Kolkata' }, 'feed', at(17, 0)) && wants({ quiet: [1320, 420], tz: 'Asia/Kolkata' }, 'feed', at(12, 0)));
  }

  /* service worker: after one visit the app opens with no connection */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(URL + '?sw');
    await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(400);
    check('offline: service worker controls the page', await p.evaluate(() => !!navigator.serviceWorker.controller));
    await ctx.setOffline(true);
    await p.reload(); await p.waitForTimeout(500);
    check('offline: app opens with no connection', (await p.locator('#tabs button').count()) === 4);
    await ctx.setOffline(false); await ctx.close();
  }

  /* push: a message pushed by the server reaches the service worker, which shows it as a notification.
     Headless Chromium blocks notifications outright, so a blocked showNotification() call from sw.js counts as shown. */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(URL + '?sw'); await p.evaluate(() => navigator.serviceWorker.ready);
    const cdp = await ctx.newCDPSession(p); let regId = null; const swErrors = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', e => { const r = e.registrations.find(x => !x.isDeleted); if (r) regId = r.registrationId; });
    cdp.on('ServiceWorker.workerErrorReported', e => swErrors.push(e.errorMessage));
    await cdp.send('ServiceWorker.enable'); await p.waitForTimeout(300);
    if (regId) await cdp.send('ServiceWorker.deliverPushMessage', { origin: URL.slice(0, -1), registrationId: regId, data: JSON.stringify({ title: 'Mira may be hungry', body: '3h 5m since the last feed.', tag: 'nestlog-feed' }) });
    await p.waitForTimeout(600);
    const shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title));
    check('push: service worker shows the pushed reminder', shown.includes('Mira may be hungry') || swErrors.some(e => /showNotification/.test(e.errorMessage) && /sw\.js/.test(e.sourceURL)), JSON.stringify({ shown, swErrors }));
    await ctx.close();
    const { dueFor } = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'nestlog-remind', 'due.js')).href);
    const n = Date.now(), H = 36e5, set = { name: 'Mira', feedGap: 180, diaperGap: 0 };
    const d1 = dueFor(set, { id: 'f1', t: n - 3.1 * H }, { id: 'd1', t: n - 9 * H }, false, n);
    check('push: server reminds about an overdue feed, in the app’s words', d1.length === 1 && d1[0].kind === 'feed' && d1[0].entry === 'f1' && d1[0].title === 'Mira may be hungry' && d1[0].body === '3h 6m since the last feed.', JSON.stringify(d1));
    const { sleepCheckFor, sleepNews } = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'nestlog-remind', 'due.js')).href);
    const sc = sleepCheckFor({ name: 'Mira', sleepCheck: 180 }, { start: n - 3.25 * H, by: 'a@x.com' }, n);
    check('push: a sleep timer past its check reminds whoever started it', sc && sc.to === 'a@x.com' && sc.entry === `sleep-${n - 3.25 * H}` && sc.body === 'Started 3h 15m ago. Did Mira wake up?', JSON.stringify(sc));
    check('push: no sleep check before the gap or when off', !sleepCheckFor({ sleepCheck: 180 }, { start: n - 2 * H }, n) && !sleepCheckFor({ sleepCheck: 0 }, { start: 0 }, n));
    check('push: family hears sleep start and end', sleepNews({ name: 'Mira' }, 'sleep_start', 'Bhuvana').title === 'Mira fell asleep' && sleepNews({ name: 'Mira' }, 'sleep_end', 'Ankur', 100 * 6e4).body === 'Slept 1h 40m. Logged by Ankur.');
    check('push: nothing due within the gap, while nursing, or with reminders off', !dueFor(set, { id: 'f1', t: n - 2 * H }, null, false, n).length && !dueFor(set, { id: 'f1', t: n - 4 * H }, null, true, n).length && !dueFor({ feedGap: 0, diaperGap: 0 }, { id: 'f', t: 0 }, { id: 'd', t: 0 }, false, n).length);
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

  /* cloud mode: GitHub Pages + Supabase, faked here (auth, REST, realtime socket) so no network is needed */
  {
    const fake = { family: [{ email: 'a@x.com', name: 'Ankur' }, { email: 'b@x.com', name: 'Priya' }], logs: {}, active: {}, settings: {}, photos: {}, pushSubs: {}, sockets: new Set() };
    const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    const reply = (route, status, body) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });
    const push = (table, type, record, old) => { const msg = JSON.stringify({ topic: 'realtime:nestlog', event: 'postgres_changes', payload: { ids: [1], data: { schema: 'public', table, type, record, old_record: old || {} } }, ref: null });
      fake.sockets.forEach(ws => { try { ws.send(msg); } catch {} }); };
    const who = req => (req.headers().authorization || '').replace('Bearer tok-', '');
    async function cloudRoutes(ctx) {
      await ctx.route('https://fcthxmkmkqthhkyeymjc.supabase.co/auth/v1/**', async route => {
        const req = route.request(); if (req.method() === 'OPTIONS') return reply(route, 204);
        const path = new globalThis.URL(req.url()).pathname.replace('/auth/v1/', ''), body = req.postDataJSON() || {};
        if (path === 'otp' && body.email === 'slow@x.com') return reply(route, 504, { msg: 'context deadline exceeded' });
        if (path === 'otp') return fake.family.some(f => f.email === body.email) ? reply(route, 200, {}) : reply(route, 403, { msg: "This email isn't on the family list." });
        if (path === 'verify') return body.token === '123456' ? reply(route, 200, { access_token: 'tok-' + body.email, refresh_token: 'r-' + body.email, expires_in: 3600, user: { email: body.email } }) : reply(route, 403, { msg: 'Token has expired or is invalid', error_code: 'otp_expired' });
        if (path === 'token') { const e = String(body.refresh_token).slice(2); return reply(route, 200, { access_token: 'tok-' + e, refresh_token: 'r-' + e, expires_in: 3600, user: { email: e } }); }
        return reply(route, 204);
      });
      await ctx.route('https://fcthxmkmkqthhkyeymjc.supabase.co/rest/v1/**', async route => {
        const req = route.request(); if (req.method() === 'OPTIONS') return reply(route, 204);
        if (fake.offline) return route.abort('internetdisconnected');
        if (!fake.family.some(f => f.email === who(req))) return reply(route, 403, { message: 'row-level security' });
        const u = new globalThis.URL(req.url()), table = u.pathname.split('/').pop(), m = req.method(), q = u.searchParams;
        const eq = k => (q.get(k) || '').replace(/^eq\./, '');
        if (table === 'family_members') {
          if (m === 'GET') return reply(route, 200, fake.family);
          if (m === 'POST') { const r = req.postDataJSON(); if (fake.family.some(f => f.email === r.email)) return reply(route, 409, { code: '23505' }); fake.family.push({ email: r.email, name: r.name || '' }); return reply(route, 201); }
          if (m === 'DELETE') { const e = decodeURIComponent(eq('email')); if (fake.family.length <= 1) return reply(route, 400, { message: 'The family list needs at least one person.' }); fake.family = fake.family.filter(f => f.email !== e); return reply(route, 204); }
        }
        if (table === 'push_public_key') return reply(route, 200, 'BOXUU2s0wvox2kwCejyqHvfbB87Ha-giBLysxZLfOH7nYO4EFlT1CwE_sqaM8uoFeQO8Vc4RTLU_iZuv0Chs4x4');
        if (table === 'push_subs') {
          if (m === 'POST') { const r = req.postDataJSON(); if (r.email !== who(req)) return reply(route, 403, {}); fake.pushSubs[r.endpoint] = r; return reply(route, 201); }
          if (m === 'DELETE') { delete fake.pushSubs[decodeURIComponent(eq('endpoint'))]; return reply(route, 204); }
        }
        if (table === 'logs') {
          if (m === 'GET') { const off = +q.get('offset') || 0, lim = +q.get('limit') || 1000;
            return reply(route, 200, Object.entries(fake.logs).sort((x, y) => y[1].t - x[1].t).slice(off, off + lim).map(([id, data]) => ({ id, data }))); }
          if (m === 'POST') { for (const r of [].concat(req.postDataJSON())) { const had = !!fake.logs[r.id]; fake.logs[r.id] = r.data; push('logs', had ? 'UPDATE' : 'INSERT', r); } return reply(route, 201); }
          if (m === 'DELETE') { const id = decodeURIComponent(eq('id')); delete fake.logs[id]; push('logs', 'DELETE', null, { id }); return reply(route, 204); }
        }
        if (table === 'active') {
          if (m === 'GET') return reply(route, 200, Object.entries(fake.active).map(([kind, data]) => ({ kind, data })));
          if (m === 'POST') { const r = req.postDataJSON(); fake.active[r.kind] = r.data; push('active', 'INSERT', r); return reply(route, 201); }
          if (m === 'DELETE') { const kind = eq('kind'); delete fake.active[kind]; push('active', 'DELETE', null, { kind }); return reply(route, 204); }
        }
        if (table === 'settings') {
          if (m === 'GET') return reply(route, 200, fake.settings.data ? [{ data: fake.settings.data }] : []);
          if (m === 'POST') { const r = req.postDataJSON(); fake.settings = r; push('settings', 'UPDATE', r); return reply(route, 201); }
        }
        return reply(route, 404, {});
      });
      await ctx.route('https://fcthxmkmkqthhkyeymjc.supabase.co/storage/v1/**', async route => {
        const req = route.request(); if (req.method() === 'OPTIONS') return reply(route, 204);
        if (fake.offline) return route.abort('internetdisconnected');
        if (!fake.family.some(f => f.email === who(req))) return reply(route, 403, { message: 'row-level security' });
        const m = req.method(), name = decodeURIComponent(new globalThis.URL(req.url()).pathname.split('/').pop());
        if (m === 'POST') { fake.photos[name] = req.postDataBuffer(); return reply(route, 200, { Key: 'photos/' + name }); }
        if (m === 'GET') return fake.photos[name] ? route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'image/jpeg' }, body: fake.photos[name] }) : reply(route, 404, {});
        if (m === 'DELETE') { delete fake.photos[name]; return reply(route, 200, {}); }
        return reply(route, 404, {});
      });
      await ctx.routeWebSocket(/realtime\/v1\/websocket/, ws => {
        fake.sockets.add(ws);
        ws.onMessage(raw => { const m = JSON.parse(String(raw));
          if (m.event === 'phx_join') ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, join_ref: m.join_ref, payload: { status: 'ok', response: { postgres_changes: [] } } })); });
        ws.onClose(() => fake.sockets.delete(ws));
      });
    }
    const phone = async (scheme, init) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true, isMobile: true });
      await cloudRoutes(ctx);
      if (init) await ctx.addInitScript(init.fn, init.arg);
      const p = await ctx.newPage(); p.errors = [];
      p.on('pageerror', e => p.errors.push(e.message));
      p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_(TUNNEL|NAME|INTERNET)|status of (40[1349]|504)/.test(m.text() + (m.location()?.url || ''))) p.errors.push(m.text()); });
      await p.goto(URL + '?cloud'); await p.waitForTimeout(500); return p;
    };
    let errorsFromPush = [];
    const session = { fn: email => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('nestlog-session', JSON.stringify({ access: 'tok-' + email, refresh: 'r-' + email, exp: Date.now() + 36e5, email })); } }, arg: 'b@x.com' };

    const a = await phone('light');
    check('cloud: sign-in screen shows first', await a.isVisible('#signinForm') && !(await a.isVisible('#tabbar')));
    check('cloud: sign-in has no horizontal overflow', await noOverflow(a));
    const tasteSignin = await a.evaluate(tasteAudit);
    check('cloud: sign-in follows taste house rules', !tasteSignin.length, tasteSignin.join(' | '));
    await a.screenshot({ path: `${SHOTS}/6-cloud-signin.png` });
    await a.fill('#siEmail', 'stranger@x.com'); await a.click('#signinForm button[type=submit]'); await a.waitForTimeout(300);
    check('cloud: unknown email is turned away', /family list/.test(await text(a, '#signinForm')));
    await a.fill('#siEmail', 'slow@x.com'); await a.click('#signinForm button[type=submit]'); await a.waitForTimeout(300);
    check('cloud: a slow email service says to wait, not to check the connection', /didn’t send in time/.test(await text(a, '#signinForm')));
    await a.fill('#siEmail', 'a@x.com'); await a.click('#signinForm button[type=submit]'); await a.waitForTimeout(300);
    check('cloud: code step shows', await a.isVisible('#siCode'));
    await a.fill('#siCode', '000000'); await a.click('#signinForm button[type=submit]'); await a.waitForTimeout(300);
    check('cloud: wrong code shows an error', /didn’t match/.test(await text(a, '#signinForm')));
    await a.fill('#siCode', '123456'); await a.click('#signinForm button[type=submit]'); await a.waitForTimeout(700);
    check('cloud: signed in, header says Family sync', /Family sync/.test(await text(a, '#syncText')), await text(a, '#syncText'));

    const b = await phone('dark', session);
    check('cloud: second phone stays signed in', /Family sync/.test(await text(b, '#syncText')), await text(b, '#syncText'));
    await a.click('[data-open="bottle"]'); await a.waitForTimeout(200);
    await a.click('[data-chip="preset"][data-v="120"]');
    await a.click('#sheetForm button[type=submit]'); await a.waitForTimeout(500);
    check('cloud: bottle from phone A shows on phone B live', /120 ml/.test(await text(b, '#recent')));
    check('cloud: phone B shows who logged it', /Ankur/.test(await text(b, '#recent')));
    check('cloud: your own entries show your name too', /Ankur/.test(await text(a, '#recent')));
    check('cloud: entry stored with the right shape', Object.values(fake.logs).some(l => l.type === 'bottle' && l.ml === 120 && l.by === 'a@x.com'));
    await b.screenshot({ path: `${SHOTS}/6-cloud-today-dark.png`, fullPage: true });
    check('cloud: today has no horizontal overflow', await noOverflow(b));

    await b.click('[data-open="sleep"]'); await b.waitForTimeout(200);
    await b.click('[data-act="sleepStart"]'); await b.waitForTimeout(500);
    check('cloud: sleep timer from phone B shows on phone A', /Asleep since/.test(await text(a, '#status')));

    await a.click('#recent .entry >> nth=0'); await a.waitForTimeout(200);
    await a.click('[data-act="delete"]'); await a.click('[data-act="delete"]'); await a.waitForTimeout(500);
    check('cloud: delete reaches phone B', !/120 ml/.test(await text(b, '#recent')));

    const c = await phone('light', { fn: () => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
      localStorage.setItem('nestlog-session', JSON.stringify({ access: 'tok-a@x.com', refresh: 'r-a@x.com', exp: Date.now() + 36e5, email: 'a@x.com' }));
      const n = Date.now(); localStorage.setItem('nestlog-v1', JSON.stringify({ logs: { old1: { type: 'diaper', t: n - 9e6, kind: 'wet' }, old2: { type: 'bottle', t: n - 8e6, ml: 60, content: 'formula' }, old3: { type: 'diaper', t: n - 7e6, kind: 'dirty' } } })); } });
    await c.click('.tabs [data-tab="baby"]'); await c.waitForTimeout(200);
    check('cloud: offers to upload this phone’s old entries', /Upload 3 entries/.test(await text(c, '#shareActions')));
    await c.screenshot({ path: `${SHOTS}/6-cloud-baby.png`, fullPage: true });
    check('cloud: sharing buttons fit inside their card', await c.evaluate(() => [...document.querySelectorAll('#shareActions .btn')].every(x => x.getBoundingClientRect().right <= x.closest('.card').getBoundingClientRect().right + 0.5)));
    await c.click('[data-act="uploadLocal"]'); await c.waitForTimeout(600);
    check('cloud: old entries uploaded and shared', ['old1', 'old2', 'old3'].every(id => fake.logs[id]) && !(await c.locator('[data-act="uploadLocal"]').count()));

    /* offline: the entry shows at once, waits in the outbox, and syncs in order when the connection is back */
    fake.offline = true;
    await a.click('[data-open="bottle"]'); await a.waitForTimeout(200);
    await a.click('[data-chip="preset"][data-v="150"]'); await a.click('#sheetForm button[type=submit]'); await a.waitForTimeout(400);
    check('offline: entry shows right away on this phone', /150 ml/.test(await text(a, '#recent')));
    check('offline: header says it is waiting', /Offline · 1 waiting/.test(await text(a, '#syncText')), await text(a, '#syncText'));
    check('offline: not sent yet', !Object.values(fake.logs).some(l => l.ml === 150));
    await a.reload(); await a.waitForTimeout(600);
    check('offline: still shown after reopening the app', /150 ml/.test(await text(a, '#recent')));
    fake.offline = false;
    await a.evaluate(() => window.dispatchEvent(new Event('online'))); await a.waitForTimeout(800);
    check('offline: syncs when back online', Object.values(fake.logs).some(l => l.ml === 150) && !/waiting/.test(await text(a, '#syncText')), await text(a, '#syncText'));
    check('offline: other phone gets it after the sync', /150 ml/.test(await text(b, '#recent')));

    /* milestone photos: shrunk, uploaded to private storage, shown on the other phone, removed with the entry's photo */
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAG0lEQVR4nGP4z8DwnwEZMDEwMDCiCzAwMDAAAG0QAwVfNk2nAAAAAElFTkSuQmCC', 'base64');
    await a.click('.tabs [data-tab="home"]'); await a.click('[data-open="milestone"]'); await a.waitForTimeout(200);
    await a.fill('#fTitle', 'First bath');
    await a.setInputFiles('#fPhoto', { name: 'bath.png', mimeType: 'image/png', buffer: png }); await a.waitForTimeout(400);
    check('photos: preview shows in the milestone sheet', await a.locator('#photoBox img').count() === 1);
    await a.screenshot({ path: `${SHOTS}/13-photo-sheet.png` });
    await a.click('#sheetForm button[type=submit]'); await a.waitForTimeout(600);
    const ms = Object.entries(fake.logs).find(([, l]) => l.title === 'First bath') || [];
    check('photos: uploaded as a JPEG named after the entry', ms[1] && ms[1].photo === ms[0] + '.jpg' && fake.photos[ms[1].photo] && fake.photos[ms[1].photo][0] === 0xff, JSON.stringify(ms[1] || {}));
    await b.waitForTimeout(400);
    check('photos: the other phone shows the thumbnail', await b.evaluate(() => [...document.querySelectorAll('#recent img.thumb')].some(i => i.src.startsWith('blob:') && i.complete)));
    await b.screenshot({ path: `${SHOTS}/13-photo-recent.png` });
    await a.click(`#recent [data-edit="${ms[0]}"]`); await a.waitForTimeout(300);
    check('photos: editing the milestone shows the photo', await a.evaluate(() => !!document.querySelector('#photoBox img')?.src));
    await a.click('[data-act="photoRemove"]'); await a.click('#sheetForm button[type=submit]'); await a.waitForTimeout(500);
    check('photos: removing the photo deletes it from storage', !fake.photos[ms[0] + '.jpg'] && !fake.logs[ms[0]].photo);
    await a.click('[data-open="diaper"]'); await a.waitForTimeout(200);
    check('photos: every kind of entry offers a photo', await a.isVisible('#photoBox label[for="fPhoto"]'));
    await a.setInputFiles('#fPhoto', { name: 'diaper.png', mimeType: 'image/png', buffer: png }); await a.waitForTimeout(400);
    await a.click('[data-chip="kind"][data-v="dirty"]'); await a.click('#sheetForm button[type=submit]'); await a.waitForTimeout(600);
    const dp = Object.entries(fake.logs).find(([, l]) => l.type === 'diaper' && l.photo) || [];
    check('photos: a diaper photo is uploaded and shown on the other phone', dp[1] && fake.photos[dp[1].photo] && await b.evaluate(id => !!document.querySelector(`[data-edit="${id}"] img.thumb`), dp[0]));
    await a.click(`#recent [data-edit="${dp[0]}"]`); await a.waitForTimeout(300);
    await a.click('[data-act="delete"]'); await a.click('[data-act="delete"]'); await a.waitForTimeout(300);
    check('photos: the photo stays while Undo is possible', !!fake.photos[dp[0] + '.jpg']);
    await a.waitForTimeout(7500);
    check('photos: deleting the entry removes its photo once Undo has passed', !fake.photos[dp[0] + '.jpg']);

    /* family list: add someone, remove them with a second tap, undo */
    await a.click('.tabs [data-tab="baby"]'); await a.waitForTimeout(200);
    check('family: list shows both members', /Ankur \(you\)/.test(await text(a, '#familyList')) && /Priya/.test(await text(a, '#familyList')));
    await a.fill('#famName', 'Nani'); await a.fill('#famEmail', 'Nani@X.com'); await a.click('#familyForm button[type=submit]'); await a.waitForTimeout(400);
    check('family: adding someone puts them on the list', fake.family.some(f => f.email === 'nani@x.com' && f.name === 'Nani') && /Nani/.test(await text(a, '#familyList')));
    await a.fill('#famEmail', 'b@x.com'); await a.click('#familyForm button[type=submit]'); await a.waitForTimeout(300);
    check('family: adding someone already there says so', /already on the family list/.test(await text(a, '#toast')));
    await a.screenshot({ path: `${SHOTS}/10-family.png`, fullPage: true });
    const rm = a.locator('[data-act="famRemove"][data-email="nani@x.com"]');
    await rm.click(); await a.waitForTimeout(100);
    check('family: remove asks for a second tap', /Tap again to remove/.test(await rm.textContent()) && fake.family.some(f => f.email === 'nani@x.com'));
    await rm.click(); await a.waitForTimeout(400);
    check('family: second tap removes them', !fake.family.some(f => f.email === 'nani@x.com') && !/Nani/.test(await text(a, '#familyList')));
    await a.click('#toast button'); await a.waitForTimeout(400);
    check('family: undo puts them back', fake.family.some(f => f.email === 'nani@x.com') && /Nani/.test(await text(a, '#familyList')));
    check('family: no remove button for yourself', !(await a.locator('[data-act="famRemove"][data-email="a@x.com"]').count()));
    const tasteFam = await a.evaluate(tasteAudit);
    check('family: taste house rules', !tasteFam.length, tasteFam.join(' | '));

    /* push: allowing notifications subscribes this phone with the server's key; sign-out removes it */
    const pushPhone = await phone('light', { fn: () => {
      if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('nestlog-session', JSON.stringify({ access: 'tok-b@x.com', refresh: 'r-b@x.com', exp: Date.now() + 36e5, email: 'b@x.com' })); }
      window.__notes = []; window.__key = null;
      window.Notification = class { constructor(t) { window.__notes.push(t); } static get permission() { return localStorage.getItem('fake-perm') || 'default'; } static async requestPermission() { localStorage.setItem('fake-perm', 'granted'); return 'granted'; } };
      window.PushManager = class {};
      const sub = { toJSON: () => ({ endpoint: 'https://push.example/phone-b', keys: { p256dh: 'pk-b', auth: 'au-b' } }), unsubscribe: async () => true };
      const reg = { pushManager: { getSubscription: async () => window.__subscribed ? sub : null, subscribe: async o => { window.__key = Array.from(o.applicationServerKey).length; window.__subscribed = true; return sub; } }, showNotification: t => window.__notes.push(t) };
      Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) } });
    } });
    const ago = Date.now() - 4 * 36e5;
    fake.logs.pushfeed = { type: 'bottle', t: ago, ml: 90, content: 'formula' };
    fake.settings = { id: 'baby', data: { name: 'Mira', feedGap: 180, diaperGap: 0 } };
    await pushPhone.reload(); await pushPhone.waitForTimeout(600);
    await pushPhone.click('.tabs [data-tab="baby"]'); await pushPhone.click('[data-act="allowNotify"]'); await pushPhone.waitForTimeout(500);
    check('push: phone subscribes with the 65-byte server key and is saved for its owner', fake.pushSubs['https://push.example/phone-b']?.email === 'b@x.com' && (await pushPhone.evaluate(() => window.__key)) === 65, JSON.stringify(fake.pushSubs));
    check('push: the phone’s notification choices go with its subscription', !!fake.pushSubs['https://push.example/phone-b']?.prefs?.tz);
    check('push: settings say reminders arrive with the app closed', /even when Nestlog is closed/.test(await text(pushPhone, '#remindNote')));
    check('push: the family cloud offers sleep news, on by default', await pushPhone.isVisible('#sleepNotifyField') && (await pushPhone.inputValue('#setSleepNotify')) === '1');
    await pushPhone.waitForTimeout(1200);
    check('push: no second, local notification while push is on', !(await pushPhone.evaluate(() => window.__notes.length)));
    await pushPhone.screenshot({ path: `${SHOTS}/14-push-on.png`, fullPage: true });
    await pushPhone.click('[data-act="signOut"]'); await pushPhone.waitForTimeout(400);
    check('push: sign-out removes this phone from reminders', !fake.pushSubs['https://push.example/phone-b']);
    errorsFromPush = pushPhone.errors; await pushPhone.context().close();
    delete fake.logs.pushfeed;

    await a.click('[data-act="signOut"]'); await a.waitForTimeout(300);
    check('cloud: sign out returns to the sign-in screen', await a.isVisible('#signinForm'));
    check('cloud: sign out removes the copy kept for offline use', await a.evaluate(() => !localStorage.getItem('nestlog-cache') && !localStorage.getItem('nestlog-session')));
    check('cloud: no script errors', ![a, b, c].some(p => p.errors.length) && !errorsFromPush.length, [a, b, c].flatMap(p => p.errors).concat(errorsFromPush).join(' | '));
    for (const p of [a, b, c]) await p.context().close();
  }

  await browser.close(); server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed · screenshots in tests/screenshots/`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
