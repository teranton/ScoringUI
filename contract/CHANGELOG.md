# Sheet layout changelog

## Unreleased

- The API (`kisaData`, `gidLista`, `laukaukset`) now only serves spreadsheets whose id or URL is in column E
  of the competition registry. No layout change; a competition sheet missing from the registry is no longer readable
  through the API. `EXTRA_ALLOWED_SHEET_IDS` (comma-separated) can add ids, e.g. the dev sheet on a preview.

## Layout version 1 (2026-10-07)

- First written description of the layout the UI already reads. No changes to sheets or code.
