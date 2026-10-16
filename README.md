# Nestlog

A baby tracker for the first months: nursing with a left/right timer, bottles, solids, sleep, diapers, pumping and growth. It shows what's happening right now, a 24-hour strip of the day, a timeline, and 7/14/30-day trends with a weight curve.

**Live app:** https://akalle92.github.io/NestLog/

## Run it at home on your laptop

For personal use you can run Nestlog on your own laptop. Every phone on your home Wi-Fi opens it from there and shares **one live log**: a feed logged on one phone shows up on the other within a second. Nothing leaves your house.

You need [Node.js](https://nodejs.org) 18 or newer. Nothing else to install.

```bash
git clone https://github.com/Akalle92/NestLog.git
cd NestLog
npm run home
```

It prints the addresses to use:

```
  On this laptop:   http://localhost:8080/
  On your phones:   http://192.168.1.23:8080/
```

Open the "On your phones" address on each phone (same Wi-Fi), then add it to the home screen as described below.

- **Your data** is in `data/nestlog.json` in the NestLog folder. A dated copy goes into `data/backups/` each day (the last 30 are kept). To keep it somewhere else: `NESTLOG_DATA=~/Documents/nestlog npm run home`.
- **The laptop has to be on and awake** while you log. If it sleeps, the header says *Offline* and saves fail with a message; they work again once it wakes. On a Mac, `caffeinate -i npm run home` keeps it awake while Nestlog runs.
- **Another port:** `PORT=9000 npm run home`.
- **The address changes?** Routers sometimes hand out a new IP. Reserve one for the laptop in your router settings, or try `http://<laptop-name>.local:8080/` (works on most Macs and iPhones).
- **Privacy:** anyone on your Wi-Fi can open it, and there is no login. Don't forward the port on your router or expose it to the internet.
- **Moving over from the website version:** on the old phone, **Baby → Export → Download backup**, then **Import** that file in the home version.

## Use it on your phone

1. Open the link above in Safari (iPhone) or Chrome (Android).
2. Add it to your home screen: **Share → Add to Home Screen** on iPhone, **⋮ → Add to Home screen** on Android.
3. Set the baby's name, birth date and units under the **Baby** tab.

It opens full-screen like an app, with its own icon.

## Where the data lives

On the home server, everything is in one file on the laptop (see above).

On the GitHub Pages site, entries are saved in the browser on each device (`localStorage`). Nothing is sent to a server. That means:

- Each phone keeps its own log. To combine two phones, use **Baby → Export → Download backup** on one and **Import** on the other. Entries already present are skipped, so importing again is safe.
- Clearing the browser's site data erases the log. Download a backup now and then.

The same page also runs as a claude.ai Artifact, where it uses a shared database instead. There, two caregivers see each other's entries live.

## Develop

No build step: the whole app is `index.html`.

```bash
npm run home                   # home server with shared data, http://localhost:8080
npm start                      # plain static server (per-device local mode)
npm install                    # once, for the tests
npx playwright install chromium
npm test                       # phone-sized browser checks, light and dark
```

`npm test` writes screenshots to `tests/screenshots/` so you can eyeball every screen.

Pushing to `main` redeploys GitHub Pages within a minute or two.

See [CLAUDE.md](CLAUDE.md) for the architecture, data model and design system.
