// Julkinen ratanäkymä (src/LiveRadat.jsx): Compak-radan tilanne mobiilikirjauksen korteista, kuten kirjauslaitteen
// näytöllä. Lähteet api/kisa.js:n kautta: MOBIILI Rata N (kortit), MOBIILI_LAITTEET (linjan tila; API antaa vain
// sarakkeet RATA, LINJA ja LINJA PÄIVITETTY), aikataulut ja KISANSPEKSIT. Puhtaita funktioita (mobiiliLive.test.js).
import { parseCsvRows } from './csv.js';
import { radanJono, speksiArvo } from './radanJono.js';
import { KOHTEITA } from '../kirjaus/kortit.js';
import {
  OHJELMAT, jasennaOhjelma, laskeVuorot, linjanJono, linjanTilanne, ohjelmaTekstiksi, seuraavatAmpujat, valmiitAmpujat
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

// Laitteen tallentama linja: vain tunnetut kentät ja numerot (sama muoto kuin api/_lib/kirjausHaltija.js tarkistaLinja).
function siistiLinja(olio) {
  if (!olio || typeof olio !== 'object' || Array.isArray(olio)) return null;
  const nro = (n) => Number.isInteger(n) && n > 0;
  const numerot = (lista) => (Array.isArray(lista) ? lista.filter(nro) : []);
  return {
    lisatyt: (Array.isArray(olio.lisatyt) ? olio.lisatyt : []).filter((l) => l && nro(l.nro)).map((l) => ({
      nro: l.nro,
      ...(typeof l.nimi === 'string' ? { nimi: l.nimi } : {}),
      ...(l.jalkeen === null || nro(l.jalkeen) ? { jalkeen: l.jalkeen } : {}),
      ...(Number.isInteger(l.kierroksesta) ? { kierroksesta: l.kierroksesta } : {})
    })),
    ohitetut: numerot(olio.ohitetut),
    tauot: numerot(olio.tauot),
    tauotPois: numerot(olio.tauotPois),
    keskeyttaneet: numerot(olio.keskeyttaneet),
    ohjelma: typeof olio.ohjelma === 'string' ? olio.ohjelma : null
  };
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
      linja = iLinja === -1 || !rivi[iLinja] ? null : siistiLinja(JSON.parse(rivi[iLinja]));
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
// (laitteella valittu, muuten RATAn_OHJELMA, muuten SSSD), tilanne korttien merkinnöistä.
// aikataulut: [{ nimi, rivit }] järjestyksessä Aikataulu, Aikataulu La, Aikataulu Su.
export function radanLiveTila({ speksitRivit = [], aikataulut = [], sarake, kortit = {}, korttiNimet = {}, linja = null }) {
  const ratojaPaivassa = Number.parseInt(speksiArvo(speksitRivit, 'LAYOUT/PÄIVÄ'), 10) || 0;
  const tiedot = radanJono({ aikataulut, sarake, ratojaPaivassa });
  const omaOhjelma = jasennaOhjelma(linja?.ohjelma) || jasennaOhjelma(speksiArvo(speksitRivit, `RATA${sarake}_OHJELMA`));
  const ohjelma = omaOhjelma || OHJELMAT[0];
  const keskeyttaneet = linja?.keskeyttaneet || [];
  const jono = linjanJono(tiedot.jono, linja || {}, { ...tiedot.nimet, ...korttiNimet });
  const vuorot = laskeVuorot(jono, ohjelma);
  const tilanne = linjanTilanne(vuorot, kortit, keskeyttaneet);
  const nimet = { ...tiedot.nimet, ...korttiNimet };
  jono.forEach((a) => {
    if (a.nimi) nimet[a.nro] = a.nimi;
  });
  return {
    rataNimi: speksiArvo(speksitRivit, `RATA${sarake}_NIMI`),
    ohjelma: omaOhjelma ? ohjelmaTekstiksi(omaOhjelma) : '',
    loytyi: tiedot.aikataulu !== null,
    jono,
    tilanne,
    linja: tilanne?.linja || [],
    tulevat: seuraavatAmpujat(jono, vuorot, tilanne, kortit, keskeyttaneet),
    valmiit: valmiitAmpujat(vuorot, tilanne, kortit, keskeyttaneet),
    keskeyttaneet,
    nimet
  };
}
