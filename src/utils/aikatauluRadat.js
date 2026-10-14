// Compak-aikataulu (rata-ruudukko): ratojen tunnistus ja tulostettavat rivit.
// Välilehden muoto (ScoringLib TimetableTauko.js): rivi 1 otsikko "AIKATAULU | pvm", ratarivillä
// "RATA N nimi" ja jokaisella radalla kolme saraketta: aika, numero, ampuja.

// Ratakohtaisia sarakkeita tulostetaan yhdelle sivulle enintään näin monta.
export const TULOSTE_RATOJA_SIVULLA = 4;

// Nimen perässä oleva näkymätön merkki (U+200B) tarkoittaa aloitustuomarointia.
const TUOMARIMERKIT = /\u200B/g;
const ON_TUOMARIMERKKI = /\u200B/;

export function toSortValue(timeText) {
  const cleaned = String(timeText || '').trim();
  const m = cleaned.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}

export function isTimeLike(value) {
  return /(\d{1,2})[:.](\d{2})/.test(String(value || '').trim());
}

export function isLaneHeader(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^RATA\s*\d+/.test(text) || /^LANE\s*\d+/.test(text) || /^\d+\s+\S+/.test(text);
}

export function extractTitleSuffixFromFirstRow(row) {
  const first = String(row?.[0] || '').trim();
  const second = String(row?.[1] || '').trim();
  if (second) return second;

  const separatorIndex = first.indexOf('|');
  if (separatorIndex === -1) return '';

  return first.slice(separatorIndex + 1).trim();
}

// Palauttaa radat [{ label, startIndex }]; startIndex on radan aikasarake.
export function tunnistaRataSarakkeet(rows) {
  const laneHeaderRow = rows.find((row) => Array.isArray(row) && row.some(isLaneHeader));
  const laneColumns = [];
  if (!laneHeaderRow) return laneColumns;

  for (let i = 0; i < laneHeaderRow.length; i++) {
    if (!isLaneHeader(laneHeaderRow[i])) continue;
    let startIndex = i;
    if (i > 0 && !isLaneHeader(laneHeaderRow[i - 1])) {
      startIndex = i - 1;
    }
    const rawLabel = String(laneHeaderRow[i]).trim();
    // "RATA 1 Jake" / "LANE 1 Jake" -> "1 Jake"
    const match = rawLabel.toUpperCase().match(/^(?:RATA|LANE)\s*(\d+\s*.*)/i);
    const cleanLabel = match ? match[1] : rawLabel;
    laneColumns.push({ label: cleanLabel, startIndex });
  }
  return laneColumns;
}

// Rivit, joilla on ampuja ja aika; ruudun aika on radan oma, muuten rivin ensimmäinen aika.
export function muodostaRataRivit(rows, laneColumns) {
  const laneRows = [];
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    const laneSlots = laneColumns.map((lane) => ({
      lane: lane.label,
      time: String(row[lane.startIndex] || '').trim(),
      number: String(row[lane.startIndex + 1] || '').trim(),
      shooter: String(row[lane.startIndex + 2] || '').trim()
    }));

    const hasAnyShooter = laneSlots.some((slot) => slot.shooter);
    const globalTimeSlot = laneSlots.find((slot) => isTimeLike(slot.time));
    if (!hasAnyShooter || !globalTimeSlot) return;

    const rowTime = globalTimeSlot.time;
    const slots = laneSlots.map((slot) => ({ ...slot, time: isTimeLike(slot.time) ? slot.time : rowTime }));
    laneRows.push({ id: `${rowIndex}-${rowTime}`, time: rowTime, slots });
  });
  return laneRows;
}

function tulosteRuutu(slot) {
  const raaka = String(slot.shooter || '');
  const nimi = raaka.replace(TUOMARIMERKIT, '').trim();
  const nro = String(slot.number || '').trim();
  if (!nimi && !nro) return { aika: '', nro: '', nimi: '', tuomari: false, tauko: false };
  return {
    aika: slot.time,
    nro,
    // Pelkkä numero nimen paikalla on varattu mutta nimetön paikka: tulostetaan numero ilman nimeä.
    nimi: /^\d+$/.test(nimi) ? '' : nimi,
    tuomari: ON_TUOMARIMERKKI.test(raaka),
    tauko: nimi.toUpperCase() === 'TAUKO' && !nro
  };
}

// Jakaa radat sivuille tasaisesti, enintään TULOSTE_RATOJA_SIVULLA rataa kerrallaan (6 -> 3+3, 8 -> 4+4).
function jaaRadatSivuille(radat) {
  const sivuja = Math.max(1, Math.ceil(radat.length / TULOSTE_RATOJA_SIVULLA));
  const koko = Math.ceil(radat.length / sivuja);
  const osat = [];
  for (let i = 0; i < radat.length; i += koko) osat.push(radat.slice(i, i + koko));
  return osat;
}

// Palauttaa { otsikko, osat: [{ radat, yhteinenAika, rivit: [{ id, aika, ruudut }] }] } tai null,
// jos välilehti ei ole rata-ruudukko. yhteinenAika: kaikilla tämän osan radoilla on joka rivillä sama aika,
// jolloin aika tulostetaan kerran rivin alkuun eikä jokaiselle radalle.
export function muodostaTulosteAikataulu(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const laneColumns = tunnistaRataSarakkeet(rows);
  if (laneColumns.length < 2) return null;

  // Sama järjestys kuin näytöllä (AikatauluNakyma): rivit ajan mukaan, tasatilanteessa välilehden järjestys.
  const laneRows = muodostaRataRivit(rows, laneColumns).sort((a, b) => toSortValue(a.time) - toSortValue(b.time));
  if (laneRows.length === 0) return null;

  const indeksit = laneColumns.map((_, i) => i);
  const osat = jaaRadatSivuille(indeksit).map((rataIndeksit) => {
    const rivit = laneRows
      .map((row) => ({ id: row.id, ruudut: rataIndeksit.map((i) => tulosteRuutu(row.slots[i])) }))
      .filter((rivi) => rivi.ruudut.some((r) => r.nimi || r.nro || r.tauko));
    const yhteinenAika = rivit.every((rivi) => {
      const ajat = new Set(rivi.ruudut.filter((r) => r.aika).map((r) => r.aika));
      return ajat.size <= 1;
    });
    return {
      radat: rataIndeksit.map((i) => laneColumns[i].label),
      yhteinenAika,
      rivit: rivit.map((rivi) => ({ ...rivi, aika: rivi.ruudut.find((r) => r.aika)?.aika || '' }))
    };
  });

  return { otsikko: extractTitleSuffixFromFirstRow(rows[0]), osat };
}
