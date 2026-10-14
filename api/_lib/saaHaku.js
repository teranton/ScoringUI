// Sääennuste Open-Meteosta (ilmainen, ei API-avainta).
// Paikan nimi muutetaan koordinaateiksi Open-Meteon geokoodauksella; tulos pidetään tallessa pitkään.
// Ennuste pidetään tallessa ENNUSTE_TUORE_MS ajan, ja hakuvirheen sattuessa vanhaa käytetään vielä ENNUSTE_VARALLA_MS ajan.
import { ennustePaivat, parsiKoordinaatit, poimiPaivat, ENNUSTE_PAIVIA } from '../../src/utils/saaEnnuste.js';
import { luoValimuisti, luoYhdistaja } from './valimuisti.js';

const TUNTI_MS = 60 * 60 * 1000;
export const ENNUSTE_TUORE_MS = TUNTI_MS;
const ENNUSTE_VARALLA_MS = 12 * TUNTI_MS;
const PAIKKA_TUORE_MS = 30 * 24 * TUNTI_MS;
// Tuntematon paikan nimi haetaan uudelleen aikaisintaan päivän päästä.
const PAIKKA_EI_LOYDY_MS = 24 * TUNTI_MS;
// Geokoodaus ja ennuste haetaan peräkkäin; yhteensä alle Vercelin funktion aikarajan.
const AIKARAJA_MS = 4000;

const PAIVAN_SARJAT = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'wind_speed_10m_max'];

async function haeJson(hae, url) {
  const vastaus = await hae(url, { signal: AbortSignal.timeout(AIKARAJA_MS) });
  if (!vastaus.ok) throw new Error(`Open-Meteo vastasi ${vastaus.status}`);
  return vastaus.json();
}

// hae ja nyt vaihdetaan testeissä.
export function luoSaaHaku({ hae = fetch, nyt = Date.now, valimuisti = luoValimuisti('saa') } = {}) {
  const yhdista = luoYhdistaja();

  // Paikan nimi → { lat, lon, nimi } tai null. Suomalainen osuma ensin.
  async function paikanKoordinaatit(paikka) {
    const koordinaatit = parsiKoordinaatit(paikka);
    if (koordinaatit) return { ...koordinaatit, nimi: '' };

    const avain = `paikka:${paikka.trim().toLowerCase()}`;
    const tallessa = await valimuisti.hae(avain);
    const ika = tallessa ? nyt() - tallessa.tallennettu : Infinity;
    if (tallessa && ika < (tallessa.arvo ? PAIKKA_TUORE_MS : PAIKKA_EI_LOYDY_MS)) return tallessa.arvo;

    return yhdista(avain, async () => {
      try {
        const params = new URLSearchParams({ name: paikka.trim(), count: '5', language: 'fi', format: 'json' });
        const data = await haeJson(hae, `https://geocoding-api.open-meteo.com/v1/search?${params}`);
        const tulokset = Array.isArray(data?.results) ? data.results : [];
        const osuma = tulokset.find((t) => t.country_code === 'FI') || tulokset[0];
        const arvo = osuma && Number.isFinite(osuma.latitude) && Number.isFinite(osuma.longitude)
          ? { lat: osuma.latitude, lon: osuma.longitude, nimi: String(osuma.name || '') }
          : null;
        await valimuisti.aseta(avain, arvo, nyt());
        return arvo;
      } catch (error) {
        if (tallessa?.arvo) return tallessa.arvo;
        throw error;
      }
    });
  }

  // Koko 16 päivän päiväennuste paikalle ({ time: [...], weather_code: [...], ... }).
  async function paivaEnnuste(lat, lon) {
    const avain = `ennuste:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const tallessa = await valimuisti.hae(avain);
    const ika = tallessa ? nyt() - tallessa.tallennettu : Infinity;
    if (ika < ENNUSTE_TUORE_MS) return tallessa.arvo;

    return yhdista(avain, async () => {
      try {
        const params = new URLSearchParams({
          latitude: lat.toFixed(2),
          longitude: lon.toFixed(2),
          daily: PAIVAN_SARJAT.join(','),
          timezone: 'Europe/Helsinki',
          wind_speed_unit: 'ms',
          forecast_days: String(ENNUSTE_PAIVIA)
        });
        const data = await haeJson(hae, `https://api.open-meteo.com/v1/forecast?${params}`);
        if (!Array.isArray(data?.daily?.time) || !data.daily.time.length) throw new Error('Open-Meteon vastauksessa ei ole päiväennustetta');
        const daily = Object.fromEntries(['time', ...PAIVAN_SARJAT].map((s) => [s, Array.isArray(data?.daily?.[s]) ? data.daily[s] : []]));
        await valimuisti.aseta(avain, daily, nyt());
        return daily;
      } catch (error) {
        if (tallessa && ika < ENNUSTE_VARALLA_MS) {
          console.error('[SAA] Ennusteen haku epäonnistui, käytetään tallessa olevaa:', error?.message);
          return tallessa.arvo;
        }
        throw error;
      }
    });
  }

  // { paikka, paivat: [{ pvm, koodi, maks, min, sade, tuuli }] }; paivat on tyhjä, jos ennustetta ei ole.
  return async function kisanSaa({ paikka, alkuPvm, loppuPvm }) {
    const teksti = String(paikka || '').trim();
    const paivat = ennustePaivat(alkuPvm, loppuPvm, new Date(nyt()));
    if (!teksti || !paivat.length) return { paikka: '', paivat: [] };

    const sijainti = await paikanKoordinaatit(teksti);
    if (!sijainti) return { paikka: '', paivat: [] };
    const daily = await paivaEnnuste(sijainti.lat, sijainti.lon);
    return { paikka: sijainti.nimi || teksti, paivat: poimiPaivat(daily, paivat) };
  };
}
