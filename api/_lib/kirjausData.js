// Mobiilikirjauksen puhtaat apufunktiot: radan ampujajono aikataulusta ja korttirivit MOBIILI-välilehdillä.
// Ei Google-kutsuja, joten kaikki on testattu (kirjausData.test.js).
// Aikataulun jäsennys ja KISANSPEKSIT-arvot ovat src/utils/radanJono.js:ssä, koska julkinen ratanäkymä käyttää samoja.
export { MAKS_NRO, jasennaRataruudukko, puhdasTeksti, radanJono, speksiArvo, tarkistaLinja } from '../../src/utils/radanJono.js';
import { MAKS_NRO, puhdasTeksti } from '../../src/utils/radanJono.js';

export const KOHTEITA = 25;
export const AIKATAULU_VALILEHDET = ['Aikataulu', 'Aikataulu La', 'Aikataulu Su'];
export const LOKI_VALILEHTI = 'MOBIILI_LOKI';
export const mobiiliValilehti = (sarake) => `MOBIILI Rata ${sarake}`;
// Rivi = ampujan numero + 1 (rivi 1 on otsikko), joten jokaisella kortilla on kiinteä osoite (MAKS_NRO: radanJono.js).
export const META_SARAKKEITA = 6;

export const KORTTI_OTSIKKO = ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', 'LAITE', 'VERSIO',
  ...Array.from({ length: KOHTEITA }, (_, i) => String(i + 1))];
// HUOM: tyhjä tavalliselle tallennukselle; haltijan vaihdot ja korvatun laitteen hylätyt kortit (ristiriidat).
export const LOKI_OTSIKKO = ['AIKA', 'RATA', 'NRO', 'LAITE', 'VERSIO', 'ENNEN', 'JÄLKEEN', 'HUOM'];

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

// Sheets API:n solu: luku numerona, tyhjä tyhjentää solun, muu tekstinä (ei kaavoja).
export function solu(arvo) {
  if (typeof arvo === 'number' && Number.isFinite(arvo)) return { userEnteredValue: { numberValue: arvo } };
  if (arvo === '' || arvo === null || arvo === undefined) return {};
  return { userEnteredValue: { stringValue: String(arvo) } };
}

// Täydentää kortin toisen laitteen merkinnöillä: perus-kortin ampumattomat (-) kohteet saavat lisän merkin.
// Molemmissa merkityt kohteet pysyvät perus-kortin mukaisina; eri: montako niistä poikkeaa.
// Palauttaa { merkit, taytetty, eri }.
export function taydenna(perus, lisa) {
  let taytetty = 0;
  let eri = 0;
  const merkit = [...perus].map((m, i) => {
    const l = lisa[i];
    if (m === '-' && l !== '-') {
      taytetty++;
      return l;
    }
    if (m !== '-' && l !== '-' && m !== l) eri++;
    return m;
  }).join('');
  return { merkit, taytetty, eri };
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

// Tarkistaa tallennuspyynnön rungon. Palauttaa { laite, haltija, kortit, linja } tai { virhe }.
// Korttilista saa olla tyhjä: pelkkä linjan tila (tarkistetaan api/_lib/kirjausHaltija.js:ssä) tai haltijan tarkistus
// (ei kirjoiteta; vastaus kertoo, onko laite yhä haltija, ja palauttaa korvattujen laitteiden täydennykset).
export const MAKS_KORTTEJA = 30;
const MAKS_NIMI = 80;
export const onLaitetunnus = (laite) => typeof laite === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(laite);

export function tarkistaTallennus(runko) {
  const laite = typeof runko?.laite === 'string' ? runko.laite : '';
  if (!onLaitetunnus(laite)) return { virhe: 'Laitteen tunnus puuttuu' };
  const haltija = typeof runko?.haltija === 'string' ? runko.haltija.slice(0, 200) : '';
  const kortit = runko?.kortit ?? [];
  if (!Array.isArray(kortit)) return { virhe: 'Ei kortteja' };
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
  // Nimi on vain näyttöä varten (laite tuntee sen aikataulusta).
  const nimi = (n) => puhdasTeksti(n, MAKS_NIMI);
  return {
    laite,
    haltija,
    kortit: kortit.map((k) => ({ nro: k.nro, nimi: nimi(k.nimi), merkit: k.merkit, versio: k.versio })),
    linja: runko?.linja
  };
}
