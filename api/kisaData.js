import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';

// TÄMÄ ON VÄLIMUISTI: Se säilyy Vercelin palvelimen muistissa pyyntöjen välillä
const gidCache = {};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const { sheetId, sheetName } = req.query;

  if (!sheetId || !sheetName) {
    return res.status(400).json({ error: "sheetId ja sheetName vaaditaan" });
  }

  // Luodaan uniikki avain tälle sheetille ja välilehdelle välimuistia varten
  const cacheKey = `${sheetId}_${sheetName.trim().toLowerCase()}`;

  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
    });

    const client = await auth.getClient();
    let foundGid = null;

    // KATSOTAAN LÖYTYYKÖ GID JO VALMIUKSI MUISTISTA
    if (gidCache[cacheKey]) {
      foundGid = gidCache[cacheKey];
    } else {
      // 1. VAIHE: Haetaan rakenne VAIN jos sitä ei löydy muistista
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
      const metaRes = await client.request({ url: metaUrl });
      
      const sheets = metaRes.data.sheets || [];
      const tarjollaOlevat = sheets.map(s => s.properties.title);

      for (const sheet of sheets) {
        if (sheet.properties.title.trim().toLowerCase() === sheetName.trim().toLowerCase()) {
          foundGid = sheet.properties.sheetId;
          break;
        }
      }

      if (foundGid === null) {
        return res.status(404).json({ 
          error: `Välilehteä '${sheetName}' ei löytynyt taulukosta.`,
          availableSheets: tarjollaOlevat
        });
      }

      // TALLENNETAAN LÖYTYNYT GID MUISTIIN TULEVAISUUTTA VARTEN
      gidCache[cacheKey] = foundGid;
    }

    // 2. VAIHE: Ladataan itse data (Tämä osio ajaa aina salamanpikaa välimuistin ansiosta)
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${foundGid}`;

    const googleRes = await client.request({
      url: exportUrl,
      responseType: 'text'
    });

    res.setHeader('Content-Type', 'text/csv');
    return res.status(200).send(googleRes.data);

  } catch (error) {
    return res.status(500).json({ 
      error: "Kisan datan haku epäonnistui", 
      message: error.message 
    });
  }
}