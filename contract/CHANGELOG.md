# Sheet layout changelog

## Unreleased

- `KISANSPEKSIT` settings: keys and values written with Ä/Ö/Å are now recognised (`Ryhmä 6`, `Erät`,
  `Kisa päättynyt`). A setting's value is read only from the two cells right of its key, no longer from
  anywhere on the same row. Sheets using the documented spellings need no change.
- Competition registry: `x` in the team (F) or hidden (G) column now counts as yes.
- The API (`kisaData`, `gidLista`, `laukaukset`) now only serves spreadsheets whose id is in column E
  of the competition registry. No layout change; a competition sheet missing from the registry is no longer readable
  through the API. `EXTRA_ALLOWED_SHEET_IDS` (comma-separated) can add ids, e.g. the dev sheet on a preview.

## Layout version 1 (2026-10-07)

- First written description of the layout the UI already reads. No changes to sheets or code.
