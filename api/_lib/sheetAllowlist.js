// Sallittujen sheetId:iden lista: vain kilpailurekisterissä (sarake E) olevat taulukot.
// Estää sen, että API:lla luettaisiin mitä tahansa palvelutilille jaettua taulukkoa.
import { GoogleAuth } from 'google-auth-library';
import { parseCsvRows } from '../../src/utils/csv.js';

export const REKISTERI_SHEET_ID = '1P1Zd-oPY_d3kmvdllG5rBdG6_ISjkW-ZkQVvSierEGA';

const REKISTERI_TTL_MS = 5 * 60 * 1000;
// Tuntematon id saa hakea rekisterin uudelleen korkeintaan näin usein (uudet kisat näkyvät nopeasti).
const UUDELLEENHAKU_VALI_MS = 30 * 1000;

// Hyväksyy pelkän id:n tai docs.google.com-osoitteen ja palauttaa id:n, muuten tyhjän.
export function normalisoiSheetId(arvo) {
  const teksti = String(arvo || '').trim();
  if (!teksti) return '';
  const urlista = teksti.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const id = urlista ? urlista[1] : teksti;
  return /^[A-Za-z0-9_-]{20,}$/.test(id) ? id : '';
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

  async function paivita() {
    if (!kesken) {
      kesken = (async () => {
        try {
          const ids = parseRekisterinSheetIdt(await haeRekisteriCsv());
          sallitut = ids;
          haettu = now();
        } finally {
          kesken = null;
        }
      })();
    }
    return kesken;
  }

  // Palauttaa true vain, jos id löytyy rekisteristä. Rekisterin hakuvirhe heitetään eteenpäin (fail closed).
  return async function onSallittu(sheetId) {
    const id = normalisoiSheetId(sheetId);
    if (!id || id !== String(sheetId).trim()) return false;
    if (lisaSallitut().includes(id)) return true;

    const vanhentunut = !sallitut || (now() - haettu) >= REKISTERI_TTL_MS;
    if (vanhentunut) {
      await paivita();
    } else if (!sallitut.has(id) && (now() - haettu) >= UUDELLEENHAKU_VALI_MS) {
      await paivita();
    }
    return sallitut.has(id);
  };
}

let rekisteriAuthClient = null;

async function haeRekisteriCsvPalvelutilillä() {
  if (!rekisteriAuthClient) {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    rekisteriAuthClient = await auth.getClient();
  }
  const res = await rekisteriAuthClient.request({
    url: `https://docs.google.com/spreadsheets/d/${REKISTERI_SHEET_ID}/export?format=csv`,
    responseType: 'text'
  });
  return res.data;
}

export const onSallittuSheetId = luoSheetAllowlist({ haeRekisteriCsv: haeRekisteriCsvPalvelutilillä });

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
