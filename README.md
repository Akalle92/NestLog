# Nestlog

A baby tracker for the first months: nursing with a left/right timer, bottles, solids, sleep, diapers (with colour and texture), pumping, growth, medicine, vaccines, temperature and milestones, with a note on anything. It shows what's happening right now, a 24-hour strip of the day, a timeline, and 7/14/30-day trends with a weight curve.

**Live app:** https://akalle92.github.io/NestLog/

## Share with family anywhere (cloud)

The GitHub Pages version keeps one shared log in a free [Supabase](https://supabase.com) database. Family members sign in with their email, and **only emails on your family list can sign in or see anything.**

**For family members:**
1. Open https://akalle92.github.io/NestLog/ and type your email.
2. An email arrives with a code. Type the code. (On a laptop you can tap the link in the email instead.)
3. Add it to your home screen. The phone stays signed in.

Everyone sees the same log, live, and each entry shows who logged it. If you used Nestlog on this phone before, **Baby → Sharing → Upload entries from this phone** moves those entries into the shared log.

**Adding or removing someone:** in the app, **Baby → Family**. Type their first name and email and tap **Add to family**; they can sign in straight away. **Remove** takes a second tap and can be undone. Anyone on the list can do this, and the list always keeps at least one person. (The same list is the `family_members` table in the Supabase dashboard.)

**One-time setup in the Supabase dashboard** (project NestLog):
1. **Authentication → Emails → Magic Link** template: put the code in the email, for example
   `<h2>Your Nestlog code</h2><p>Enter this code: <b>{{ .Token }}</b></p><p>Or tap <a href="{{ .ConfirmationURL }}">this link</a> on a computer.</p>`
2. **Authentication → URL Configuration:** Site URL `https://akalle92.github.io/NestLog/`.
3. **Authentication → Hooks → Before User Created:** choose Postgres, function `public.hook_family_only`. This stops anyone not on the list from even getting an account or a sign-in email.

The database setup is in [`supabase/nestlog_init.sql`](supabase/nestlog_init.sql) (tables, access rules, live updates, the sign-up hook).

**Limits on the free plan:** a project with no activity for a week pauses (daily logging keeps it awake; **Restore** in the dashboard wakes it). Supabase's built-in email sends only a few emails an hour, which is fine for signing in once per phone; for more, connect your own email sender under Authentication → SMTP.

## Bring your history from Nara Baby

In Nara, export your data as CSV, then in Nestlog open **Baby → Import** and choose the file. Nestlog reads every kind of Nara entry: bottle feeds (with the formula brand), sleep, diapers (wet/dirty, colour, texture, blowout, rash), growth (pounds and inches are converted), pumping, routines and medication (as medicine), vaccines, baby firsts (as milestones) and combo feeds. Notes and who logged each entry come along, and it offers to use the baby's name and birth date from the export.

The preview shows what will be added before anything is saved. Importing the same file again adds nothing new. Rows Nara saved empty (a sleep that starts and ends at the same minute, a pump with no time or amount) are skipped.

## Reminders

**Baby → Reminders** sets when a feed or diaper change is due (off, or 2 to 5 hours after the last one). The setting is shared by everyone. Once one is due, Today shows it tinted. Tap **Allow notifications** to also get a notification on that phone.

On the family website (akalle92.github.io/NestLog), allowing notifications also signs that phone up for reminders from the server. They arrive even when Nestlog is closed, once per overdue feed or diaper, within about 5 minutes of it becoming due. Reminders show **"…even when Nestlog is closed"** under the settings when this is on.
- **Android and computers:** tap **Allow notifications** in Chrome, Edge or Firefox.
- **iPhone:** you need iOS 16.4 or newer. Add Nestlog to the Home Screen first (Share → Add to Home Screen), open it from there, sign in, then tap **Allow notifications**. In Safari itself, iPhones don't offer notifications to websites.

Opened from `localhost` or on the home server, notifications only come while Nestlog is open or recently used.

## Growth percentiles

**Trends → Weight / Length / Head** compares each measurement with the WHO Child Growth Standards (birth to 2 years) and shows the percentile, with the 3rd to 97th percentile curves in grey behind the line. Pick **Boy** or **Girl** under **Baby → Growth curves for**; importing from Nara fills it in.

## Doctor visit report

**Baby → Doctor visit** makes a one-page summary of the last 1, 2 or 4 weeks: feeds and bottle volume per day, nursing time, sleep and the longest stretch, wet and dirty diapers with colours and anything noted (rash, blowout), the latest growth with percentiles, every medicine, vaccine and temperature, milestones and notes. Tap **Print or save as PDF** to share it.

## Milestone photos

In the family cloud, a milestone can have one photo. It's shrunk on the phone, stored privately in your Supabase project (only people on the family list can see it) and shown as a thumbnail in the timeline.

## Works offline

After the first visit, the website version opens with no signal. Entries you log offline appear straight away; the header shows **Offline · 2 waiting**, and they sync in order as soon as you're back online. The last synced log stays on the phone for this, and signing out removes it.

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

Open the "On your phones" address on each phone (same Wi-Fi), then add it to the home screen as described below. (Offline mode and notifications need a secure https address, so they work on the website version but not on the home server's local address.)

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

On https://akalle92.github.io/NestLog/ the log lives in your Supabase project, readable only by people on your family list (see above). On the home server, everything is in one file on the laptop. Opened from `localhost` (`npm start`), entries stay in that browser: saved in the browser on that device (`localStorage`). That means:

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
