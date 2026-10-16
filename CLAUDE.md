# Nestlog — notes for Claude Code

Baby tracker web app for one family (two caregivers). Single file, no framework, no build step. Hosted on GitHub Pages from `main` (repo root) at https://akalle92.github.io/NestLog/.

## Ground rules

- **Run `npm test` after every change.** It drives a 390×844 phone viewport in light and dark and must stay green. Look at `tests/screenshots/` after visual changes. Add a check to `tests/e2e.js` for each new feature.
- **Keep it one self-contained `index.html`.** No bundler, no npm runtime deps, no CDN scripts. Google Fonts is the only external request, and it degrades to system fonts.
- **Phone first.** 390px wide is the main target. No horizontal scroll (the tests check this), touch targets ≥ 44px, works one-handed.
- **Never break local mode.** The app has to work with no `window.claude` (see Runtimes).
- **Escape user text.** Anything a person typed goes through `esc()` before `innerHTML`, or is set with `textContent`.

## Files

| Path | What |
| --- | --- |
| `index.html` | The whole app: CSS tokens + styles, markup, one IIFE script |
| `manifest.webmanifest`, `icons/` | Home-screen install (PWA manifest, SVG + PNG icons) |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |
| `server.js` | Home server (`npm run home`): serves the app on the LAN and stores one shared log in `data/` |
| `supabase/nestlog_init.sql` | Cloud database: tables, row-level security, family allowlist, sign-up hook |
| `tests/serve.js` | Dependency-free static server (`npm start`) |
| `tests/e2e.js` | Playwright checks + screenshots (`npm test`) |

## Runtimes

The same `index.html` runs in four places. The boot code at the bottom of the script picks one:

1. **Standalone (localhost, `npm start`, file://).** No `window.claude`, no home meta, not cloud, so `S.mode = 'local'`. All data lives in `localStorage['nestlog-v1']` as `{ settings, active, logs: { [id]: entry } }`. Export uses a normal blob download (`blobSave`).
2. **claude.ai Artifact.** `claude.use('db' | 'user' | 'downloads')` resolve, so `S.mode = 'db'`. Collections:
   - `logs/{id}`: one doc per entry, live via `onSnapshot`, newest 1000 in view (`allLogs()` pages through everything for export/import)
   - `active/nurse`, `active/sleep`: running timers, shared so both phones see them
   - `settings/baby`: name, birth, units

   The Artifact version is published without the `<!doctype>`/`<head>` wrapper (the claude.ai publisher adds its own). To update it, give Claude in claude.ai the new body and ask it to republish to the existing Artifact.

3. **Home server (`server.js` on a laptop).** It serves `index.html` with `<meta name="nestlog-server" content="home">` added, so `S.mode = 'home'`. Data is `data/nestlog.json` (same shape as the local copy), written atomically, with a daily copy in `data/backups/`. API: `GET api/state`, `PUT|DELETE api/logs/:id`, `PUT|DELETE api/active/:kind`, `PUT api/settings`, `POST api/import`, and `GET api/events` (Server-Sent Events) which pushes each change (`{op:'log'|'active'|'settings'|'reload'}`) to every phone; `applyChange()` applies it. The server re-validates every write (`cleanLog`, `cleanActive`, `cleanSettings`) and only serves the app files. It never falls back to local mode, so phones can't silently split the log; when the laptop is unreachable the header says Offline.

4. **Cloud (GitHub Pages).** When not on localhost/file:// and not inside claude.ai (or with `?cloud` in the URL, which the tests use), `S.mode = 'cloud'` and data lives in the Supabase project in `CLOUD` (url + publishable key, public by design). No SDK: `auth` (email code via `/auth/v1/otp` + `/verify`, refresh, session in `localStorage['nestlog-session']`), `rest()` (PostgREST, retries once after a refresh on 401), and `live` (realtime WebSocket, protocol 1.0.0, `postgres_changes` on `logs`/`active`/`settings`, heartbeat, backoff, refetch on reconnect and when the page becomes visible). Changes go through the same `applyChange()` as home mode. Tables: `logs(id, t, data jsonb)`, `active(kind, data)`, `settings(id='baby', data)`, `family_members(email, name)`. Row-level security allows only emails in `family_members` (`private.is_family()`), and the `public.hook_family_only` Before User Created hook stops strangers getting accounts. `S.me` is the user's email and `S.names` comes from `family_members`, so entries show who logged them. Schema: `supabase/nestlog_init.sql`; change it with a new migration (Supabase MCP) and update that file.

All reads and writes go through the `store` object (`putLog`, `delLog`, `setActive`, `setSettings`, `putMany` for import), which handles all four. New persistence code goes through `store` too, never straight to `localStorage` or `db`.

## Script layout (top to bottom)

icons `I` → `TYPES` (log kinds) → state `S` → `local` / `store` / `write()` (errors, haptics) → time helpers → units → `describe()` / `dayStats()` / `nurseTotals()` → `render()` and per-tab renderers (`renderHome`, `renderStatus`, `ribbon`, `renderLive`, `renderTimeline`, `renderTrends` + `barChart` / `growthChart` / `pastAvg`, `renderBaby`) → sheets (`openSheet`, `saveSheet`, `act`, `tapSide`) → export / import (`buildCsv`, `buildJson`, `normalize`, `readImport`, `runImport`) → delegated event listeners → 1-second clock tick → boot.

UI is rebuilt with template strings. Clicks are handled by one delegated listener keyed on `data-*` attributes: `data-open`, `data-tab`, `data-edit`, `data-act`, `data-chip`, `data-side`, `data-io`, `data-ago`, `data-step`, `data-filter`, `data-range`. Live clocks are any element with `data-clock="<start ms>"`; the tick updates them.

## Data model

Every entry has `type`, `t` (start, epoch ms), `created`, and `by` (viewer id on claude.ai, `null` locally). Stored units are fixed (**ml, kg, cm, ms**); `S.settings.vol` / `.wt` only change display, through `volOut`/`volIn` and `wtOut`/`wtIn`.

| type | fields |
| --- | --- |
| `nurse` | `left`, `right` (ms per side), `last` (`'L'`/`'R'`, drives "next side"), `end` |
| `bottle` | `ml`, `content` (`formula` / `breastmilk`) |
| `solids` | `food`, `reaction` |
| `sleep` | `end` (required, > `t`) |
| `diaper` | `kind` (`wet` / `dirty` / `both` / `dry`), `note` |
| `pump` | `lml`, `rml`, `min` |
| `growth` | `kg`, `cm`, `head` (any subset) |

Running timers: `active.nurse = { start, left, right, side: 'L'|'R'|null, since, lastSide, by }` and `active.sleep = { start, by }`.

Import (`normalize`) and the home server's `cleanLog` both whitelist types and fields and rebuilds each entry, so imported files can't inject arbitrary data. Keep it that way when adding fields, add the column to `CSV_COLS` / `toRow`, and add the field to `FIELDS` in `server.js`. (Cloud stores the entry object as `data jsonb`, so new fields need no migration; a new **type** needs the `logs` check constraint updated.)

## Design system

The look follows the house rules of the taste skill (github.com/Leonxlnx/taste-skill), applied to an app. `npm test` measures them on every tab (`tasteAudit`, `paletteAudit` in `tests/e2e.js`), so a change that breaks one fails the build.

**House rules:** no shadows on things at rest (only `.sheet` and `.toast` float); no hairlines or 1px outlined boxes (separate with space or one tone step; chart axes are data and may stay); no glass/backdrop blur; no small uppercase letter-spaced labels; no violet or indigo; no gradients; at most **five font sizes**; two typefaces; every button and chip is a full pill.

Tokens are at the top of the `<style>` block. Use them; never hard-code a color.

- **Neutrals:** `--bg` (stone ground), `--surface` (one tone step: cards, the tab bar), `--raised` (sheets), `--sunk` (fields and chips on a surface), `--line` / `--line-strong` (chart internals and the sheet grab handle only), `--ink`, `--ink-2`, `--muted` (≥ 4.5:1 on `--bg`).
- **Action:** `--brand` is the ink colour (dark in light mode, light in dark mode), with `--brand-ink` on top and `--brand-soft` for the selected tab. Buttons are neutral; colour belongs to the log families.
- **Log families:** `--c-feed` amber, `--c-sleep` slate blue, `--c-diaper` teal, `--c-pump` rose, `--c-growth` green. Put `.k-feed` / `.k-sleep` / … on an element to set `--c`, then `.tint` gives the tint background with `--c` ink. Icon chips, the log tiles, charts and timers use this pattern.
- **Type:** `--f-display` (Bricolage Grotesque: names, big numbers, headings) and `--f-ui` (Onest: everything else). Five sizes: `--fs-s` 13 (secondary notes), `--fs-m` 16 (body, buttons, fields), `--fs-l` 18 (section heads), `--fs-xl` 26 (titles, stats), `--fs-2xl` 44 (the one big number). Numbers that tick or line up get `.num` (tabular figures).
- **Space / shape:** `--s1`…`--s8` (4px grid), `--r-sm` 10 (fields), `--r-md` 14, `--r-lg` 22 (cards, tiles), `--r-pill` (every button). `--shadow-2` is the only shadow, for sheets and toasts.
- **Motion:** `--t-fast` 120ms, `--t-med` 220ms, `--ease`. All animation sits inside `prefers-reduced-motion: no-preference`.
- **Themes:** light values on bare `:root`, with dark redefined twice: under `prefers-color-scheme: dark` (guarded by `:not([data-theme="light"])`) and under `[data-theme="dark"]`. A new token goes in all three blocks.

Components: `.card`, `.tile` (primary log actions: tinted, icon beside label, 2×2), `.pill` (secondary), `.timer`, `.mini`, `.fact`, `.entry`, `.seg` (segmented control), `.chip`, `.btn.primary|.soft|.danger`, `.amount` (big stepper), `.sheet`, `.toast`.

## Copy

Plain and short; it gets read at 3am. Buttons start with a verb ("Save bottle", "Woke up", "Download backup"). Errors say what happened and what to do, with no apology and no blame. Destructive actions take a second tap ("Tap again to delete") and offer Undo.

## Ideas not built yet

- Offline support with a service worker (watch out for stale caches while developing)
- Feed / diaper reminders ("3h since the last feed")
- Medicine, temperature and milestone logs
