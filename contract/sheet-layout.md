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
| `KISANSPEKSIT` | Organiser, ScoringLib (`KilpailuPohja.js` on a new competition: settings, layout names, station table, `KILPAILUNSTATUS`, `AIKATAULU_NAKYVYYS`, `AIKATAULU_MALLI`, `AIKATAULURYHMAKOKO`, `OPEN_SARJA`, `HIGH_GUN`, `HIGH_GUN_POIS_SARJOISTA`, and the library-only `KILPAILUTYYPPI`, `ALKUPAIVA`, plus `RYHMAVALI`, `ISTUNTOTAUKO` on group-timetable types; `TimetableTauko.js`; `Utils.js`) | `App.jsx`, `utils/henkiloTulokset.js`, `utils/kisaAsetukset.js`, `utils/openSarja.js`, `utils/highGun.js` |
| `Tulokset Y` | Sheet formulas from the main entry tab | `HenkiloTaulukko.jsx`, `HenkiloTulokset.jsx`, `utils/henkiloTulokset.js` |
| `NEW_Joukkue` | Sheet formulas | `JoukkueTulokset.jsx` |
| `Ryhmäjako` | Sheet / ScoringLib (`Distributor.js`) | `RyhmaJako.jsx` |
| `Ilmoittautuneet` | Organiser / import | `Ilmoittautuneet.jsx` |
| `Aikataulu`, `Aikataulu La`, `Aikataulu Su` | ScoringLib (`TimetableTauko.js` for Compak; `KilpailuPohja.js` menu "Luo aikataulu" for the group timetable, after registration; a new competition has only an instruction text in A1) or template (`templates/sheets/Aikataulu_*_template.csv`) | `AikatauluNakyma.jsx`, `AikatauluRyhmaNakyma.jsx`, `TulosteAikataulu.jsx` (Compak printout), `utils/aikatauluRadat.js` |
| `OSALLISTUJAT+TULOKSET` (named range `OSALLISTUJAT`) | Organiser, ScoringLib (`Distributor.js` shuffle), squad editor (`RyhmaJako.jsx`, organiser's own account) | `RyhmaJako.jsx` only, not through `api/` |
| `RANKING_vvvv` (season ranking sheet, e.g. `RANKING_2026`) | Sheet formulas from the ranking sheet's `TULOKSET` / `KISAT` tabs | `RankingTulokset.jsx`, `utils/rankingTulokset.js` |
| `KISAT` (season ranking sheet) | Tero | `RankingTulokset.jsx`, `utils/rankingTulokset.js` (competition names) |
| Competition registry sheet (fixed id in `api/_lib/sheetAllowlist.js`) | Tero | `App.jsx` through `api/rekisteri.js`, `api/_lib/sheetAllowlist.js` (column E: the API only serves sheets listed here; columns C/D set how long `api/kisa.js` caches a competition; column I is the place for the weather forecast, `api/saa.js`) |

Tab names are matched case-insensitively, ignoring leading and trailing spaces (`api/_lib/sheetsData.js`). `Timetable` is not requested or served (the API only serves `Aikataulu*`).

The API serves only the tabs in the table above (`SALLITUT_VALILEHDET` in `api/_lib/sheetsData.js`, plus any tab named
`RANKING_` and a four-digit year, and `KISAT`, on sheets marked `RANKING` in the registry); any other tab
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
  `TESTI` = permanent test competition, any other value is ignored),
  I place (optional): a place name in Finland (`Oulainen`, looked up by the Finnish Meteorological Institute) or
  coordinates with decimals (`64.27, 24.81` or `64,27 24,81`). With a place, upcoming and running competitions show a
  weather forecast from the Finnish Meteorological Institute for one day (the start day of an upcoming competition, the next competition day of a
  running one) when it is within the next 10 days; empty means no forecast. Row 1 is a header if B contains "nimi" or A contains "id".

## Permanent test competitions

A registry row with `TESTI` in column H is a test competition that never ends. The UI and the API treat it as being
on its competition day whatever its C and D dates are: the timetable (all of its days), results and status follow its
`KISANSPEKSIT` (`KILPAILUNSTATUS`, timetable visibility), and `api/kisa.js` caches it like a running competition
(never stored as finished). Without `KILPAILUNSTATUS` it shows as "Tulossa" with its registrations; with `RUNNING`
the results show. The front page lists it first in the current year, before the real competitions, with its own dates. Combine with G to keep
it off the public list (visible with `?preview=1`).

## Season ranking

A registry row with `RANKING` in column H is a season ranking, not a competition. C is the season's start date and
D its end date. The front page orders it by D (competitions by C). The UI reads the tabs `RANKING_<year of C>`, `KISAT`
and, if it exists, `KISANSPEKSIT`. The ranking is "Käynnissä" from C to D without any `KILPAILUNSTATUS` and "Päättynyt"
after D, or earlier when a `KISANSPEKSIT` tab in the ranking sheet has `KILPAILUNSTATUS` = `FINISHED`. Without D it
runs until `FINISHED`. The API caches it by C and D like a competition (without D: running from C on), and serves
`RANKING_vvvv` and `KISAT` only from sheets marked `RANKING` (400 otherwise).

`KISAT` is read by header name: the first row with `Koodi`; `Koodi` is the competition code used as a
`RANKING_vvvv` column header and `Kisa` its name, shown instead of the code.

`RANKING_vvvv` is read by header name, not position:
- Header row: the first row with both `Nimi` and `Sarja`. Columns `Sija`, `Nimi`, `Sarja`, `Seura`, `Yhteensä`,
  `Tuloksia`; the competition columns follow the last of these and end at the first empty header.
- The row above the header: the competition level above each competition column (`SM ★`, `Ranking` ...), and the
  helper headers `tila (auto)` (1 = required results and at least 4 results, 2 = required results, under 4,
  3 = under 2 championship results) and `mukana (auto)`, where one column per competition, in the same order,
  holds `1` when that result counts in the total.
- Category filters combine the `Sarja` values: Seniorit = `Y56`, `Y66`, `Y73`; Juniorit = `Y17`, `Y20`;
  Naiset = `N`; Open = everyone. Places inside a filter follow the sheet's order.

## Squad editing (organisers)

`RyhmaJako.jsx` ("Järjestäjälle: muokkaa ryhmiä") lets an organiser move a shooter to a free place, reorder a
squad, or swap two shooters between squads. It does not
go through `api/`: the browser reads and writes the sheet with the organiser's own Google sign-in
(`spreadsheets` scope, `utils/googleKayttaja.js`), so only accounts that can edit the competition sheet can save.
It depends on:

- The named range `OSALLISTUJAT` on the main tab (`OSALLISTUJAT+TULOKSET`), with the header row directly above it.
- Squads and shooter numbers come from the row position in that range: Sporting/ESP `Ryhmä` is
  `ROUNDUP(SEQUENCE()/size)`, `NRO` is `SEQUENCE(COUNTA(C2:C))`, and the Compak timetable refers to main-tab rows.
  The editor takes each shooter's squad from the `Ryhmä` column when the tab has one (Sporting/ESP), otherwise
  squads of `AIKATAULU_RYHMAKOKO` (6 when `6`, otherwise 5).
- Header names: name column containing `NIMI` / `NAME` / `OSALLISTUJA` (as `Distributor.js`), `SARJA`, `SEURA`,
  `NRO`, and station result columns whose header is a number `1`..`N`. The shooter's columns end at the first
  empty header (the `Ohjeita` column after it is not moved).
- A swap moves every entered value (not formulas, not cells filled by array formulas) between the two rows in those
  columns, so check-in, name, class, club and tie-break move with the shooter. Shooters with any station result
  are not moved, and neither are names filled by a formula. A swap is refused when one row has a formula where the
  other has a typed value. Rows are re-read just before writing; if either name has changed, nothing is written.
- Free places use the shuffle's convention: the name cell holds the place's own number (`Distributor.js` skips
  numeric names), so `COUNTA` numbering stays contiguous. Moving a shooter to a free place writes the shooter's
  values there and leaves the old row as a free place (its number as the name, other entered columns cleared).
  Moving to an empty row past the last shooter also writes free-place numbers into the empty rows before it.
  Reordering inside a squad shifts the rows between by one. Formula cells are never written.
- Start times shown per squad are read from the `Aikataulu*` tabs the API already serves: the group timetable
  by squad number (Sporting/ESP), the Compak lane grid by shooter number (earliest time of the squad's places per day).

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
| Classes that don't referee (highlighted in the squad editor) | `Ei tuomaroivat:` | comma-separated classes in the cell right of the key (B20 when the key is missing), matched exactly to `SARJA`, as ScoringLib's shuffle | none |
| All-shooters category | `OPEN_SARJA` | `Y` (shown as Y, everyone; Finnish rules), `OPEN` or `Y (OPEN)` (shown as Y (OPEN), open to foreign shooters), `EI` or `FALSE` (no all-shooters category, only the classes; a `Y` class is then shown like any other) | none if every `Tulokset Y` category is a class: a letter A–F alone or followed by a non-letter (`A`, `A (Y)`, `B Y56`, `D-metsästäjä`), ignoring manual High Gun categories (`HG`, `1HG`); otherwise `Y` |
| High Gun prize places | `HIGH_GUN` | whole number; the best overall scores up to this place (ties included) get a High Gun list on screen and in the printout | 0 (no High Gun) |
| High Gun winners leave their category | `HIGH_GUN_POIS_SARJOISTA` | `TRUE`; `FALSE`, `EPÄTOSI`, `0` or `EI` turn it off (category lists are ranked without the High Gun winners, so the next shooter moves up; the all-shooters list is unchanged) | `TRUE` |

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
The group timetable (menu "Luo aikataulu", Sporting / FITASC / ESP only; on a
Compak sheet it stops and points to the Compak menus) also read, with no fallback cell:
- `KILPAILUTYYPPI`: `SPORTING`, `FITASC` or `ESP` (`COMPAK` stops the menu as above). Missing or unknown, the type is
  guessed from `AIKATAULU_MALLI` and stations per layout (1 = FITASC, 6 = ESP, otherwise Sporting) and the finished message says so.
- `ALKUPAIVA`: first competition day, a date cell, `YYYY-MM-DD` or `D.M.YYYY`, for the day names; otherwise Lauantai / Sunnuntai.
- `RYHMAVALI`: minutes between group starts; missing, empty or 0 gives the type's 15.
- `ISTUNTOTAUKO`: minutes between sessions; 0 is allowed, missing or empty gives 60.
`ALOITUS_AIKA` and `LAYOUT/PÄIVÄ` are read as in the table above (fallback F4 / F6). ScoringLib writes `KILPAILUTYYPPI` and
`ALKUPAIVA` on every new competition and `RYHMAVALI` / `ISTUNTOTAUKO` only on group-timetable types. The UI reads none of these four.
`OPEN_SARJA` (prize list, `PrizeModule.js`) has no fallback cell either: without it the library makes the same
guess as the UI from the categories of `Tulokset Y`. Keep its value in the cell right next to the key, since
the library reads only that cell.

## Mobile score entry (`api/kirjaus.js`)

One of ScoringUI's two write paths (the other is squad editing with the organiser's own Google sign-in). It uses a second service account (`KIRJURI_CLIENT_EMAIL`,
`KIRJURI_PRIVATE_KEY`, scope `spreadsheets`) that is Editor only on the competitions that use mobile entry; a sheet
not shared with it answers "Mobiilikirjaus ei ole käytössä". Access is a layout code signed with `KIRJAUS_SALAISUUS`
(ScoringLib makes the same codes). Design: `design/mobile-score-entry.md` in the project files.

Reads (with the writer account):
- `Aikataulu`, `Aikataulu La`, `Aikataulu Su` lane grids, as above. The lane header may sit above the time or the
  name column. With more than one timetable tab, `LAYOUT/PÄIVÄ` picks the tab for result column N (columns 1..n on
  the first tab in the order above, n+1.. on the next). On that tab the lane is the one whose header names `RATA N`
  (in `RATA1 / RATA3` the part after the `RATOJEN VAIHTO` row), otherwise the tab's ((N - 1) mod n) + 1th lane.
  The layout's queue is its own starters, then the previous lane's starters, and so on.
  A `TAUKO` row in the lane (empty number) marks a break before the next shooter: the device empties the line first.
- `KISANSPEKSIT` keys `RATAn_NIMI` (layout name shown on the device), `LAYOUT/PÄIVÄ` and the optional
  `RATAn_OHJELMA`: the layout's program, the same on every stand: `SSSD`, `SDD` or `SSSSS` (`S` single, `D` double,
  singles first, 5 targets per stand). Without it the program is set on the device.

The device runs the Compak inline line: shooters enter stand 1 in queue order, the shooters on the line shoot one
single or double each in stand order 1 → 5 until each has shot the 5 targets of their stand, then everyone moves one
stand on. The card format does not depend on this; marks are still written per target.

Writes (created on the first save or change of device if missing):
- `MOBIILI Rata N` (N = result column `1`..`N` of `OSALLISTUJAT+TULOKSET`): header row
  `NRO, NIMI, TULOS, PÄIVITETTY, LAITE, VERSIO, 1..25`; the shooter with number n is on row n + 1. Marks `X` hit,
  `O` miss, empty not shot; `TULOS` counts the `X`s; `NIMI` is the name the device showed. A save with a version not
  newer than `VERSIO` writes nothing. The card row and its log row are written in one request.
- `MOBIILI_LOKI`: one appended row per accepted save: `AIKA, RATA, NRO, LAITE, VERSIO, ENNEN, JÄLKEEN, HUOM`.
  `HUOM` is empty on a save. A change of device adds a row with `RATA OTETTU: …` or `RATA LUOVUTETTU …` (no shooter).
  A replaced device (e.g. its battery died and the layout was taken with a PIN) never writes card rows: its marks on
  targets still empty on the tab are handed to the holder in `MOBIILI_LAITTEET` `TÄYDENNYKSET` (log `KORVATTU LAITE:
  VÄLITETTY RADAN LAITTEELLE`), and the holder fills its own empty targets with them and saves as usual. Targets where it
  differs from the tab are logged as `N ERI MERKINTÄÄ, TAULUKON MERKINTÄ JÄI` for the office; `JÄLKEEN` is the replaced
  device's card. A log made before `HUOM` existed (7 columns) is widened on the next
  change of device or save.
- `MOBIILI_LAITTEET`: the device holding each layout, so one device writes a layout at a time. Header
  `RATA, SUKUPOLVI, LAITE, LAITTEEN NIMI, OTETTU, TAPA, PIN-VIRHEET, LINJA, LINJA PÄIVITETTY, TÄYDENNYKSET`; layout N is
  on row N + 1 (a tab made before `TÄYDENNYKSET` is widened).
  `SUKUPOLVI` grows on every change of device; a device's key is valid only for its own generation, so a replaced device
  can no longer write. `LAITE` empty = free: the next device takes the layout without a PIN. A taken layout changes
  device with the old device's key (its menu: release, or a QR transfer) or the takeover PIN, an HMAC of
  `pin|sheetId|N|SUKUPOLVI` (ScoringLib shows it in 📱 Mobiilikirjaus › Laitteen vaihto: PIN-koodit). Ten wrong PINs lock
  the takeover until ScoringLib shows the PINs again (it writes `PIN-VIRHEET` = 0). `LINJA` is the device's line state as
  JSON (shooters added or skipped on the device, breaks, retired shooters, the device's program), so the next device
  carries on the same line. `TÄYDENNYKSET` is JSON `{ "<NRO>": "<25 marks X/O/->" }` from replaced devices, written only
  by them.

Nothing is written to `OSALLISTUJAT+TULOKSET` yet: the office copies the totals.

## To do

- Add CSV fixtures exported from the dev sheet under `contract/fixtures/` and use them in tests.
- Confirm the exact header row of `Tulokset Y` against the dev sheet.
