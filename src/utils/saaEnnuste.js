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

// "63.67, 22.70" tai "63.67 22.70" (desimaalipiste) → { lat, lon }; muuten null (paikan nimi).
export function parsiKoordinaatit(paikka) {
  const osuma = String(paikka || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!osuma) return null;
  const lat = Number(osuma[1]);
  const lon = Number(osuma[2]);
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

// Locationforecastin aikasarja → päivittäiset yhteenvedot kisa-ajalta:
// [{ pvm, symboli, maks, min, sade (mm), tuuli (suurin keskituuli m/s) }].
export function paivaYhteenvedot(aikasarja) {
  const paivat = new Map();
  const symboliEro = new Map();
  for (const rivi of Array.isArray(aikasarja) ? aikasarja : []) {
    const hetki = new Date(rivi?.time);
    if (Number.isNaN(hetki.getTime())) continue;
    const { pvm, tunti } = suomenAika(hetki);
    if (tunti < ALKU_TUNTI || tunti > LOPPU_TUNTI) continue;

    const data = rivi.data || {};
    const lampo = luku(data.instant?.details?.air_temperature);
    if (lampo === null) continue;
    const kuusi = data.next_6_hours;
    const tunnin = data.next_1_hours;
    const lampotilat = [lampo, luku(kuusi?.details?.air_temperature_max), luku(kuusi?.details?.air_temperature_min)].filter((x) => x !== null);
    // Tuntiennusteessa sade lasketaan tunneittain, kauempana kuuden tunnin jaksoittain (rivit ovat 6 h välein).
    const sade = luku(tunnin ? tunnin.details?.precipitation_amount : kuusi?.details?.precipitation_amount);
    // Symboli ja sen jakson keskikohta (tunteina): kuuden tunnin jakso ensin, sitten tunnin, sitten 12 tunnin.
    const [symboli, keskikohta] = kuusi?.summary?.symbol_code ? [kuusi.summary.symbol_code, tunti + 3]
      : tunnin?.summary?.symbol_code ? [tunnin.summary.symbol_code, tunti + 0.5]
        : [data.next_12_hours?.summary?.symbol_code || '', tunti + 6];
    const tuuli = luku(data.instant?.details?.wind_speed);

    const paiva = paivat.get(pvm) || { pvm, symboli: '', maks: -Infinity, min: Infinity, sade: 0, tuuli: null };
    paiva.maks = Math.max(paiva.maks, ...lampotilat);
    paiva.min = Math.min(paiva.min, ...lampotilat);
    if (sade !== null) paiva.sade = Math.round((paiva.sade + sade) * 10) / 10;
    if (tuuli !== null) paiva.tuuli = Math.max(paiva.tuuli ?? 0, tuuli);
    // Päivän symboliksi se, jonka jakso on lähimpänä keskipäivää.
    const ero = Math.abs(keskikohta - SYMBOLI_TUNTI);
    if (symboli && ero < (symboliEro.get(pvm) ?? Infinity)) {
      paiva.symboli = symboli;
      symboliEro.set(pvm, ero);
    }
    paivat.set(pvm, paiva);
  }
  return [...paivat.values()];
}
