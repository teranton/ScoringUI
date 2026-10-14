# Sheet layout changelog

## Unreleased

- Private sheets: the API serves only the tabs the UI reads (`KISANSPEKSIT`, `Tulokset Y`, `NEW_Joukkue`,
  `Ryhmäjako`, `Ilmoittautuneet`, `Aikataulu`, `Aikataulu La`, `Aikataulu Su`). Other tabs are left out of the response (400 if nothing else
  was asked for). `Timetable` was never requested and is not served.
  The registry is read through the Sheets API instead of the docs.google.com CSV export, the service account
  token only has the `spreadsheets.readonly` scope, and the unused `api/laukaukset.js` (gviz on `Kierrokset`) is removed.
  No layout change. Every competition sheet in the registry and the registry itself must be shared with the
  service account before "anyone with the link" is turned off.
- Master template: `KISANSPEKSIT` is rebuilt in sections (columns Selite / Avain / Arvo / Ohje; value right of
  the key) with the station table under `Asema` / `Maks` in F2. Same keys and values as before; the old tab
  is kept hidden as `KISANSPEKSIT vanha`. Existing competition sheets are unchanged. No UI change: keys are
  read by name and the new station headers match the UI's header detection.
- ScoringLib reads `KISANSPEKSIT` by key instead of fixed cells (ScoringLib PR #11). No sheet change;
  the keys it reads are listed under "Keys ScoringLib reads", with the old cells as fallback.
- Reading: `api/kisa.js` replaces `kisaData` and `gidLista`. Tabs are read with the service account through the
  Sheets API (`values:batchGet`, formatted values), not the anonymous CSV export, and the browser gets the
  registry from `api/rekisteri.js` instead of docs.google.com. Competition sheets and the registry no longer
  need "anyone with the link" sharing; they must stay shared with the service account. No layout change.
- Caching follows the registry dates (C/D): finished competitions 1 h at the CDN (served stale while refreshing
  for up to 1 day during the 14 days after the end date, 30 days after that), running ones 15 s, upcoming ones 60 s.
- `KISANSPEKSIT` settings: each setting now accepts one key and only the values the competition sheets
  use: `KILPAILUNSTATUS` (`FINISHED`, `RUNNING`, `PAUSED`, `UPCOMING`), `AIKATAULU_NAKYVYYS` (`TRUE`,
  `AFTER_START`, `FALSE`), `LOGOT_NAKYVYYS` (`TRUE`, `FALSE`), `AIKATAULU_RYHMAKOKO` (`5`, `6`, `INLINE`),
  `AIKATAULU_MALLI` (`GROUPS`, `INLINE`) and `RATKO_PALKINTO_SIJA`. Synonyms such as `STATUS`,
  `KISA_PAATTYNYT`, `TIMETABLE_VISIBILITY`, `AINA`, `ON`, `EI`, `RYHMA6` or `ERAT` are ignored. Case,
  Ä/Ö/Å, spaces and underscores still don't matter. The value is the next non-empty cell right of the key.
  All 19 readable 2026 sheets already use these forms.
- Competition registry: `x` in the team (F) or hidden (G) column now counts as yes.
- The API (`kisaData`, `gidLista`, `laukaukset`) now only serves spreadsheets whose id is in column E
  of the competition registry. No layout change; a competition sheet missing from the registry is no longer readable
  through the API. `EXTRA_ALLOWED_SHEET_IDS` (comma-separated) can add ids, e.g. the dev sheet on a preview.

## Layout version 1 (2026-10-07)

- First written description of the layout the UI already reads. No changes to sheets or code.
