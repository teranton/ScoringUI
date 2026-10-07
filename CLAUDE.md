# ScoringUI

Public React app (Vite, React 19, Tailwind) showing live shooting results, registrations and
timetables for competitions run on Google Sheets. Deployed on Vercel.

## How data flows

- Serverless functions in `api/` read the competition spreadsheets directly with a Google service
  account (`GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`). There is no API to ScoringLib.
- The frontend parses tabs as CSV. The tabs, headers and settings it depends on are listed in
  `contract/sheet-layout.md`. That file is the contract with ScoringLib (`teranton/ScoringLib`) and the
  sheet template.
- Result tabs are filled by sheet formulas, not by ScoringLib code.

## Commands

- `npm ci`, `npm run dev` (needs `vercel dev` on port 3000 for `/api`), `npm test`, `npm run build`, `npm run lint`.
- `npm run lint` currently reports existing errors; CI runs it without blocking. Don't add new ones.

## Working rules

- Any change to which tabs, headers or `KISANSPEKSIT` keys the UI reads must update
  `contract/sheet-layout.md` and `contract/CHANGELOG.md` in the same PR.
- For a breaking layout change, keep reading the old layout until all sheets have the new one.
- Pushing to `main` deploys production on Vercel. Work on branches and open PRs; only Tero merges.
- Test a PR on its Vercel preview, pointed at the dev sheet.
- Code and UI text are in Finnish; keep that style.
