import dotenv from 'dotenv';
dotenv.config();

import { haeRekisteriCsv } from './_lib/sheetAllowlist.js';
import { asetaValimuisti } from './_lib/cdnOtsikot.js';
import { tulkitseLippu } from '../src/utils/devTila.js';

// Julkinen lista: Cloudflare pitää sen minuutin tuoreena, Vercel 5 s (kopiot eivät kasaudu), ja vanha palautetaan
// heti, kun uusi haetaan taustalla. Uusi tai poistettu kisa näkyy siis noin minuutissa (+ palvelimen 30 s välimuisti).
export const REKISTERI_OTSIKOT = {
  julkinen: 'public, s-maxage=60, stale-while-revalidate=86400',
  // ?preview=1 (järjestäjän esikatselu, näyttää piilotetut kisat): ei CDN:ää eikä selaimen välimuistia, jotta juuri
  // luotu tai poistettu testikisa näkyy heti. Google-haut rajaa silti palvelimen 30 s välimuisti (haeRekisteriCsv).
  esikatselu: 'private, no-store'
};

export default async function handler(req, res) {
  try {
    // Haetaan päärekisteri Sheets API:lla palvelutilin tunnuksilla.
    const csvText = await haeRekisteriCsv();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    if (tulkitseLippu(req.query?.preview) === true) {
      res.setHeader('Cache-Control', REKISTERI_OTSIKOT.esikatselu);
    } else {
      asetaValimuisti(res, REKISTERI_OTSIKOT.julkinen, { vercelEnintaan: 5 });
    }
    return res.status(200).send(csvText);

  } catch (error) {
    // Googlen virheviesti vain lokiin.
    console.error('[REKISTERI] Haku epäonnistui:', error?.message);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: "Google-lataus epäonnistui" });
  }
}
