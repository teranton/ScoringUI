// Sallittujen sheetId:iden lista: vain kilpailurekisterissä (sarake E) olevat taulukot.
// Estää sen, että API:lla luettaisiin mitä tahansa palvelutilille jaettua taulukkoa.
import { GoogleAuth } from 'google-auth-library';
import { parseCsvRows } from '../../src/utils/csv.js';

export const REKISTERI_SHEET_ID = '1P1Zd-oPY_d3kmvdllG5rBdG6_ISjkW-ZkQVvSierEGA';

const REKISTERI_TTL_MS = 5 * 60 * 1000;
// Tuntematon id saa hakea rekisterin uudelleen korkeintaan näin usein (uudet kisat näkyvät nopeasti).
const UUDELLEENHAKU_VALI_MS = 30 * 1000;

// Palauttaa id:n, jos arvo näyttää Google Sheets -id:ltä, muuten tyhjän.
// Sarakkeessa E pitää olla pelkkä id: frontend lähettää arvon sellaisenaan API:lle.
export function normalisoiSheetId(arvo) {
  const teksti = String(arvo || '').trim();
  return /^[A-Za-z0-9_-]{20,}$/.test(teksti) ? teksti : '';
}

export function parseRekisterinSheetIdt(csvText) {
  const ids = new Set();
  parseCsvRows(csvText).forEach((row, i) => {
    if (i === 0 && (row[1]?.toLowerCase().includes('nimi') || row[0]?.toLowerCase().includes('id'))) return;
    const id = normalisoiSheetId(row[4]);
    if (id) ids.add(id);
  });
  return ids;
}

function lisaSallitut() {
  return String(process.env.EXTRA_ALLOWED_SHEET_IDS || '')
    .split(',')
    .map(normalisoiSheetId)
    .filter(Boolean);
}

export function luoSheetAllowlist({ haeRekisteriCsv, now = () => Date.now() }) {
  let sallitut = null;
  let haettu = 0;
  let kesken = null;

  // Hakee rekisterin. Jos haku epäonnistuu ja vanha lista on muistissa, vanha lista jää voimaan
  // ja uusi yritys tehdään aikaisintaan UUDELLEENHAKU_VALI_MS:n päästä.
  function paivita() {
    if (!kesken) {
      kesken = (async () => {
        try {
          sallitut = parseRekisterinSheetIdt(await haeRekisteriCsv());
          haettu = now();
        } catch (error) {
          if (!sallitut) throw error;
          console.error('[ALLOWLIST] Rekisterin päivitys epäonnistui, käytetään edellistä listaa:', error?.message);
          haettu = now() - REKISTERI_TTL_MS + UUDELLEENHAKU_VALI_MS;
        } finally {
          kesken = null;
        }
      })();
    }
    return kesken;
  }

  // Palauttaa true vain, jos id löytyy rekisteristä. Jos rekisteriä ei ole koskaan saatu haettua,
  // virhe heitetään eteenpäin (fail closed).
  return async function onSallittu(sheetId) {
    const id = normalisoiSheetId(sheetId);
    if (!id || id !== sheetId) return false;
    if (lisaSallitut().includes(id)) return true;

    if (!sallitut) {
      await paivita();
      return sallitut.has(id);
    }

    const ika = now() - haettu;
    if (!sallitut.has(id) && ika >= UUDELLEENHAKU_VALI_MS) {
      await paivita();
    } else if (ika >= REKISTERI_TTL_MS) {
      // Vanhentunut lista päivitetään taustalla, jotta pyyntö ei jää odottamaan.
      paivita();
    }
    return sallitut.has(id);
  };
}

let rekisteriAuthClient = null;

export async function haeRekisteriCsv() {
  if (!rekisteriAuthClient) {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
    });
    rekisteriAuthClient = await auth.getClient();
  }
  const res = await rekisteriAuthClient.request({
    url: `https://docs.google.com/spreadsheets/d/${REKISTERI_SHEET_ID}/export?format=csv`,
    responseType: 'text'
  });
  return res.data;
}

export const onSallittuSheetId = luoSheetAllowlist({ haeRekisteriCsv });

// Yhteinen tarkistus API-funktioille. Palauttaa true, jos vastaus on jo lähetetty (pyyntö torjuttu).
export async function torjuEiSallittuSheetId(sheetId, res) {
  try {
    if (await onSallittuSheetId(sheetId)) return false;
    res.setHeader('Content-Type', 'application/json');
    res.status(403).json({ error: 'Taulukko ei ole kilpailurekisterissä' });
  } catch (error) {
    console.error('[ALLOWLIST] Kilpailurekisterin haku epäonnistui:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(503).json({ error: 'Kilpailurekisteriä ei saatu tarkistettua' });
  }
  return true;
}
