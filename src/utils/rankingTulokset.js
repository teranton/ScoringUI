// src/utils/rankingTulokset.js
// Kauden rankingin (RANKING_vvvv-välilehti) tulkinta ja yhdistettyjen sarjojen suodatus.
//
// Välilehden rakenne (Sporting_Ranking-taulukko): otsikkorivi, jolla on Sija / Nimi / Sarja / Seura / Yhteensä /
// Tuloksia ja niiden perässä kisakoodit (CSP_SM ...). Otsikkorivin yläpuolella on kisojen taso (SM ★, Ranking, EM ...)
// ja apusarakkeiden otsikot `tila (auto)` ja `mukana (auto)`. Tila: 1 = pakolliset ja vähintään 4 tulosta,
// 2 = pakolliset, alle 4 tulosta, 3 = alle 2 SM-tulosta. Mukana-sarakkeet (yksi per kisa, samassa järjestyksessä
// kuin kisat) kertovat, lasketaanko tulos kokonaispisteisiin (1).
import { normalisoiOtsikko } from './henkiloTulokset.js';

export const RANKING_KAIKKI = 'OPEN';

// Rankingin sarjat: Open sisältää kaikki, muut yhdistävät kisojen sarjoja.
export const RANKING_SARJAT = [
  { avain: RANKING_KAIKKI, sarjat: null },
  { avain: 'SENIORIT', sarjat: ['Y56', 'Y66', 'Y73'] },
  { avain: 'JUNIORIT', sarjat: ['Y17', 'Y20'] },
  { avain: 'NAISET', sarjat: ['N'] }
];

// Välilehden nimi rekisterin alkupäivän vuodesta.
export function rankingValilehdenNimi(vuosi) {
  return `RANKING_${Number.isInteger(vuosi) ? vuosi : new Date().getFullYear()}`;
}

const onTyhja = (arvo) => String(arvo ?? '').trim() === '';

function etsiOtsikkorivi(rivit) {
  return rivit.findIndex((rivi) => {
    const otsikot = (rivi || []).map(normalisoiOtsikko);
    return otsikot.includes('NIMI') && otsikot.includes('SARJA');
  });
}

export function parsiRanking(rivit) {
  const tyhja = { ampujat: [] };
  if (!Array.isArray(rivit) || rivit.length === 0) return tyhja;

  const otsikkoIdx = etsiOtsikkorivi(rivit);
  if (otsikkoIdx === -1) return tyhja;

  const otsikot = rivit[otsikkoIdx].map(normalisoiOtsikko);
  const tasoRivi = otsikkoIdx > 0 ? rivit[otsikkoIdx - 1] || [] : [];
  const tasoOtsikot = tasoRivi.map(normalisoiOtsikko);
  const idx = (nimi) => otsikot.indexOf(nimi);

  const idxSija = idx('SIJA');
  const idxNimi = idx('NIMI');
  const idxSarja = idx('SARJA');
  const idxSeura = idx('SEURA');
  const idxYhteensa = otsikot.findIndex((o) => o.startsWith('YHTEENSA') || o === 'PISTEET');
  const idxTuloksia = otsikot.findIndex((o) => o.startsWith('TULOKSIA'));

  // Kisasarakkeet alkavat viimeisen tunnetun sarakkeen jälkeen ja jatkuvat ensimmäiseen tyhjään otsikkoon.
  const kisatAlku = Math.max(idxSija, idxNimi, idxSarja, idxSeura, idxYhteensa, idxTuloksia) + 1;
  const kisat = [];
  for (let i = kisatAlku; i < rivit[otsikkoIdx].length && !onTyhja(rivit[otsikkoIdx][i]); i++) {
    kisat.push({ koodi: String(rivit[otsikkoIdx][i]).trim(), taso: String(tasoRivi[i] ?? '').trim(), indeksi: i });
  }

  const idxTila = tasoOtsikot.findIndex((o) => o.startsWith('TILA'));
  const idxMukana = tasoOtsikot.findIndex((o) => o.startsWith('MUKANA'));

  const ampujat = [];
  for (let r = otsikkoIdx + 1; r < rivit.length; r++) {
    const rivi = rivit[r] || [];
    const nimi = String(rivi[idxNimi] ?? '').trim();
    if (!nimi) continue;
    const tila = idxTila !== -1 ? parseInt(rivi[idxTila], 10) : NaN;
    ampujat.push({
      id: `${nimi}|${r}`,
      sija: idxSija !== -1 ? String(rivi[idxSija] ?? '').trim() : '',
      nimi,
      sarja: idxSarja !== -1 ? String(rivi[idxSarja] ?? '').trim() : '',
      seura: idxSeura !== -1 ? String(rivi[idxSeura] ?? '').trim() : '',
      yhteensa: idxYhteensa !== -1 ? String(rivi[idxYhteensa] ?? '').trim() : '',
      tuloksia: idxTuloksia !== -1 ? String(rivi[idxTuloksia] ?? '').trim() : '',
      tila: Number.isInteger(tila) ? tila : null,
      tulokset: kisat
        .map((kisa, k) => ({
          koodi: kisa.koodi,
          taso: kisa.taso,
          tulos: String(rivi[kisa.indeksi] ?? '').trim(),
          mukana: idxMukana !== -1 && String(rivi[idxMukana + k] ?? '').trim() === '1'
        }))
        .filter((t) => t.tulos)
    });
  }

  return { ampujat };
}

// KISAT-välilehti: kisakoodi (Koodi) -> kisan nimi (Kisa).
export function parsiRankingKisaNimet(rivit) {
  const nimet = new Map();
  if (!Array.isArray(rivit)) return nimet;
  const otsikkoIdx = rivit.findIndex((rivi) => (rivi || []).map(normalisoiOtsikko).includes('KOODI'));
  if (otsikkoIdx === -1) return nimet;
  const otsikot = rivit[otsikkoIdx].map(normalisoiOtsikko);
  const idxKoodi = otsikot.indexOf('KOODI');
  const idxNimi = otsikot.indexOf('KISA');
  if (idxNimi === -1) return nimet;
  for (const rivi of rivit.slice(otsikkoIdx + 1)) {
    const koodi = String(rivi?.[idxKoodi] ?? '').trim();
    const nimi = String(rivi?.[idxNimi] ?? '').trim();
    if (koodi && nimi && !nimet.has(koodi)) nimet.set(koodi, nimi);
  }
  return nimet;
}

function kuuluuSarjaan(ampuja, rankingSarja) {
  if (!rankingSarja?.sarjat) return true;
  const sarja = String(ampuja.sarja || '').trim().toUpperCase();
  return rankingSarja.sarjat.includes(sarja);
}

// Sarjat, joissa on ampujia (Open aina). Nimet ovat i18n.js:ssä (rankingTulokset.sarja<avain>).
export function rankingSarjatAmpujille(ampujat) {
  return RANKING_SARJAT.filter((s) => !s.sarjat || ampujat.some((a) => kuuluuSarjaan(a, s)));
}

// Suodattaa sarjan ampujat taulukon järjestyksessä ja numeroi sijat sarjan sisällä.
// Tasapisteet (sama kokonaispistemäärä ja taulukossa sama sija) saavat saman sijan.
export function suodataRanking(ampujat, sarjaAvain = RANKING_KAIKKI) {
  const rankingSarja = RANKING_SARJAT.find((s) => s.avain === sarjaAvain) || RANKING_SARJAT[0];
  const valitut = ampujat.filter((a) => kuuluuSarjaan(a, rankingSarja));
  if (!rankingSarja.sarjat) {
    return valitut.map((a, i) => ({ ...a, laskettuSija: a.sija || String(i + 1) }));
  }
  let edellinen = null;
  return valitut.map((a, i) => {
    const sama = edellinen && a.sija && a.sija === edellinen.ampuja.sija;
    const laskettuSija = sama ? edellinen.laskettuSija : String(i + 1);
    edellinen = { ampuja: a, laskettuSija };
    return { ...a, laskettuSija };
  });
}
