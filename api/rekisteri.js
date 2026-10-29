import dotenv from 'dotenv';
dotenv.config();

import { haeRekisteriCsv } from './_lib/sheetAllowlist.js';
import { asetaValimuisti } from './_lib/cdnOtsikot.js';

export default async function handler(req, res) {
  try {
    // Haetaan päärekisteri Sheets API:lla palvelutilin tunnuksilla.
    // CDN pitää listan 5 min tuoreena ja palauttaa vanhan heti, kun uusi haetaan taustalla.
    const csvText = await haeRekisteriCsv();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    asetaValimuisti(res, 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(csvText);

  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      error: "Google-lataus epäonnistui",
      message: error.message
    });
  }
}
