// Palvelutilin Google-asiakas, yksi per funktioinstanssi.
import { GoogleAuth } from 'google-auth-library';

let asiakasLupaus = null;

export function haeGoogleAsiakas() {
  if (!asiakasLupaus) {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
      // Vain lukuoikeus taulukoihin: palvelutili ei pääse Driveen eikä voi kirjoittaa.
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    asiakasLupaus = auth.getClient().catch((error) => {
      asiakasLupaus = null;
      throw error;
    });
  }
  return asiakasLupaus;
}

// Mobiilikirjauksen kirjoittajat: eri palvelutilit (KIRJURI_*), jotka ovat muokkaajia vain niissä kisoissa,
// joissa mobiilikirjaus on käytössä. Lukutili pysyy vain luku -oikeuksisena. Googlen kiintiö (60 luku- ja 60
// kirjoituspyyntöä minuutissa) on tilikohtainen, joten radat ja ryhmät jaetaan tileille (api/_lib/kirjuriTilit.js):
// tili 1 on KIRJURI_CLIENT_EMAIL / KIRJURI_PRIVATE_KEY, tilit 2..4 KIRJURI_CLIENT_EMAIL_2 / KIRJURI_PRIVATE_KEY_2 jne.
export const MAKS_KIRJUREITA = 4;

function kirjurinTunnukset(indeksi, env = process.env) {
  const loppu = indeksi === 0 ? '' : `_${indeksi + 1}`;
  const email = env[`KIRJURI_CLIENT_EMAIL${loppu}`];
  const avain = env[`KIRJURI_PRIVATE_KEY${loppu}`];
  return email && avain ? { email, avain } : null;
}

// Määritettyjen kirjuritilien määrä: numerot peräkkäin ykkösestä alkaen (aukon jälkeiset jätetään pois).
export function kirjurienMaara(env = process.env) {
  let maara = 0;
  while (maara < MAKS_KIRJUREITA && kirjurinTunnukset(maara, env)) maara++;
  return maara;
}

export function onKirjuriMaaritetty() {
  return kirjurienMaara() > 0;
}

const kirjuriLupaukset = new Map();

export function haeKirjuriAsiakas(indeksi = 0) {
  if (!kirjuriLupaukset.has(indeksi)) {
    const tunnukset = kirjurinTunnukset(indeksi);
    const auth = new GoogleAuth({
      credentials: {
        client_email: tunnukset?.email,
        private_key: String(tunnukset?.avain || '').replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    kirjuriLupaukset.set(indeksi, auth.getClient().catch((error) => {
      kirjuriLupaukset.delete(indeksi);
      throw error;
    }));
  }
  return kirjuriLupaukset.get(indeksi);
}

export const googleStatus = (error) => Number(error?.response?.status || error?.status || error?.code);
export const googleViesti = (error) => JSON.stringify(error?.response?.data || error?.message || '');

export function onKiintioVirhe(error) {
  return googleStatus(error) === 429;
}

const odota = (ms) => new Promise((ratkaise) => setTimeout(ratkaise, ms));

// Google-pyyntö, joka yrittää kerran uudelleen, jos kiintiö on hetkellisesti täynnä (429).
export async function pyyntoUudelleenyrittaen(request, opts, { viive = 800 } = {}) {
  try {
    return await request(opts);
  } catch (error) {
    if (!onKiintioVirhe(error)) throw error;
    await odota(viive + Math.floor(Math.random() * viive));
    return request(opts);
  }
}
