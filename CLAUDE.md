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
| `tests/serve.js` | Dependency-free static server (`npm start`) |
| `tests/e2e.js` | Playwright checks + screenshots (`npm test`) |

## Runtimes

The same `index.html` runs in two places. The boot code at the bottom of the script picks one:

1. **Standalone (GitHub Pages, localhost).** `window.claude` is undefined, so `S.mode = 'local'`. All data lives in `localStorage['nestlog-v1']` as `{ settings, active, logs: { [id]: entry } }`. Export uses a normal blob download (`blobSave`).
2. **claude.ai Artifact.** `claude.use('db' | 'user' | 'downloads')` resolve, so `S.mode = 'db'`. Collections:
   - `logs/{id}`: one doc per entry, live via `onSnapshot`, newest 1000 in view (`allLogs()` pages through everything for export/import)
   - `active/nurse`, `active/sleep`: running timers, shared so both phones see them
   - `settings/baby`: name, birth, units

   The Artifact version is published without the `<!doctype>`/`<head>` wrapper (the claude.ai publisher adds its own). To update it, give Claude in claude.ai the new body and ask it to republish to the existing Artifact.

All reads and writes go through the `store` object (`putLog`, `delLog`, `setActive`, `setSettings`), which handles both. New persistence code goes through `store` too, never straight to `localStorage` or `db`.

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

Import (`normalize`) whitelists types and fields and rebuilds each entry, so imported files can't inject arbitrary data. Keep it that way when adding fields, and add the column to `CSV_COLS` / `toRow`.

## Design system

Tokens are at the top of the `<style>` block. Use them; never hard-code a color.

- **Neutrals:** `--bg`, `--surface`, `--raised`, `--sunk`, `--line`, `--line-strong`, `--ink`, `--ink-2`, `--muted`. Lilac-grey, tinted toward the plum brand.
- **Brand:** `--brand` (deep plum; lilac in dark), `--brand-ink`, `--brand-soft`.
- **Log families:** `--c-feed` amber, `--c-sleep` indigo, `--c-diaper` teal, `--c-pump` rose, `--c-growth` green. Put `.k-feed` / `.k-sleep` / … on an element to set `--c`, then `.tint` gives the 14% tint background with `--c` ink. Every icon chip, chart and timer uses this pattern.
- **Type:** `--f-display` (Bricolage Grotesque: names, big numbers, headings) and `--f-ui` (Onest: everything else). Scale is `--fs-2xs` 11 … `--fs-3xl` 44. Numbers that tick or line up get `.num` (tabular figures).
- **Space / shape:** `--s1`…`--s8` (4px grid), `--r-sm` 10, `--r-md` 14, `--r-lg` 22, `--r-pill`. Elevation is `--shadow-1` for cards and `--shadow-2` for sheets and toasts.
- **Motion:** `--t-fast` 120ms, `--t-med` 220ms, `--ease`. All animation sits inside `prefers-reduced-motion: no-preference`.
- **Themes:** light values on bare `:root`, with dark redefined twice: under `prefers-color-scheme: dark` (guarded by `:not([data-theme="light"])`) and under `[data-theme="dark"]`. A new token goes in all three blocks.

Components: `.card`, `.tile` (primary log actions), `.pill` (secondary), `.timer`, `.mini`, `.fact`, `.entry`, `.seg` (segmented control), `.chip`, `.btn.primary|.soft|.danger`, `.amount` (big stepper), `.sheet`, `.toast`.

## Copy

Plain and short; it gets read at 3am. Buttons start with a verb ("Save bottle", "Woke up", "Download backup"). Errors say what happened and what to do, with no apology and no blame. Destructive actions take a second tap ("Tap again to delete") and offer Undo.

## Ideas not built yet

- Live sync on the GitHub Pages version (e.g. Supabase) so both phones share one log outside claude.ai
- Offline support with a service worker (watch out for stale caches while developing)
- Feed / diaper reminders ("3h since the last feed")
- Medicine, temperature and milestone logs
