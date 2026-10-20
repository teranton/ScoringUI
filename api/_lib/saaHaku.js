// Sääennuste Ilmatieteen laitoksen avoimesta datasta (WFS, ilmainen, ei API-avainta, lisenssi CC BY 4.0).
// Käytössä on meteorologin muokkaama 10 päivän ennuste, sama kuin ilmatieteenlaitos.fi:ssä. Paikka annetaan
// nimenä (Ilmatieteen laitos etsii sen itse) tai koordinaatteina. Haetaan vain näytettävän päivän tunnit.
// Ennuste pidetään tallessa ENNUSTE_TUORE_MS ajan, ja hakuvirheen sattuessa vanhaa käytetään vielä ENNUSTE_VARALLA_MS ajan.
import { ennustePaiva, paivaYhteenvedot, parsiFmiVastaus, parsiKoordinaatit } from '../../src/utils/saaEnnuste.js';
import { luoValimuisti, luoYhdistaja } from './valimuisti.js';

const TUNTI_MS = 60 * 60 * 1000;
export const ENNUSTE_TUORE_MS = TUNTI_MS;
const ENNUSTE_VARALLA_MS = 12 * TUNTI_MS;
// Paikka, jota Ilmatieteen laitos ei tunne, kysytään uudelleen aikaisintaan päivän päästä.
const PAIKKA_EI_LOYDY_MS = 24 * TUNTI_MS;
const AIKARAJA_MS = 5000;

const FMI_WFS = 'https://opendata.fmi.fi/wfs';
const KYSELY = 'fmi::forecast::edited::weather::scandinavia::point::simple';
const PARAMETRIT = 'Temperature,WindSpeedMS,Precipitation1h,WeatherSymbol3';

export class PaikkaEiLoydyError extends Error {}

// hae ja nyt vaihdetaan testeissä.
export function luoSaaHaku({ hae = fetch, nyt = Date.now, valimuisti = luoValimuisti('saa') } = {}) {
  const yhdista = luoYhdistaja();

  // Päivän tuntiennuste paikalle. Päivä haetaan UTC-vuorokautena, joka kattaa kisa-ajan 8–20 Suomen aikaa.
  async function haeFmi(paikka, pvm) {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'getFeature',
      storedquery_id: KYSELY,
      parameters: PARAMETRIT,
      timestep: '60',
      starttime: `${pvm}T00:00:00Z`,
      endtime: `${pvm}T23:00:00Z`
    });
    const koordinaatit = parsiKoordinaatit(paikka);
    if (koordinaatit) params.set('latlon', `${koordinaatit.lat},${koordinaatit.lon}`);
    else params.set('place', paikka);

    const vastaus = await hae(`${FMI_WFS}?${params}`, { signal: AbortSignal.timeout(AIKARAJA_MS) });
    const teksti = await vastaus.text();
    // Tuntematon paikka: 400 ja ExceptionReport ("No locations found for the place ...").
    if (vastaus.status === 400 && /No locations found/i.test(teksti)) throw new PaikkaEiLoydyError(`Paikkaa ${paikka} ei löytynyt`);
    if (!vastaus.ok) throw new Error(`Ilmatieteen laitos vastasi ${vastaus.status}`);
    return paivaYhteenvedot(parsiFmiVastaus(teksti));
  }

  // Päivän yhteenveto ([] tai [{ pvm, symboli, maks, min, sade, tuuli }]).
  async function paivaEnnuste(paikka, pvm) {
    const avain = `fmi:${paikka.toLowerCase()}:${pvm}`;
    const tallessa = await valimuisti.hae(avain);
    const ika = tallessa ? nyt() - tallessa.tallennettu : Infinity;
    if (ika < (tallessa?.arvo?.eiLoydy ? PAIKKA_EI_LOYDY_MS : ENNUSTE_TUORE_MS)) return tallessa.arvo.paivat;

    return yhdista(avain, async () => {
      try {
        const paivat = (await haeFmi(paikka, pvm)).filter((p) => p.pvm === pvm);
        if (!paivat.length) throw new Error('Ilmatieteen laitoksen vastauksessa ei ole ennustetta päivälle');
        await valimuisti.aseta(avain, { paivat }, nyt());
        return paivat;
      } catch (error) {
        if (error instanceof PaikkaEiLoydyError) {
          await valimuisti.aseta(avain, { paivat: [], eiLoydy: true }, nyt());
          return [];
        }
        if (tallessa?.arvo?.paivat?.length && ika < ENNUSTE_VARALLA_MS) {
          console.error('[SAA] Ennusteen haku epäonnistui, käytetään tallessa olevaa:', error?.message);
          return tallessa.arvo.paivat;
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
    const paivat = await paivaEnnuste(teksti, pvm);
    return { paikka: paivat.length ? teksti : '', paivat };
  };
}
