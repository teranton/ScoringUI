// Sallittujen sheetId:iden lista: vain kilpailurekisterissä (sarake E) olevat taulukot.
// Estää sen, että API:lla luettaisiin mitä tahansa palvelutilille jaettua taulukkoa.
import { parseCsvRows } from '../../src/utils/csv.js';
import { haeGoogleAsiakas, pyyntoUudelleenyrittaen } from './googleAuth.js';
import { luoValimuisti, luoYhdistaja } from './valimuisti.js';

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

// Rekisterin kisat sheetId:n mukaan: { alkuPvm, loppuPvm } (sarakkeet C ja D sellaisinaan).
export function parseRekisterinKisat(csvText) {
  const kisat = new Map();
  parseCsvRows(csvText).forEach((row, i) => {
    if (i === 0 && (row[1]?.toLowerCase().includes('nimi') || row[0]?.toLowerCase().includes('id'))) return;
    const id = normalisoiSheetId(row[4]);
    if (id && !kisat.has(id)) kisat.set(id, { alkuPvm: row[2] || '', loppuPvm: row[3] || '' });
  });
  return kisat;
}

export function parseRekisterinSheetIdt(csvText) {
  return new Set(parseRekisterinKisat(csvText).keys());
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
          sallitut = parseRekisterinKisat(await haeRekisteriCsv());
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
  async function onSallittu(sheetId) {
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
  }

  // Onko rekisteri jo muistissa (tarkistus ei silloin odota verkkoa).
  onSallittu.onLadattu = () => sallitut !== null;
  // Kisan rekisteririvi ({ alkuPvm, loppuPvm }) tai null.
  onSallittu.kisa = (sheetId) => sallitut?.get(sheetId) || null;
  return onSallittu;
}

// Rekisterin CSV välimuistista, jos se on alle REKISTERI_VALIMUISTI_MS vanha (myös `vercel dev` -ajossa,
// jossa muisti ei säily pyyntöjen välillä). Jos haku epäonnistuu, käytetään vanhaa kopiota.
const REKISTERI_VALIMUISTI_MS = UUDELLEENHAKU_VALI_MS;
const rekisteriValimuisti = luoValimuisti('rekisteri');
const yhdistaRekisteri = luoYhdistaja();

async function haeRekisteriGooglesta() {
  const asiakas = await haeGoogleAsiakas();
  const res = await pyyntoUudelleenyrittaen((opts) => asiakas.request(opts), {
    url: `https://docs.google.com/spreadsheets/d/${REKISTERI_SHEET_ID}/export?format=csv`,
    responseType: 'text'
  });
  return res.data;
}

export async function haeRekisteriCsv({ nyt = Date.now } = {}) {
  const tallessa = await rekisteriValimuisti.hae('csv');
  if (tallessa && (nyt() - tallessa.tallennettu) < REKISTERI_VALIMUISTI_MS) return tallessa.arvo;
  return yhdistaRekisteri('csv', async () => {
    try {
      const csv = await haeRekisteriGooglesta();
      await rekisteriValimuisti.aseta('csv', csv, nyt());
      return csv;
    } catch (error) {
      if (tallessa) {
        console.error('[REKISTERI] Haku epäonnistui, käytetään tallessa olevaa:', error?.message);
        return tallessa.arvo;
      }
      throw error;
    }
  });
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
