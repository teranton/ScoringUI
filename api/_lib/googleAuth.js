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

// Mobiilikirjauksen kirjoittaja: eri palvelutili (KIRJURI_*), joka on muokkaaja vain niissä kisoissa,
// joissa mobiilikirjaus on käytössä. Lukutili pysyy vain luku -oikeuksisena.
let kirjuriLupaus = null;

export function onKirjuriMaaritetty() {
  return Boolean(process.env.KIRJURI_CLIENT_EMAIL && process.env.KIRJURI_PRIVATE_KEY);
}

export function haeKirjuriAsiakas() {
  if (!kirjuriLupaus) {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.KIRJURI_CLIENT_EMAIL,
        private_key: String(process.env.KIRJURI_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    kirjuriLupaus = auth.getClient().catch((error) => {
      kirjuriLupaus = null;
      throw error;
    });
  }
  return kirjuriLupaus;
}

export function onKiintioVirhe(error) {
  return Number(error?.response?.status || error?.status || error?.code) === 429;
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
