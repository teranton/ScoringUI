# ScoringUI

Public React app (Vite, React 19, Tailwind) showing live shooting results, registrations and
timetables for competitions run on Google Sheets. Deployed on Vercel.

## How data flows

- Serverless functions in `api/` read the competition spreadsheets directly with a Google service
  account (`GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`). There is no API to ScoringLib.
- Squad editing (`src/RyhmaJako.jsx`) is the one write path: the organiser signs in with Google in the browser
  (Google Identity Services, `VITE_GOOGLE_CLIENT_ID`, `spreadsheets` and `email` scopes, account chooser on every sign-in) and the browser reads and writes the
  sheet's `OSALLISTUJAT` rows with that token, so Google enforces editor access. Without `VITE_GOOGLE_CLIENT_ID`
  the feature is hidden. The service account stays read-only. Moves to a free place write the place number as the
  name (the shuffle's free-place convention), so `NRO`/`Ryhmä` formulas keep contiguous numbering.
- The frontend parses tabs as CSV. The tabs, headers and settings it depends on are listed in
  `contract/sheet-layout.md`. That file is the contract with ScoringLib (`teranton/ScoringLib`) and the
  sheet template.
- Result tabs are filled by sheet formulas, not by ScoringLib code.
- `api/kisa.js` reads tabs with one Sheets API `values:batchGet` and returns them as CSV in JSON. CDN cache
  time follows the registry dates (finished 1 h, served stale up to 1 day in the 14-day correction window and 30 days after it; running 15 s; upcoming 60 s).
  With `BLOB_READ_WRITE_TOKEN` set, finished competitions are also stored in Vercel Blob and served from there.
  After the 14-day correction window a Blob copy older than 1 day is still served at once (up to 30 days) and
  refreshed from Google in the background (`waitUntil`; awaited when there is no Vercel request context, e.g. `vercel dev`).
  The correction window is judged from the current registry dates; during it only a copy under 1 h old is used.
  Blob writes never delay the response.
  The API also keeps responses, the registry and tab lists in memory and in files under the OS temp dir
  (`api/_lib/valimuisti.js`), so `vercel dev`, where every request runs in a new process, doesn't hit Google
  on every request. Google 429s are retried once, then old data is served if there is any.
  The browser keeps the registry and the last 20 opened competitions in `localStorage`.
- `api/saa.js` serves the weather forecast for a competition's place (registry column I) from the
  Finnish Meteorological Institute open data (WFS, edited 10-day forecast, free, no key, CC BY 4.0; place names resolved by FMI). Forecasts are kept in `api/_lib/valimuisti.js` (1 h, CDN 30 min).

## Commands

- `npm ci`, `npm run dev` (needs `vercel dev` on port 3000 for `/api`), `npm test`, `npm run build`, `npm run lint`.
- `npm run tarkista -- <url>` checks that the API reads every registry sheet from Google (sharing with the service account);
  `npm run mittaa -- <url>` measures load times per cache level (`scripts/mittaa-kisat.mjs`).
- `npm test` runs with `--experimental-test-module-mocks` (`api/kisa.test.js` mocks Google and Blob with `mock.module`).
- `npm run lint` is clean and CI fails on any lint error.

## Working rules

- Any change to which tabs, headers or `KISANSPEKSIT` keys the UI reads must update
  `contract/sheet-layout.md` and `contract/CHANGELOG.md` in the same PR.
- For a breaking layout change, keep reading the old layout until all sheets have the new one.
- Pushing to `main` deploys production on Vercel. Work on branches and open PRs; only Tero merges.
- Test a PR on its Vercel preview, pointed at the dev sheet.
- Code and UI text are in Finnish; keep that style.
