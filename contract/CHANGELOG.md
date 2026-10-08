# Sheet layout changelog

## Unreleased

- `KISANSPEKSIT` settings: keys and values written with Ä/Ö/Å, spaces or underscores are now recognised
  (`Ryhmä 6`, `Erät`, `Kisa päättynyt`, `Kilpailu status`). The value is the next non-empty cell right of
  the key, as documented; the UI no longer falls back to other cells on the same row when that cell is not
  a known value. Sheets that follow the documented layout need no change.
- Competition registry: `x` in the team (F) or hidden (G) column now counts as yes.
- The API (`kisaData`, `gidLista`, `laukaukset`) now only serves spreadsheets whose id is in column E
  of the competition registry. No layout change; a competition sheet missing from the registry is no longer readable
  through the API. `EXTRA_ALLOWED_SHEET_IDS` (comma-separated) can add ids, e.g. the dev sheet on a preview.

## Layout version 1 (2026-10-07)

- First written description of the layout the UI already reads. No changes to sheets or code.
