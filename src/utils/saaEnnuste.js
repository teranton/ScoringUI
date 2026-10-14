// src/utils/saaEnnuste.js
// Sääennusteen apufunktiot, joita käyttävät sekä kisakortti että api/saa.js.
// Ennuste tulee Open-Meteosta (ilmainen, ei avainta) kisan paikan mukaan (rekisterin sarake H).
import { isoPaiva, parsiPaivamaara } from './kisaStatus.js';

// Open-Meteon päiväennuste ulottuu 16 päivän päähän (tämä päivä mukaan lukien).
export const ENNUSTE_PAIVIA = 16;
// Pitkän kisan ennusteesta näytetään enintään näin monta päivää.
const MAKS_PAIVIA = 4;

const SUOMEN_PAIVA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' });

// Tämä päivä Suomen aikaa (vvvv-kk-pp): ennuste pyydetään Helsingin ajassa, ja palvelin ajaa UTC:ssä.
export function tamaPaivaSuomessa(nyt = new Date()) {
  const osa = Object.fromEntries(SUOMEN_PAIVA.formatToParts(nyt).map((o) => [o.type, o.value]));
  return `${osa.year}-${osa.month}-${osa.day}`;
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

// Kisan päivät (vvvv-kk-pp), joille ennuste on saatavilla: tästä päivästä (Suomen aikaa) eteenpäin, ENNUSTE_PAIVIA päivän sisällä.
export function ennustePaivat(alkuPvm, loppuPvm, nyt = new Date()) {
  const alku = parsiPaivamaara(alkuPvm);
  if (!alku) return [];
  const loppu = parsiPaivamaara(loppuPvm) || alku;
  if (loppu < alku) return [];

  const tanaan = parsiPaivamaara(tamaPaivaSuomessa(nyt));
  const viimeinen = new Date(tanaan.getFullYear(), tanaan.getMonth(), tanaan.getDate() + ENNUSTE_PAIVIA - 1);
  const paivat = [];
  for (let pvm = new Date(Math.max(alku, tanaan)); pvm <= loppu && pvm <= viimeinen && paivat.length < MAKS_PAIVIA;) {
    paivat.push(isoPaiva(pvm));
    pvm = new Date(pvm.getFullYear(), pvm.getMonth(), pvm.getDate() + 1);
  }
  return paivat;
}

// Haetaanko kisalle sää: paikka on annettu, kisa ei ole päättynyt ja jokin kisapäivä on ennusteen sisällä.
export function naytetaankoSaa(kisa, status, nyt = new Date()) {
  if (!String(kisa?.paikka || '').trim() || status === 'paattynyt') return false;
  return ennustePaivat(kisa.alkuPvm, kisa.loppuPvm, nyt).length > 0;
}

// WMO-säätila (Open-Meteon weather_code) → näytettävä tyyppi.
export function saaTyyppi(koodi) {
  const k = typeof koodi === 'number' ? koodi : NaN;
  if (k === 0) return 'selkea';
  if (k === 1 || k === 2) return 'puolipilvinen';
  if (k === 3) return 'pilvinen';
  if (k === 45 || k === 48) return 'sumu';
  if (k >= 51 && k <= 57) return 'tihku';
  if ((k >= 61 && k <= 67) || (k >= 80 && k <= 82)) return 'sade';
  if ((k >= 71 && k <= 77) || k === 85 || k === 86) return 'lumi';
  if (k >= 95 && k <= 99) return 'ukkonen';
  return 'pilvinen';
}

// Open-Meteon daily-osio → [{ pvm, koodi, maks, min, sade, tuuli }] pyydetyille päiville.
export function poimiPaivat(daily, paivat) {
  const ajat = Array.isArray(daily?.time) ? daily.time : [];
  const luku = (sarja, i) => {
    const arvo = daily?.[sarja]?.[i];
    return Number.isFinite(arvo) ? arvo : null;
  };
  return paivat.flatMap((pvm) => {
    const i = ajat.indexOf(pvm);
    if (i < 0 || luku('temperature_2m_max', i) === null) return [];
    return [{
      pvm,
      koodi: luku('weather_code', i),
      maks: luku('temperature_2m_max', i),
      min: luku('temperature_2m_min', i),
      sade: luku('precipitation_probability_max', i),
      tuuli: luku('wind_speed_10m_max', i)
    }];
  });
}
