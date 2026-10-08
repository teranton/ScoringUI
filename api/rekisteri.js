import dotenv from 'dotenv';
dotenv.config();

import { haeRekisteriCsv } from './_lib/sheetAllowlist.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    // Haetaan päärekisteri suoraan Googlen export-rajapinnasta botin tunnuksilla
    const csvText = await haeRekisteriCsv();

    res.setHeader('Content-Type', 'text/csv');
    return res.status(200).send(csvText);

  } catch (error) {
    return res.status(500).json({ 
      error: "Google-lataus epäonnistui", 
      message: error.message 
    });
  }
}
