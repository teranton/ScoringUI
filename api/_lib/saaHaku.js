// Sääennuste yr.no:sta (MET Norwayn Locationforecast 2.0, ilmainen, ei API-avainta).
// MET vaatii User-Agent-otsikon, jossa on yhteystieto, ja pyytää välimuistia (ei hakuja Expires-aikaa tiheämmin).
// Paikan nimi muutetaan koordinaateiksi Open-Meteon geokoodauksella (METillä ei ole hakua nimellä); tulos pidetään tallessa pitkään.
// Ennuste pidetään tallessa ENNUSTE_TUORE_MS ajan, ja hakuvirheen sattuessa vanhaa käytetään vielä ENNUSTE_VARALLA_MS ajan.
import { ennustePaiva, paivaYhteenvedot, parsiKoordinaatit } from '../../src/utils/saaEnnuste.js';
import { luoValimuisti, luoYhdistaja } from './valimuisti.js';

const TUNTI_MS = 60 * 60 * 1000;
export const ENNUSTE_TUORE_MS = TUNTI_MS;
const ENNUSTE_VARALLA_MS = 12 * TUNTI_MS;
const PAIKKA_TUORE_MS = 30 * 24 * TUNTI_MS;
// Tuntematon paikan nimi haetaan uudelleen aikaisintaan päivän päästä.
const PAIKKA_EI_LOYDY_MS = 24 * TUNTI_MS;
// Geokoodaus ja ennuste haetaan peräkkäin; yhteensä alle Vercelin funktion aikarajan.
const AIKARAJA_MS = 4000;

// MET:n käyttöehdot: tunnistettava sovellus ja yhteystieto. SAA_USER_AGENT vaihtaa sen.
const USER_AGENT = process.env.SAA_USER_AGENT || 'TT-Tulospalvelu/1.0 github.com/teranton/ScoringUI tt.tulospalvelu@gmail.com';

async function haeJson(hae, url, palvelu) {
  const vastaus = await hae(url, { signal: AbortSignal.timeout(AIKARAJA_MS), headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!vastaus.ok) throw new Error(`${palvelu} vastasi ${vastaus.status}`);
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
        const data = await haeJson(hae, `https://geocoding-api.open-meteo.com/v1/search?${params}`, 'Open-Meteo');
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

  // Päivittäiset yhteenvedot paikan ennusteesta ([{ pvm, symboli, maks, min, sade, tuuli }]).
  async function paivaEnnuste(lat, lon) {
    const avain = `yr:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const tallessa = await valimuisti.hae(avain);
    const ika = tallessa ? nyt() - tallessa.tallennettu : Infinity;
    if (ika < ENNUSTE_TUORE_MS) return tallessa.arvo;

    return yhdista(avain, async () => {
      try {
        // MET pyytää enintään neljää desimaalia; kaksi riittää ja jakaa välimuistin lähipaikoille.
        const params = new URLSearchParams({ lat: lat.toFixed(2), lon: lon.toFixed(2) });
        const data = await haeJson(hae, `https://api.met.no/weatherapi/locationforecast/2.0/compact?${params}`, 'MET Norway');
        const paivat = paivaYhteenvedot(data?.properties?.timeseries);
        if (!paivat.length) throw new Error('MET Norwayn vastauksessa ei ole ennustetta');
        await valimuisti.aseta(avain, paivat, nyt());
        return paivat;
      } catch (error) {
        if (tallessa && ika < ENNUSTE_VARALLA_MS) {
          console.error('[SAA] Ennusteen haku epäonnistui, käytetään tallessa olevaa:', error?.message);
          return tallessa.arvo;
        }
        throw error;
      }
    });
  }

  // { paikka, paivat: [{ pvm, symboli, maks, min, sade, tuuli }] } näytettävälle päivälle (yksi tai ei yhtään).
  return async function kisanSaa({ paikka, alkuPvm, loppuPvm }) {
    const teksti = String(paikka || '').trim();
    const pvm = ennustePaiva(alkuPvm, loppuPvm, new Date(nyt()));
    if (!teksti || !pvm) return { paikka: '', paivat: [] };

    const sijainti = await paikanKoordinaatit(teksti);
    if (!sijainti) return { paikka: '', paivat: [] };
    const paivat = await paivaEnnuste(sijainti.lat, sijainti.lon);
    return { paikka: sijainti.nimi || teksti, paivat: paivat.filter((p) => p.pvm === pvm) };
  };
}
