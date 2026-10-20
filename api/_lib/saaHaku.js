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
// Tyhjä ennuste (päivä ennusteen reunalla) ja hakuvirhe muistetaan näin kauan.
const TYHJA_MS = TUNTI_MS;
const VIRHE_MS = 5 * 60 * 1000;
// Nimellä haetun paikan pitää olla Suomessa (Ilmatieteen laitoksen paikkahaku kattaa koko maailman).
const SUOMI = { latMin: 59.4, latMax: 70.2, lonMin: 19.0, lonMax: 31.7 };
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
    // Tuntematon paikka tai koordinaatit ennustealueen ulkopuolella: 400 ja ExceptionReport.
    if (vastaus.status === 400) throw new PaikkaEiLoydyError(`Ilmatieteen laitos ei hyväksynyt paikkaa ${paikka}`);
    if (!vastaus.ok) throw new Error(`Ilmatieteen laitos vastasi ${vastaus.status}`);
    if (!koordinaatit) {
      const pos = teksti.match(/<gml:pos>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/gml:pos>/);
      const [lat, lon] = pos ? [Number(pos[1]), Number(pos[2])] : [NaN, NaN];
      const suomessa = lat >= SUOMI.latMin && lat <= SUOMI.latMax && lon >= SUOMI.lonMin && lon <= SUOMI.lonMax;
      if (pos && !suomessa) throw new PaikkaEiLoydyError(`Paikka ${paikka} ei ole Suomessa (${lat}, ${lon})`);
    }
    return paivaYhteenvedot(parsiFmiVastaus(teksti));
  }

  // Päivän yhteenveto ([] tai [{ pvm, symboli, maks, min, sade, tuuli }]). Tallessa: { paivat, kesto, virhe }.
  // Tyhjä vastaus (paikkaa ei löydy, päivä ennusteen reunalla) ja virhe muistetaan, jottei Ilmatieteen laitosta
  // kysytä uudelleen joka pyynnöllä.
  async function paivaEnnuste(paikka, pvm) {
    const avain = `fmi:${paikka.toLowerCase()}:${pvm}`;
    const tallessa = await valimuisti.hae(avain);
    const ika = tallessa ? nyt() - tallessa.tallennettu : Infinity;
    if (ika < (tallessa?.arvo?.kesto ?? ENNUSTE_TUORE_MS)) {
      if (tallessa.arvo.virhe) throw new Error('Ilmatieteen laitoksen haku epäonnistui hetki sitten');
      return tallessa.arvo.paivat;
    }
    const vanhaEnnuste = tallessa?.arvo?.paivat?.length && ika < ENNUSTE_VARALLA_MS ? tallessa.arvo.paivat : null;

    return yhdista(avain, async () => {
      try {
        const paivat = (await haeFmi(paikka, pvm)).filter((p) => p.pvm === pvm);
        if (!paivat.length && vanhaEnnuste) return vanhaEnnuste;
        await valimuisti.aseta(avain, { paivat, kesto: paivat.length ? ENNUSTE_TUORE_MS : TYHJA_MS }, nyt());
        return paivat;
      } catch (error) {
        if (error instanceof PaikkaEiLoydyError) {
          await valimuisti.aseta(avain, { paivat: [], kesto: PAIKKA_EI_LOYDY_MS }, nyt());
          return [];
        }
        if (vanhaEnnuste) {
          console.error('[SAA] Ennusteen haku epäonnistui, käytetään tallessa olevaa:', error?.message);
          return vanhaEnnuste;
        }
        await valimuisti.aseta(avain, { paivat: [], kesto: VIRHE_MS, virhe: true }, nyt());
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
