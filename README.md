# Nestlog

A baby tracker for the first months: nursing with a left/right timer, bottles, solids, sleep, diapers, pumping and growth. It shows what's happening right now, a 24-hour strip of the day, a timeline, and 7/14/30-day trends with a weight curve.

**Live app:** https://akalle92.github.io/NestLog/

## Use it on your phone

1. Open the link above in Safari (iPhone) or Chrome (Android).
2. Add it to your home screen: **Share → Add to Home Screen** on iPhone, **⋮ → Add to Home screen** on Android.
3. Set the baby's name, birth date and units under the **Baby** tab.

It opens full-screen like an app, with its own icon.

## Where the data lives

On this site, entries are saved in the browser on each device (`localStorage`). Nothing is sent to a server. That means:

- Each phone keeps its own log. To combine two phones, use **Baby → Export → Download backup** on one and **Import** on the other. Entries already present are skipped, so importing again is safe.
- Clearing the browser's site data erases the log. Download a backup now and then.

The same page also runs as a claude.ai Artifact, where it uses a shared database instead. There, two caregivers see each other's entries live.

## Develop

No build step: the whole app is `index.html`.

```bash
npm start                      # http://localhost:8080
npm install                    # once, for the tests
npx playwright install chromium
npm test                       # phone-sized browser checks, light and dark
```

`npm test` writes screenshots to `tests/screenshots/` so you can eyeball every screen.

Pushing to `main` redeploys GitHub Pages within a minute or two.

See [CLAUDE.md](CLAUDE.md) for the architecture, data model and design system.
