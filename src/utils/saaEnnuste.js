// src/utils/saaEnnuste.js
// Sääennusteen apufunktiot, joita käyttävät sekä kisakortti että api/saa.js.
// Ennuste tulee yr.no:sta (MET Norwayn Locationforecast, ei avainta) kisan paikan mukaan (rekisterin sarake H).
import { isoPaiva, parsiPaivamaara } from './kisaStatus.js';

// MET Norwayn ennuste ulottuu noin 9 päivän päähän (tämä päivä mukaan lukien).
export const ENNUSTE_PAIVIA = 9;
// Päivän yhteenveto lasketaan kisa-ajalta (Suomen aikaa, tunnit ALKU_TUNTI..LOPPU_TUNTI).
const ALKU_TUNTI = 8;
const LOPPU_TUNTI = 20;
const SYMBOLI_TUNTI = 12;

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

// yr.no:n symbolikoodi (esim. "lightrainshowers_day") → näytettävä tyyppi.
export function saaTyyppi(symboli) {
  const s = String(symboli || '').replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 'ukkonen';
  if (s.includes('sleet')) return 'ranta';
  if (s.includes('snow')) return 'lumi';
  if (s === 'lightrain' || s === 'lightrainshowers') return 'tihku';
  if (s.includes('rain')) return 'sade';
  if (s === 'fog') return 'sumu';
  if (s === 'clearsky') return 'selkea';
  if (s === 'fair' || s === 'partlycloudy') return 'puolipilvinen';
  return 'pilvinen';
}

const luku = (arvo) => (Number.isFinite(arvo) ? arvo : null);

// Jakson [alku, alku + pituus) päällekkäisyys kisa-ajan [ALKU_TUNTI, LOPPU_TUNTI) kanssa tunteina.
function paallekkain(alku, pituus) {
  return Math.max(0, Math.min(alku + pituus, LOPPU_TUNTI) - Math.max(alku, ALKU_TUNTI));
}

// Locationforecastin aikasarja → päivittäiset yhteenvedot kisa-ajalta (klo 8–20 Suomen aikaa):
// [{ pvm, symboli, maks, min, sade (mm), tuuli (suurin keskituuli m/s) }].
// Lähipäivinä rivit ovat tunnin välein, kauempana kuuden tunnin välein. Jakso lasketaan mukaan, jos
// vähintään puolet siitä osuu kisa-aikaan. Päivä jätetään pois, jos kisa-ajalta on alle kaksi riviä
// (sarjan viimeinen, vajaa päivä).
export function paivaYhteenvedot(aikasarja) {
  const paivat = new Map();
  const symboliEro = new Map();
  const riveja = new Map();
  for (const rivi of Array.isArray(aikasarja) ? aikasarja : []) {
    const hetki = new Date(rivi?.time);
    if (Number.isNaN(hetki.getTime())) continue;
    const { pvm, tunti } = suomenAika(hetki);
    const data = rivi.data || {};
    const tunnin = data.next_1_hours;
    const kuusi = data.next_6_hours;
    // Tuntiennusteessa käytetään tunnin jaksoa, kauempana kuuden tunnin jaksoa.
    const [jakso, pituus] = tunnin ? [tunnin, 1] : [kuusi, 6];
    const jaksoMukana = Boolean(jakso) && paallekkain(tunti, pituus) * 2 >= pituus;
    const hetkiMukana = tunti >= ALKU_TUNTI && tunti <= LOPPU_TUNTI;
    if (!jaksoMukana && !hetkiMukana) continue;

    const paiva = paivat.get(pvm) || { pvm, symboli: '', maks: -Infinity, min: Infinity, sade: 0, tuuli: null };
    if (hetkiMukana) {
      const lampo = luku(data.instant?.details?.air_temperature);
      if (lampo !== null) {
        paiva.maks = Math.max(paiva.maks, lampo);
        paiva.min = Math.min(paiva.min, lampo);
        riveja.set(pvm, (riveja.get(pvm) || 0) + 1);
      }
      const tuuli = luku(data.instant?.details?.wind_speed);
      if (tuuli !== null) paiva.tuuli = Math.max(paiva.tuuli ?? 0, tuuli);
    }
    if (jaksoMukana) {
      const sade = luku(jakso.details?.precipitation_amount);
      if (sade !== null) paiva.sade = Math.round((paiva.sade + sade) * 10) / 10;
      // Kuuden tunnin jakson ääriarvot vain, kun koko jakso on kisa-ajalla (muuten mukana olisi yön lämpötiloja).
      if (pituus === 6 && paallekkain(tunti, 6) === 6) {
        const maks = luku(jakso.details?.air_temperature_max);
        const min = luku(jakso.details?.air_temperature_min);
        if (maks !== null) paiva.maks = Math.max(paiva.maks, maks);
        if (min !== null) paiva.min = Math.min(paiva.min, min);
      }
      // Päivän symboliksi se, jonka jakso on lähimpänä keskipäivää.
      const symboli = jakso.summary?.symbol_code;
      const ero = Math.abs(tunti + pituus / 2 - SYMBOLI_TUNTI);
      if (symboli && ero < (symboliEro.get(pvm) ?? Infinity)) {
        paiva.symboli = symboli;
        symboliEro.set(pvm, ero);
      }
    }
    paivat.set(pvm, paiva);
  }
  return [...paivat.values()].filter((p) => (riveja.get(p.pvm) || 0) >= 2);
}
