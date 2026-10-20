// src/utils/saaEnnuste.js
// Sääennusteen apufunktiot, joita käyttävät sekä kisakortti että api/saa.js.
// Ennuste tulee Ilmatieteen laitoksen avoimesta datasta (meteorologin muokkaama ennuste, ei avainta)
// kisan paikan mukaan (rekisterin sarake I).
import { isoPaiva, parsiPaivamaara } from './kisaStatus.js';

// Ilmatieteen laitoksen muokattu ennuste ulottuu 10 päivän (240 h) päähän.
export const ENNUSTE_PAIVIA = 10;
// Päivän yhteenveto lasketaan kisa-ajalta (Suomen aikaa, tunnit ALKU_TUNTI..LOPPU_TUNTI).
const ALKU_TUNTI = 8;
const LOPPU_TUNTI = 20;
const SYMBOLI_TUNTI = 12;
// Päivästä pitää olla kisa-ajalta vähintään näin monta lämpötilaa (ennusteen viimeinen päivä voi olla vajaa).
const MIN_RIVEJA = 2;

const SUOMEN_AIKA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});

// Hetki Suomen aikaa: { pvm: 'vvvv-kk-pp', tunti }. Palvelin ajaa UTC:ssä, joten aikavyöhyke annetaan erikseen.
export function suomenAika(hetki = new Date()) {
  const osa = Object.fromEntries(SUOMEN_AIKA.formatToParts(hetki).map((o) => [o.type, o.value]));
  return { pvm: `${osa.year}-${osa.month}-${osa.day}`, tunti: Number(osa.hour) };
}

export function tamaPaivaSuomessa(nyt = new Date()) {
  return suomenAika(nyt).pvm;
}

// Koordinaatit → { lat, lon }; muuten null (paikan nimi). Kaksi muotoa, molemmissa desimaalit:
// desimaalipiste ("63.67, 22.70", "63.67 22.70") tai desimaalipilkku ("63,67 22,70", "63,67; 22,70").
// "64,27" yksinään ei ole koordinaatti (se luettaisiin muuten leveydeksi 64 ja pituudeksi 27).
export function parsiKoordinaatit(paikka) {
  const teksti = String(paikka || '').trim();
  const piste = teksti.match(/^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/);
  const pilkku = teksti.match(/^(-?\d{1,2},\d+)\s*(?:;\s*|\s+)(-?\d{1,3},\d+)$/);
  const osuma = piste || pilkku;
  if (!osuma) return null;
  const lat = Number(osuma[1].replace(',', '.'));
  const lon = Number(osuma[2].replace(',', '.'));
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// Päivä (vvvv-kk-pp), jonka sää näytetään, tai '':
// tulevasta kisasta aloituspäivä, käynnissä olevasta seuraava kisapäivä (viimeisenä päivänä tämä päivä).
// Päivän pitää olla ennusteen sisällä (ENNUSTE_PAIVIA päivää tästä päivästä Suomen aikaa).
export function ennustePaiva(alkuPvm, loppuPvm, nyt = new Date()) {
  const alku = parsiPaivamaara(alkuPvm);
  if (!alku) return '';
  const loppu = parsiPaivamaara(loppuPvm) || alku;
  if (loppu < alku) return '';

  const tanaan = parsiPaivamaara(tamaPaivaSuomessa(nyt));
  const huomenna = new Date(tanaan.getFullYear(), tanaan.getMonth(), tanaan.getDate() + 1);
  const viimeinen = new Date(tanaan.getFullYear(), tanaan.getMonth(), tanaan.getDate() + ENNUSTE_PAIVIA - 1);

  let paiva;
  if (alku > tanaan) paiva = alku;
  else if (loppu >= huomenna) paiva = huomenna;
  else if (loppu >= tanaan) paiva = tanaan;
  else return '';
  return paiva <= viimeinen ? isoPaiva(paiva) : '';
}

// Haetaanko kisalle sää: paikka on annettu, kisa ei ole päättynyt ja näytettävä päivä on ennusteen sisällä.
export function naytetaankoSaa(kisa, status, nyt = new Date()) {
  if (!String(kisa?.paikka || '').trim() || status === 'paattynyt') return false;
  return Boolean(ennustePaiva(kisa.alkuPvm, kisa.loppuPvm, nyt));
}

// Ilmatieteen laitoksen WeatherSymbol3-koodi → näytettävä tyyppi.
export function saaTyyppi(koodi) {
  const k = typeof koodi === 'number' ? koodi : NaN;
  if (k === 1) return 'selkea';
  if (k === 2) return 'puolipilvinen';
  if (k === 21 || k === 31) return 'tihku';
  if ((k >= 22 && k <= 23) || (k >= 32 && k <= 33)) return 'sade';
  if (k >= 41 && k <= 53) return 'lumi';
  if (k >= 61 && k <= 64) return 'ukkonen';
  if (k >= 71 && k <= 83) return 'ranta';
  if (k === 91 || k === 92) return 'sumu';
  return 'pilvinen';
}

const NIMET = { Temperature: 'lampo', WindSpeedMS: 'tuuli', Precipitation1h: 'sade', WeatherSymbol3: 'symboli' };

// Ilmatieteen laitoksen WFS-vastaus (stored query ...::point::simple) → [{ aika, lampo, tuuli, sade, symboli }]
// tunneittain. Puuttuva arvo (NaN) on null.
export function parsiFmiVastaus(xml) {
  const rivit = new Map();
  for (const [, elementti] of String(xml || '').matchAll(/<BsWfs:BsWfsElement\b[^>]*>([\s\S]*?)<\/BsWfs:BsWfsElement>/g)) {
    const aika = elementti.match(/<BsWfs:Time>([^<]+)<\/BsWfs:Time>/)?.[1]?.trim();
    const nimi = NIMET[elementti.match(/<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>/)?.[1]?.trim()];
    if (!aika || !nimi) continue;
    const arvo = Number(elementti.match(/<BsWfs:ParameterValue>([^<]*)<\/BsWfs:ParameterValue>/)?.[1]);
    const rivi = rivit.get(aika) || { aika, lampo: null, tuuli: null, sade: null, symboli: null };
    rivi[nimi] = Number.isFinite(arvo) ? arvo : null;
    rivit.set(aika, rivi);
  }
  return [...rivit.values()].sort((a, b) => a.aika.localeCompare(b.aika));
}

// Tuntirivit → päivittäiset yhteenvedot kisa-ajalta (klo 8–20 Suomen aikaa):
// [{ pvm, symboli, maks, min, sade (mm), tuuli (suurin keskituuli m/s) }].
// Lämpötila, tuuli ja symboli ovat hetkiarvoja klo 8–20; Precipitation1h on edeltävän tunnin sade, joten
// sade lasketaan riveiltä klo 9–20 (jakso 8–20).
export function paivaYhteenvedot(rivit) {
  const paivat = new Map();
  const symboliEro = new Map();
  const riveja = new Map();
  for (const rivi of Array.isArray(rivit) ? rivit : []) {
    const hetki = new Date(rivi?.aika);
    if (Number.isNaN(hetki.getTime())) continue;
    const { pvm, tunti } = suomenAika(hetki);
    if (tunti < ALKU_TUNTI || tunti > LOPPU_TUNTI) continue;

    const paiva = paivat.get(pvm) || { pvm, symboli: null, maks: -Infinity, min: Infinity, sade: 0, tuuli: null };
    if (rivi.lampo !== null) {
      paiva.maks = Math.max(paiva.maks, rivi.lampo);
      paiva.min = Math.min(paiva.min, rivi.lampo);
      riveja.set(pvm, (riveja.get(pvm) || 0) + 1);
    }
    if (rivi.tuuli !== null) paiva.tuuli = Math.max(paiva.tuuli ?? 0, rivi.tuuli);
    if (rivi.sade !== null && tunti > ALKU_TUNTI) paiva.sade = Math.round((paiva.sade + rivi.sade) * 10) / 10;
    // Päivän symboliksi keskipäivää lähin.
    const ero = Math.abs(tunti - SYMBOLI_TUNTI);
    if (rivi.symboli !== null && ero < (symboliEro.get(pvm) ?? Infinity)) {
      paiva.symboli = rivi.symboli;
      symboliEro.set(pvm, ero);
    }
    paivat.set(pvm, paiva);
  }
  return [...paivat.values()].filter((p) => (riveja.get(p.pvm) || 0) >= MIN_RIVEJA);
}
