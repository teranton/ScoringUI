// Julkinen ratanäkymä (src/LiveRadat.jsx): Compak-radan tilanne mobiilikirjauksen korteista, kuten kirjauslaitteen
// näytöllä. Lähteet api/kisa.js:n kautta: MOBIILI Rata N (kortit), MOBIILI_LAITTEET (linjan tila; API antaa vain
// sarakkeet RATA, LINJA ja LINJA PÄIVITETTY), aikataulut ja KISANSPEKSIT. Puhtaita funktioita (mobiiliLive.test.js).
import { parseCsvRows } from './csv.js';
import { radanJono, speksiArvo, tarkistaLinja } from './radanJono.js';
import { KOHTEITA, taytetyt } from '../kirjaus/kortit.js';
import {
  jasennaOhjelma, laskeVuorot, linjanJono, linjanTilanne, ohjelmaTekstiksi, seuraavatAmpujat, valmiitAmpujat
} from '../kirjaus/linja.js';

export const mobiiliValilehti = (sarake) => `MOBIILI Rata ${sarake}`;
export const LAITTEET_VALILEHTI = 'MOBIILI_LAITTEET';

const otsikot = (rivi) => (Array.isArray(rivi) ? rivi : []).map((s) => String(s ?? '').trim().toUpperCase());
const kokonaisluku = (arvo) => {
  const n = Number.parseInt(String(arvo ?? '').trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// "28.10.2026 klo 10.05.07" tai "28.10.2026 10.05" → vertailtava luku ja kellonaika "10.05", muuten null.
export function lueAika(teksti) {
  const m = String(teksti || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\D+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
  if (!m) return null;
  const [, pv, kk, vuosi, h, min, s] = m.map(Number);
  return { arvo: (((vuosi * 100 + kk) * 100 + pv) * 100 + h) * 10000 + min * 100 + (s || 0), kello: `${h}.${String(min).padStart(2, '0')}` };
}

// MOBIILI_LAITTEET → [{ sarake, linja, paivitetty }] radan mukaan. Rivi on radalla, jolla on ollut laite.
export function lueRadanLaitteet(csv) {
  const rivit = parseCsvRows(csv || '');
  const otsikko = otsikot(rivit[0]);
  const iRata = otsikko.indexOf('RATA');
  const iLinja = otsikko.indexOf('LINJA');
  const iPaivitetty = otsikko.indexOf('LINJA PÄIVITETTY');
  if (iRata === -1) return [];
  const radat = new Map();
  rivit.slice(1).forEach((rivi) => {
    const sarake = kokonaisluku(rivi[iRata]);
    if (!sarake || radat.has(sarake)) return;
    let linja;
    try {
      linja = iLinja === -1 || !rivi[iLinja] ? null : tarkistaLinja(JSON.parse(rivi[iLinja])).linja || null;
    } catch {
      linja = null;
    }
    radat.set(sarake, { sarake, linja, paivitetty: iPaivitetty === -1 ? '' : String(rivi[iPaivitetty] || '') });
  });
  return [...radat.values()].sort((a, b) => a.sarake - b.sarake);
}

// MOBIILI Rata N → { kortit: { nro: { merkit } }, nimet: { nro: nimi }, viimeisin: { arvo, kello } | null }.
// Merkit sarakkeista 1..25 otsikon mukaan: X osuma, O ohi, muu ampumatta (-).
export function lueRadanKortit(csv) {
  const rivit = parseCsvRows(csv || '');
  const otsikko = otsikot(rivit[0]);
  const iNro = otsikko.indexOf('NRO');
  const iNimi = otsikko.indexOf('NIMI');
  const iAika = otsikko.indexOf('PÄIVITETTY');
  const kohteet = Array.from({ length: KOHTEITA }, (_, i) => otsikko.indexOf(String(i + 1)));
  const kortit = {};
  const nimet = {};
  let viimeisin = null;
  if (iNro === -1) return { kortit, nimet, viimeisin };
  rivit.slice(1).forEach((rivi) => {
    const nro = kokonaisluku(rivi[iNro]);
    if (!nro) return;
    const merkit = kohteet.map((i) => {
      const m = i === -1 ? '' : String(rivi[i] ?? '').trim().toUpperCase();
      return m === 'X' || m === 'O' ? m : '-';
    }).join('');
    kortit[nro] = { merkit };
    const nimi = iNimi === -1 ? '' : String(rivi[iNimi] || '').trim();
    if (nimi) nimet[nro] = nimi;
    const aika = iAika === -1 ? null : lueAika(rivi[iAika]);
    if (aika && (!viimeisin || aika.arvo > viimeisin.arvo)) viimeisin = aika;
  });
  return { kortit, nimet, viimeisin };
}

// Radan tilanne kuten kirjauslaitteella: jono aikataulusta ja laitteen linjan tilasta, vuorot ohjelmasta
// (laitteella valittu, muuten RATAn_OHJELMA), tilanne korttien merkinnöistä. Ilman ohjelmaa vuoroja ei lasketa
// (laitekaan ei kirjaa ennen kuin ohjelma on valittu): kesken = keskeneräiset kortit numerojärjestyksessä.
// aikataulut: [{ nimi, rivit }] järjestyksessä Aikataulu, Aikataulu La, Aikataulu Su (olemassa olevat välilehdet).
export function radanLiveTila({ speksitRivit = [], aikataulut = [], sarake, kortit = {}, korttiNimet = {}, linja = null }) {
  const ratojaPaivassa = Number.parseInt(speksiArvo(speksitRivit, 'LAYOUT/PÄIVÄ'), 10) || 0;
  const tiedot = radanJono({ aikataulut, sarake, ratojaPaivassa });
  const ohjelma = jasennaOhjelma(linja?.ohjelma) || jasennaOhjelma(speksiArvo(speksitRivit, `RATA${sarake}_OHJELMA`));
  const keskeyttaneet = linja?.keskeyttaneet || [];
  const nimet = { ...tiedot.nimet, ...korttiNimet };
  const jono = linjanJono(tiedot.jono, linja || {}, nimet);
  jono.forEach((a) => {
    if (a.nimi) nimet[a.nro] = a.nimi;
  });
  const perus = { rataNimi: speksiArvo(speksitRivit, `RATA${sarake}_NIMI`), loytyi: tiedot.aikataulu !== null, jono, keskeyttaneet, nimet };
  if (!ohjelma) {
    const numerot = Object.keys(kortit).map(Number).sort((a, b) => a - b);
    const valmis = (nro) => taytetyt(kortit[nro].merkit) === KOHTEITA || keskeyttaneet.includes(nro);
    return {
      ...perus, ohjelma: '', tilanne: null, linja: [], tulevat: [],
      kesken: numerot.filter((nro) => !valmis(nro)),
      valmiit: numerot.filter(valmis).reverse()
    };
  }
  const vuorot = laskeVuorot(jono, ohjelma);
  const tilanne = linjanTilanne(vuorot, kortit, keskeyttaneet);
  return {
    ...perus,
    ohjelma: ohjelmaTekstiksi(ohjelma),
    tilanne,
    linja: tilanne?.linja || [],
    kesken: null,
    tulevat: seuraavatAmpujat(jono, vuorot, tilanne, kortit, keskeyttaneet),
    valmiit: valmiitAmpujat(vuorot, tilanne, kortit, keskeyttaneet)
  };
}
