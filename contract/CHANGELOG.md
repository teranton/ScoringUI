# Sheet layout changelog

## Unreleased

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
