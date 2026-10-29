// api/saa.js
// Kisan sääennuste: /api/saa?sheetId=<rekisterin sarake E> → { paikka, paivat }.
// Paikka luetaan rekisterin sarakkeesta I; päättyneelle kisalle tai ilman paikkaa paivat on tyhjä.
// CDN pitää vastauksen tuoreena puoli tuntia (Ilmatieteen laitoksen muokattu ennuste päivittyy muutaman kerran päivässä).
import dotenv from 'dotenv';
dotenv.config();

import { haeRekisteriCsv, onSallittuSheetId, parseRekisterinKisat, torjuEiSallittuSheetId } from './_lib/sheetAllowlist.js';
import { luoSaaHaku } from './_lib/saaHaku.js';
import { asetaValimuisti } from './_lib/cdnOtsikot.js';

export const SAA_OTSIKOT = {
  ennuste: 'public, s-maxage=1800, stale-while-revalidate=3600',
  // Lyhyt, jotta sarakkeen I täyttäminen tai kisan tulo ennusteikkunaan näkyy pian.
  tyhja: 'public, s-maxage=600, stale-while-revalidate=3600',
  virhe: 'public, s-maxage=60'
};

const kisanSaa = luoSaaHaku();

function laheta(res, status, cacheControl, body) {
  res.setHeader('Content-Type', 'application/json');
  asetaValimuisti(res, cacheControl);
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  const sheetId = String(req.query?.sheetId || '');
  if (!sheetId) return laheta(res, 400, 'no-store', { error: 'sheetId puuttuu' });
  if (await torjuEiSallittuSheetId(sheetId, res)) return;

  try {
    // Rekisteririvi sallittujen listasta; EXTRA_ALLOWED_SHEET_IDS-taulukolle lista ei välttämättä ole ladattu,
    // joten silloin rivi luetaan rekisteristä (välimuistissa 30 s).
    const kisa = onSallittuSheetId.kisa(sheetId) || parseRekisterinKisat(await haeRekisteriCsv()).get(sheetId);
    const tulos = await kisanSaa({ paikka: kisa?.paikka, alkuPvm: kisa?.alkuPvm, loppuPvm: kisa?.loppuPvm });
    return laheta(res, 200, tulos.paivat.length ? SAA_OTSIKOT.ennuste : SAA_OTSIKOT.tyhja, tulos);
  } catch (error) {
    console.error('[SAA] Ennusteen haku epäonnistui:', error?.message);
    return laheta(res, 200, SAA_OTSIKOT.virhe, { paikka: '', paivat: [], virhe: true });
  }
}
