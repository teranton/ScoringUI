// Mobiilikirjauksen puhtaat apufunktiot: radan ampujajono aikataulusta ja korttirivit MOBIILI-välilehdillä.
// Ei Google-kutsuja, joten kaikki on testattu (kirjausData.test.js).
import { asetusJoukko, haeAsetusSpekseista } from '../../src/utils/kisaAsetukset.js';
import { isLaneHeader, isTimeLike, taukoTyyppi, tunnistaRataSarakkeet } from '../../src/utils/aikatauluRadat.js';

export const KOHTEITA = 25;
export const AIKATAULU_VALILEHDET = ['Aikataulu', 'Aikataulu La', 'Aikataulu Su'];
export const LOKI_VALILEHTI = 'MOBIILI_LOKI';
export const mobiiliValilehti = (sarake) => `MOBIILI Rata ${sarake}`;
// Rivi = ampujan numero + 1 (rivi 1 on otsikko), joten jokaisella kortilla on kiinteä osoite.
export const MAKS_NRO = 999;
export const META_SARAKKEITA = 6;

export const KORTTI_OTSIKKO = ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', 'LAITE', 'VERSIO',
  ...Array.from({ length: KOHTEITA }, (_, i) => String(i + 1))];
export const LOKI_OTSIKKO = ['AIKA', 'RATA', 'NRO', 'LAITE', 'VERSIO', 'ENNEN', 'JÄLKEEN'];

// Merkit: X osuma, O ohi, - ampumatta. Aina KOHTEITA merkkiä.
const MERKIT = new RegExp(`^[XO-]{${KOHTEITA}}$`);
export const onkoMerkit = (merkit) => typeof merkit === 'string' && MERKIT.test(merkit);
export const tyhjatMerkit = () => '-'.repeat(KOHTEITA);
export const laskeTulos = (merkit) => [...merkit].filter((m) => m === 'X').length;

// Sarakkeen kirjain (0 = A).
export function sarakeKirjain(indeksi) {
  let n = indeksi + 1;
  let s = '';
  while (n > 0) {
    const j = (n - 1) % 26;
    s = String.fromCharCode(65 + j) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export const VIIMEINEN_SARAKE = sarakeKirjain(META_SARAKKEITA + KOHTEITA - 1);

// KISANSPEKSIT-avaimen arvo: avaimen oikealla puolella oleva ensimmäinen ei-tyhjä solu (kuten UI:n asetukset).
export function speksiArvo(rivit, avain) {
  return haeAsetusSpekseista(rivit, asetusJoukko([avain]), (arvo) => arvo) || '';
}

// Sheets API:n solu: luku numerona, tyhjä tyhjentää solun, muu tekstinä (ei kaavoja).
export function solu(arvo) {
  if (typeof arvo === 'number' && Number.isFinite(arvo)) return { userEnteredValue: { numberValue: arvo } };
  if (arvo === '' || arvo === null || arvo === undefined) return {};
  return { userEnteredValue: { stringValue: String(arvo) } };
}

// Radan numerot otsikosta: "Rata 1" → [1], "RATA1 / RATA3" → [1, 3] (kierrokset allekkain), "1 Jake" → [1].
function otsikonRadat(label) {
  return String(label).split('/').map((osa) => Number.parseInt(osa.trim(), 10)).filter((n) => Number.isInteger(n));
}

function puhdasNimi(nimi) {
  return String(nimi || '').replace(/\u200B/g, '').trim();
}

// Aikataulun rata-ruudukko: [{ radat: [1, 3], kierrokset: [[{ nro, nimi, aika, taukoEnnen? }], ...] }] tai [] jos ei ruudukko.
export function jasennaRataruudukko(rivit) {
  if (!Array.isArray(rivit) || rivit.length < 2) return [];
  const kaistat = tunnistaRataSarakkeet(rivit);
  if (kaistat.length === 0) return [];
  const otsikkoRivi = rivit.findIndex((rivi) => Array.isArray(rivi) && rivi.some(isLaneHeader));

  const data = rivit.slice(otsikkoRivi + 1).filter(Array.isArray);
  // Otsikko voi olla aika- tai nimisarakkeen päällä (vanhoissa välilehdissä "Rata 1" nimen yllä):
  // kaistan alku on se sarake, jossa on aikoja ja jonka oikealla puolella numeroita.
  const osumia = (s) => data.filter((r) => isTimeLike(r[s]) && /^\d+$/.test(String(r[s + 1] ?? '').trim())).length;
  const alku = (kaista) => [kaista.startIndex, kaista.startIndex - 1, kaista.startIndex + 1]
    .filter((s) => s >= 0)
    .reduce((paras, s) => (osumia(s) > osumia(paras) ? s : paras), kaista.startIndex);

  return kaistat.map((kaista) => {
    const startIndex = alku(kaista);
    const kierrokset = [[]];
    let tauko = false;
    data.forEach((rivi) => {
      const aika = String(rivi[startIndex] ?? '').trim();
      const nro = String(rivi[startIndex + 1] ?? '').trim();
      const nimi = puhdasNimi(rivi[startIndex + 2]);
      const tyyppi = taukoTyyppi(nimi, nro);
      if (tyyppi === 'vaihto') {
        kierrokset.push([]);
        tauko = false;
        return;
      }
      // TAUKO-rivi: linja tyhjennetään ennen seuraavaa ampujaa (mobiilikirjauksen inline-linja).
      if (tyyppi === 'tauko') {
        tauko = kierrokset[kierrokset.length - 1].length > 0;
        return;
      }
      if (!/^\d+$/.test(nro)) return;
      // Pelkkä numero nimen paikalla on varattu mutta tyhjä paikka.
      if (!nimi || /^\d+$/.test(nimi)) return;
      kierrokset[kierrokset.length - 1].push({
        nro: Number(nro), nimi, aika: isTimeLike(aika) ? aika : '', ...(tauko ? { taukoEnnen: true } : {})
      });
      tauko = false;
    });
    return { radat: otsikonRadat(kaista.label), kierrokset };
  });
}

// Tulossarakkeen (Compak-rata) paikka aikataulussa ja radan ampujajono.
// aikataulut: [{ nimi, rivit }] järjestyksessä (Aikataulu, Aikataulu La, Aikataulu Su).
// Päivä: monen päivän aikataulussa LAYOUT/PÄIVÄ (sarakkeet 1..n ensimmäisenä päivänä, n+1.. seuraavana;
// kehitystaulukossa sunnuntain RATA1 on tulossarake 5). Kaista: se, jonka otsikossa on sarakkeen numero
// (RATA3, RATA1 / RATA3 → toinen kierros), muuten päivän n:s kaista.
// Jono: radan omat aloittajat, sitten edellisen radan aloittajat (jotka siirtyvät tälle radalle) jne.
// Palauttaa { aikataulu, kaista, kierros, jono, nimet } tai null, jos rataa ei löydy.
export function radanJono({ aikataulut, sarake, ratojaPaivassa }) {
  // Kaikki olemassa olevat aikataulut, myös ne, joissa ei (vielä) ole ruudukkoa: LAYOUT/PÄIVÄ laskee päivät niistä.
  const paivat = aikataulut.map(({ nimi, rivit }) => ({ nimi, kaistat: jasennaRataruudukko(rivit) }));

  const nimet = {};
  paivat.forEach((p) => p.kaistat.forEach((k) => k.kierrokset.flat().forEach((a) => {
    if (!nimet[a.nro]) nimet[a.nro] = a.nimi;
  })));

  // Monen päivän aikataulussa LAYOUT/PÄIVÄ ratkaisee päivän (päivät voivat käyttää samoja kaistanumeroita);
  // muuten haetaan kaistaa otsikon numerolla kaikista.
  const perPaiva = ratojaPaivassa > 0 ? ratojaPaivassa : (paivat.find((p) => p.kaistat.length > 0)?.kaistat.length || 0);
  const paivaKiintea = ratojaPaivassa > 0 && paivat.length > 1;
  const ehdokkaat = paivaKiintea ? [paivat[Math.floor((sarake - 1) / ratojaPaivassa)]].filter(Boolean) : paivat;
  let paikka = null;
  for (const paiva of ehdokkaat) {
    const kaista = paiva.kaistat.findIndex((k) => k.radat.includes(sarake));
    if (kaista !== -1) {
      paikka = { paiva, kaista, kierros: paiva.kaistat[kaista].radat.indexOf(sarake) };
      break;
    }
  }
  if (!paikka && perPaiva > 0) {
    const paiva = paivaKiintea ? ehdokkaat[0] : paivat[Math.floor((sarake - 1) / perPaiva)];
    const kaista = (sarake - 1) % perPaiva;
    if (paiva && kaista < paiva.kaistat.length) paikka = { paiva, kaista, kierros: 0 };
  }
  if (!paikka) return { aikataulu: null, kaista: null, kierros: null, jono: [], nimet };

  const { paiva, kaista, kierros } = paikka;
  const n = paiva.kaistat.length;
  const nahty = new Set();
  const jono = [];
  for (let askel = 0; askel < n; askel++) {
    const k = (kaista - askel + n) % n;
    (paiva.kaistat[k].kierrokset[kierros] || []).forEach((a) => {
      if (nahty.has(a.nro)) return;
      nahty.add(a.nro);
      jono.push({ ...a, lahtoRata: k + 1 });
    });
  }
  return { aikataulu: paiva.nimi, kaista: kaista + 1, kierros, jono, nimet };
}

export function aikaleima(ms = Date.now()) {
  return new Date(ms).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki' });
}

export function korttiRivi({ nro, nimi, merkit, versio, laite, aika }) {
  return [nro, nimi || '', laskeTulos(merkit), aika, laite, versio,
    ...[...merkit].map((m) => (m === '-' ? '' : m))];
}

// MOBIILI-välilehden rivi → { nro, merkit, versio, laite, aika } tai null (tyhjä rivi).
export function lueKorttiRivi(rivi) {
  if (!Array.isArray(rivi)) return null;
  const nro = Number.parseInt(rivi[0], 10);
  if (!Number.isInteger(nro)) return null;
  const merkit = Array.from({ length: KOHTEITA }, (_, i) => {
    const m = String(rivi[META_SARAKKEITA + i] ?? '').trim().toUpperCase();
    return m === 'X' || m === 'O' ? m : '-';
  }).join('');
  const versio = Number(rivi[5]);
  return { nro, merkit, versio: Number.isFinite(versio) ? versio : 0, laite: String(rivi[4] ?? ''), aika: String(rivi[3] ?? '') };
}

// Onko rataa viimeksi kirjannut toinen laite: uusimman kortin (suurin versio) laite, jos se ei ole tämä laite.
// Palauttaa { laite, aika } tai null.
export function viimeisinMuuLaite(kortit, laite) {
  const uusin = kortit.reduce((paras, k) => (k.versio > (paras?.versio ?? 0) ? k : paras), null);
  if (!uusin || !uusin.laite || uusin.laite === laite) return null;
  return { laite: uusin.laite, aika: uusin.aika };
}

// Tarkistaa tallennuspyynnön rungon. Palauttaa { laite, kortit } tai { virhe }.
export const MAKS_KORTTEJA = 30;
const MAKS_NIMI = 80;
export const onLaitetunnus = (laite) => typeof laite === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(laite);

export function tarkistaTallennus(runko) {
  const laite = typeof runko?.laite === 'string' ? runko.laite : '';
  if (!onLaitetunnus(laite)) return { virhe: 'Laitteen tunnus puuttuu' };
  const kortit = runko?.kortit;
  if (!Array.isArray(kortit) || kortit.length === 0) return { virhe: 'Ei kortteja' };
  if (kortit.length > MAKS_KORTTEJA) return { virhe: `Enintään ${MAKS_KORTTEJA} korttia kerralla` };
  const nahty = new Set();
  for (const k of kortit) {
    if (!Number.isInteger(k?.nro) || k.nro < 1 || k.nro > MAKS_NRO) return { virhe: 'Virheellinen ampujan numero' };
    if (nahty.has(k.nro)) return { virhe: 'Sama ampuja kahdesti' };
    nahty.add(k.nro);
    if (!onkoMerkit(k.merkit)) return { virhe: 'Virheelliset merkinnät' };
    if (!Number.isSafeInteger(k.versio) || k.versio < 1) return { virhe: 'Virheellinen versio' };
    if (k.nimi !== undefined && typeof k.nimi !== 'string') return { virhe: 'Virheellinen nimi' };
  }
  // Nimi on vain näyttöä varten (laite tuntee sen aikataulusta): ohjausmerkit pois ja pituus rajattu.
  const nimi = (n) => [...String(n || '')].filter((c) => c >= ' ' && c !== '\u007f').join('').trim().slice(0, MAKS_NIMI);
  return { laite, kortit: kortit.map((k) => ({ nro: k.nro, nimi: nimi(k.nimi), merkit: k.merkit, versio: k.versio })) };
}
