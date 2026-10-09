# Nestlog

A shared baby tracker for two caregivers: nursing (left/right timer), bottle, solids, sleep, diapers, pumping and growth, with a daily timeline, 7-day trends and a weight curve.

## How it runs

`index.html` is a single self-contained page published as a claude.ai Artifact. When opened from its claude.ai link it uses the Artifact runtime capabilities:

- `db` — shared live store (`logs`, `active` timers, `settings/baby`)
- `user` (profile scope) — shows which caregiver logged each entry
- `downloads` — backup (.json) and spreadsheet (.csv) export

Opened anywhere else, it falls back to saving in the browser's local storage on that device only.

## Data

- Volumes are stored in ml, weights in kg, lengths in cm; the Baby tab picks display units.
- Import accepts Nestlog `.json` backups and `.csv` exports and skips entries that already exist.
