// Draws Nestlog's generated image assets with the test browser, so they can be remade when the look changes:
//   icons/badge-96.png           notification badge (white mark on transparent; Android shows it in the status bar)
//   icons/shortcut-<kind>.png    home-icon shortcuts (manifest "shortcuts")
//   icons/launch/<w>x<h>-<light|dark>.png   iPhone launch screens (apple-touch-startup-image)
// Run: node tests/make-assets.js   (then commit the PNGs)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const glyph = k => html.match(new RegExp(`^  ${k}: sv\\('(.*)'\\)`, 'm'))[1];

// the moon-and-nest mark from icons/icon.svg, cropped to its shape
const mark = (moon, dot) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="90 110 340 320">
  <mask id="m"><rect x="0" y="0" width="512" height="512" fill="#fff"/><circle cx="314" cy="214" r="118" fill="#000"/></mask>
  <circle cx="240" cy="278" r="142" fill="${moon}" mask="url(#m)"/><circle cx="356" cy="160" r="34" fill="${dot}"/></svg>`;

const THEME = { light: { bg: '#f2f1ee', moon: '#1b211e', dot: '#b0611a' }, dark: { bg: '#121413', moon: '#ecebe6', dot: '#e6a35e' } };
// device size in CSS px and pixel ratio, for each iPhone screen in use
const SCREENS = [[375, 667, 2], [390, 844, 3], [393, 852, 3], [402, 874, 3], [428, 926, 3], [430, 932, 3], [440, 956, 3]];
const SHORTCUTS = { bottle: ['#b0611a', '#f6e8dc'], nurse: ['#b0611a', '#f6e8dc'], sleep: ['#2b6890', '#e1e9ef'], diaper: ['#14786a', '#dcebe8'] };

(async () => {
  const browser = await chromium.launch();
  const shot = async (w, h, dpr, body, file, transparent) => {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await p.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;${transparent ? 'background:transparent' : ''}">${body}</body></html>`);
    await p.screenshot({ path: file, omitBackground: !!transparent });
    await p.close();
  };
  fs.mkdirSync(path.join(ROOT, 'icons', 'launch'), { recursive: true });

  await shot(96, 96, 1, `<div style="width:96px;height:96px;display:grid;place-items:center"><div style="width:76px">${mark('#fff', '#fff')}</div></div>`, path.join(ROOT, 'icons', 'badge-96.png'), true);

  for (const [k, [ink, tint]] of Object.entries(SHORTCUTS))
    await shot(96, 96, 1, `<div style="width:96px;height:96px;border-radius:50%;background:${tint};color:${ink};display:grid;place-items:center">
      <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${glyph(k)}</svg></div>`,
      path.join(ROOT, 'icons', `shortcut-${k}.png`), true);

  for (const [w, h, dpr] of SCREENS) for (const [name, t] of Object.entries(THEME))
    await shot(w, h, dpr, `<div style="width:${w}px;height:${h}px;background:${t.bg};display:grid;place-items:center"><div style="width:${Math.round(w * 0.28)}px">${mark(t.moon, t.dot)}</div></div>`,
      path.join(ROOT, 'icons', 'launch', `${w * dpr}x${h * dpr}-${name}.png`));

  await browser.close();
  // the <link> tags for index.html, printed so they stay in step with SCREENS
  for (const [w, h, dpr] of SCREENS) for (const name of ['light', 'dark'])
    console.log(`<link rel="apple-touch-startup-image" href="icons/launch/${w * dpr}x${h * dpr}-${name}.png" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${name})">`);
})().catch(e => { console.error(e); process.exit(1); });
