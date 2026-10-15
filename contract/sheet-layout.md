# Sheet layout contract

ScoringUI does not call ScoringLib. Vercel functions in `api/` read the competition spreadsheets
directly with the service account (Sheets API `values:batchGet`), and the frontend parses the tabs as CSV. This file lists every tab, column and setting
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
| `KISANSPEKSIT` | Organiser, ScoringLib (`KilpailuPohja.js` on a new competition: settings, layout names, station table, `KILPAILUNSTATUS`, `AIKATAULU_NAKYVYYS`, `AIKATAULU_MALLI`, `AIKATAULURYHMAKOKO`; `TimetableTauko.js`; `Utils.js`) | `App.jsx`, `utils/henkiloTulokset.js` |
| `Tulokset Y` | Sheet formulas from the main entry tab | `HenkiloTaulukko.jsx`, `HenkiloTulokset.jsx`, `utils/henkiloTulokset.js` |
| `NEW_Joukkue` | Sheet formulas | `JoukkueTulokset.jsx` |
| `Ryhmäjako` | Sheet / ScoringLib (`Distributor.js`) | `RyhmaJako.jsx` |
| `Ilmoittautuneet` | Organiser / import | `Ilmoittautuneet.jsx` |
| `Aikataulu`, `Aikataulu La`, `Aikataulu Su` | ScoringLib (`TimetableTauko.js`) or template (`templates/sheets/Aikataulu_*_template.csv`) | `AikatauluNakyma.jsx`, `AikatauluRyhmaNakyma.jsx`, `TulosteAikataulu.jsx` (Compak printout), `utils/aikatauluRadat.js` |
| `RANKING_vvvv` (season ranking sheet, e.g. `RANKING_2026`) | Sheet formulas from the ranking sheet's `TULOKSET` / `KISAT` tabs | `RankingTulokset.jsx`, `utils/rankingTulokset.js` |
| Competition registry sheet (fixed id in `api/_lib/sheetAllowlist.js`) | Tero | `App.jsx` through `api/rekisteri.js`, `api/_lib/sheetAllowlist.js` (column E: the API only serves sheets listed here; columns C/D set how long `api/kisa.js` caches a competition) |

Tab names are matched case-insensitively, ignoring leading and trailing spaces (`api/_lib/sheetsData.js`). `Timetable` is not requested or served (the API only serves `Aikataulu*`).

The API serves only the tabs in the table above (`SALLITUT_VALILEHDET` in `api/_lib/sheetsData.js`, plus any tab named
`RANKING_` and a four-digit year); any other tab
(`Suomisport Import`, `KITI_DATA`, score cards ...) is refused with 400. A new tab the UI reads must be added there.

Access: the sheets and the registry are read only with the service account (`spreadsheets.readonly` scope),
so each of them must be shared with it (Viewer is enough). They don't need "anyone with the link" sharing.

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
  Lane-grid (Compak) tabs have three columns per lane: time, shooter number, name. A name that is only a
  number is an empty slot; `TAUKO` with no number is a break; a name ending in U+200B (zero-width space)
  starts as referee. The screen and the printout read these the same way.
  When the layouts are shot twice (e.g. 100 targets on two stands), the later round continues in the same
  lane columns below a row with `RATOJEN VAIHTO` (no number) in the name column, and the lane header names
  both layouts (`RATA1 / RATA3`). `TAUKO` and `RATOJEN VAIHTO` rows keep their time in the time column.

**Read by position** (fragile, keep stable):
- The UI's `KISANSPEKSIT` station-table fallback (columns J, K, L) when no header is found. Sheets made
  before 2026-10-13 have the header `Layout` / `Max`, which the UI does not match, so for them the UI reads
  J, K, L: keep their station table there. The master template now has `Asema` / `Maks` / `Toiseksi paras`
  in F2:H2 (data F3:I28), which both the UI and ScoringLib match, so new sheets don't depend on the fallback.
- ScoringLib's `KISANSPEKSIT` fallback cells (see "Keys ScoringLib reads"), used when a key's text is missing.
- Competition registry: A id, B name, C start date, D end date, E sheet id (a bare id: the UI passes it to the API unchanged and the API allowlist only accepts ids), F team competition flag,
  G hidden flag (flags: `1`/`true`/`yes`/`on`/`x` = yes, `0`/`false`/`no`/`off` = no), H type (`RANKING` = season ranking,
  any other value is ignored). Row 1 is a header if B contains "nimi" or A contains "id".

## Season ranking

A registry row with `RANKING` in column H is a season ranking, not a competition. C is the season's start date and
D its end date (may be empty). The UI reads the tab `RANKING_<year of C>` and, if it exists, `KISANSPEKSIT`.
The ranking is "Käynnissä" from C onwards until `KILPAILUNSTATUS` is `FINISHED` (or `PAUSED`) on a `KISANSPEKSIT` tab
in the ranking sheet; the end date does not end it. Without D the API caches it like a running competition from C on.

`RANKING_vvvv` is read by header name, not position:
- Header row: the first row with both `Nimi` and `Sarja`. Columns `Sija`, `Nimi`, `Sarja`, `Seura`, `Yhteensä`,
  `Tuloksia`; the competition columns follow the last of these and end at the first empty header.
- The row above the header: the competition level above each competition column (`SM ★`, `Ranking` ...), and the
  helper headers `tila (auto)` (1 = required results and at least 4 results, 2 = required results, under 4,
  3 = under 2 championship results) and `mukana (auto)`, where one column per competition, in the same order,
  holds `1` when that result counts in the total.
- Category filters combine the `Sarja` values: Seniorit = `Y56`, `Y66`, `Y73`; Juniorit = `Y17`, `Y20`;
  Naiset = `N`; Open = everyone. Places inside a filter follow the sheet's order.

## `KISANSPEKSIT` settings

Keys are found anywhere on the tab; the value is the next non-empty cell to the right.
Keys and values are matched case-insensitively with Ä/Ö/Å read as A/O/A and spaces and underscores
ignored, so `Aikataulu näkyvyys` matches `AIKATAULU_NAKYVYYS`. Each setting has one key and a fixed set
of values, the forms the competition sheets use (see `src/utils/kisaAsetukset.js` and `src/utils/kisaStatus.js`).
Any other key or value is ignored and the default applies.

| Setting | Key | Values | Default |
|---|---|---|---|
| Competition status | `KILPAILUNSTATUS` | `FINISHED`, `RUNNING`, `PAUSED`, `UPCOMING` | from the dates in the registry |
| Timetable visibility | `AIKATAULU_NAKYVYYS` | `TRUE` (shown until the competition ends), `AFTER_START` (shown once results are), `FALSE` (hidden) | as `TRUE` |
| Timetable model | `AIKATAULU_MALLI` | `GROUPS`, `INLINE` | `INLINE` (but a group size forces `GROUPS`) |
| Timetable grouping | `AIKATAULU_RYHMAKOKO` | `5`, `6`, `INLINE` | `INLINE` |
| Sponsor logos | `LOGOT_NAKYVYYS` | `TRUE`, `FALSE` | shown |
| Tie-break prize places | `RATKO_PALKINTO_SIJA` | number | 3 |

### Keys ScoringLib reads

ScoringLib (`Speksit.js`) finds these keys anywhere on the tab. Matching differs from the UI's in three ways:
only Ä/Å/Ö are folded (to A/A/O) and every other non-letter, non-digit is dropped; the first copy of a key wins;
and the value is only the cell right of the key, never a cell further right. When a key is missing, the library
uses the fallback cell. Renaming a key therefore makes the library read the fallback cell, except:
- a missing `RATAn_NIMI` continues the column of the nearest `RATAn_NIMI` key found (H3:H10 only if there are none);
- the timetable writes the resolved addresses of `Korostukset päällä`, `Ei tuomaroivat:`, `Isäntäseura` and
  `Järjestävät seurat:` into `INDIRECT` formulas when it is built, so moving those keys needs the timetable rebuilt.

| Key | Used for | Fallback |
|---|---|---|
| `OSALLISTUJAT` | participant count estimate | B2 |
| `LAYOUT/KISA` | result columns (stations / layouts) | F3 |
| `ALOITUS_AIKA` | timetable start time | F4 |
| `AMPUJAN_AIKA` | timetable interval | F5 |
| `LAYOUT/PÄIVÄ` | layouts per day | F6 |
| `Päivätuloksia kpl` | daily result columns | F7 |
| `Vain päivätulokset` | Kiti daily-only | F13 |
| `Bib tuomaroivat` | bib red bar | B18 |
| `Korostukset päällä` | highlights toggle | B19 |
| `Ei tuomaroivat:` | referee categories | B20 |
| `Isäntäseura` | host club toggle | B23 |
| `Järjestävät seurat:` | host clubs | B24 |
| `RATA1_NIMI`..`RATA8_NIMI` | layout names | H3:H10 |
| Station table headers: an id header exactly `LAYOUT` / `ASEMA` / `RATA` / `LANE` / `STATION` with a max header exactly `MAX` / `MAKS` / `MAARA` / `COUNT` right next to it (the UI matches differently, see above) | station table below: id, max, second best, interval | J3:M28 |

Keys ScoringLib reads with no fallback cell (the feature that needs them is skipped or stops with an error
when they are missing): `AIKATAULU_MALLI`, `AIKATAULURYHMAKOKO`, `Asemien määrä`, `Tyhjän ruudun symboli`.

## To do

- Add CSV fixtures exported from the dev sheet under `contract/fixtures/` and use them in tests.
- Confirm the exact header row of `Tulokset Y` against the dev sheet.
