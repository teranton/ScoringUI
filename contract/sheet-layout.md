# Sheet layout contract

ScoringUI does not call ScoringLib. Vercel functions in `api/` read the competition spreadsheets
directly, and the frontend parses the tabs as CSV. This file lists every tab, column and setting
the UI depends on, so a change in the sheet template or in ScoringLib can be checked against it.

Layout version: 1 (first pass, written from the UI code on 2026-10-07).

## Rules

- Additive changes are safe: a new tab, a new column, a new `KISANSPEKSIT` key.
- Breaking changes need a matching ScoringUI change, released after the sheets have it:
  renaming or removing a tab, renaming a header the UI matches on, moving a column the UI reads by position,
  changing the allowed values of a setting.
- Record every change in `contract/CHANGELOG.md` and bump the layout version for breaking ones.

## Who writes what

| Tab | Written by | Read by (UI) |
|---|---|---|
| `KISANSPEKSIT` | Organiser, ScoringLib (`ConfigManager.js`, `TimetableTauko.js`, `Utils.js`) | `App.jsx`, `utils/henkiloTulokset.js` |
| `Tulokset Y` | Sheet formulas from the main entry tab | `HenkiloTaulukko.jsx`, `HenkiloTulokset.jsx`, `utils/henkiloTulokset.js` |
| `NEW_Joukkue` | Sheet formulas | `JoukkueTulokset.jsx` |
| `Ryhmäjako` | Sheet / ScoringLib (`Distributor.js`) | `RyhmaJako.jsx` |
| `Ilmoittautuneet` | Organiser / import | `Ilmoittautuneet.jsx` |
| `Aikataulu`, `Aikataulu La`, `Aikataulu Su` | ScoringLib (`TimetableTauko.js`) or template (`templates/sheets/Aikataulu_*_template.csv`) | `AikatauluNakyma.jsx`, `AikatauluRyhmaNakyma.jsx` |
| `Kierrokset` | Sheet formulas | `api/laukaukset.js` (gviz query on column B = shooter) |
| Competition registry sheet (fixed id in `api/_lib/sheetAllowlist.js` and `App.jsx`) | Tero | `App.jsx`, `api/rekisteri.js`, `api/_lib/sheetAllowlist.js` (column E: the API only serves sheets listed here) |

Tab names are matched exactly (case-insensitive in `api/kisaData.js`). `Timetable` is accepted as a fallback for `Aikataulu`.

## Columns

Most tabs are read by **header name** from the first row (uppercased, non-alphanumerics removed),
so column order can change but header names must not.

- `Tulokset Y`: `NIMI`, `SARJA`, `SEURA`, day columns `LA` / `AP` / `LAUANTAI…` / `AAMUP…` and
  `SU` / `IP` / `SUNNUNTAI…` / `ILTAP…`, `TULOS`, round columns, `RATKO` (tie-break) and status values.
- `Ilmoittautuneet`: `NIMI`, `SARJA`, `SEURA`, `KILPAILUNUMERO` / `KISA_NUMERO` / `NUMERO`.
- `NEW_Joukkue`: `SIJA` / `RANK`, `JOUKKUE` / `TEAM`, `NIMI` / `AMPUJA` / `SHOOTER`, `SARJA` / `CLASS`,
  `TULOS` / `YHT…` / `TOTAL…`, and lane columns whose header is exactly `1`, `2`, ….
- `KISANSPEKSIT` station table: header containing `ASEMA` / `RATA` / `LANE` / `STATION`, a max column
  (`MAKS` / `MAX` / `MAARA` / `COUNT`) and an optional second-best column (`TOISEKSI` / `SECOND`).
  Fallback when no header is found: columns J, K, L (index 9, 10, 11).
- `Aikataulu*`: first row is the title row (label and date); header row matched by name; lane columns
  detected from header labels.

**Read by position** (fragile, keep stable):
- `KISANSPEKSIT` in ScoringLib (`ConfigManager.js`, range `A1:M28`): F3 layout, F4 start time, F5 interval,
  F6 group count, F7 daily count, F13 Kiti daily-only, B18 red bar, B19 second-best toggle, B20 referee categories,
  H3:H10 track names, J3:M28 station table (id, max, second best, interval). The UI's station-table fallback
  (J, K, L) relies on the same columns.
- Competition registry: A id, B name, C start date, D end date, E sheet id (a bare id: the UI passes it to the API unchanged and the API allowlist only accepts ids), F team competition flag,
  G hidden flag (flags: `1`/`true`/`yes`/`on`/`x` = yes, `0`/`false`/`no`/`off` = no). Row 1 is a header if B contains "nimi" or A contains "id".
- `Kierrokset`: column B is the shooter id (`api/laukaukset.js`).

## `KISANSPEKSIT` settings

Keys are found anywhere on the tab; the value must be in one of the two cells right of the key.
Keys and values are matched case-insensitively with Ä/Ö/Å read as A/O/A and spaces ignored, so
`Aikataulu näkyvyys` matches `AIKATAULU_NAKYVYYS` and `Erät` matches `ERAT`.
Each setting accepts several spellings (see `src/utils/kisaAsetukset.js` and `src/utils/kisaStatus.js`):

| Setting | Accepted keys | Values |
|---|---|---|
| Competition status | `STATUS`, `KISA_STATUS`, `KILPAILU_STATUS`, `KISA_PAATTYNYT`, … | e.g. `KAYNNISSA`, `TAUOLLA`, `PAATTYNYT`, `TULOSSA` |
| Timetable visibility | `AIKATAULU_NAKYVYYS`, `AIKATAULU_JULKINEN`, `TIMETABLE_VISIBILITY`, `TIMETABLE_PUBLIC` | `ALWAYS`, `AFTER_START`, `OFF` (and synonyms) |
| Timetable model | `AIKATAULU_MALLI`, `AIKATAULU_NAKYMA`, `TIMETABLE_MODEL`, `TIMETABLE_VIEW`, `SCHEDULE_MODEL` | `GROUPS`, `INLINE` |
| Timetable grouping | `AIKATAULU_RYHMITTELY`, `AIKATAULU_RYHMAKOKO`, `TIMETABLE_GROUPING`, `TIMETABLE_GROUP_SIZE`, `GROUPING_MODE` | `5`, `6`, `INLINE` |
| Sponsor logos | `LOGOT_NAKYVYYS`, `SPONSOR_LOGOS_VISIBILITY`, `SPONSOR_LOGO_NAKYVYYS`, `AIKATAULU_LOGOT` | on / `OFF` |
| Tie-break prize places | `RATKO_PALKINTO_SIJA`, `TIEBREAK_PRIZE_PLACE` | number, default 3 |

## To do

- Add CSV fixtures exported from the dev sheet under `contract/fixtures/` and use them in tests.
- Confirm the exact header row of `Tulokset Y` and `Kierrokset` against the dev sheet.
