import { GoogleAuth } from 'google-auth-library';

// Globaali välimuisti säilyy Vercelin instanssin muistissa "lämpimien" pyyntöjen ajan
const gidMapCache = {};
let cachedAuthClient = null;

async function getAuthClient() {
  if (!cachedAuthClient) {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    cachedAuthClient = await auth.getClient();
  }
  return cachedAuthClient;
}

export default async function handler(req, res) {
  const { sheetId } = req.query;

  if (!sheetId) {
    return res.status(400).json({ error: 'sheetId vaaditaan' });
  }

  // Asetetaan tehokkaat välimuistiotsikot Edge-verkkoon (Vercel CDN)
  // s-maxage=60: Vercel pitää listaa välimuistissa 1 minuutin
  // stale-while-revalidate=600: Jos data on vanhaa, palautetaan se heti ja haetaan taustalla uusi
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600, public');

  try {
    // 1. Tarkistetaan löytyykö tämän sheetId:n rakenne jo palvelimen muistista
    if (gidMapCache[sheetId]) {
      console.log(`[CACHE HIT] Palautetaan gid-kartta muistista: ${sheetId}`);
      return res.status(200).json({ sheets: gidMapCache[sheetId] });
    }

    const client = await getAuthClient();
    
    // 2. Haetaan VAIN välilehtien nimet ja id:t (ultra-optimoitu kenttärajaus)
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title,sheetId))`;
    const metaRes = await client.request({ url: metaUrl });
    const allSheets = metaRes.data.sheets || [];

    // 3. Rakennetaan selkeä avain-arvo-pari (Nimi -> GID)
    const sheetsMap = {};
    for (const sheet of allSheets) {
      if (sheet.properties?.title) {
        // Tallennetaan alkuperäisessä muodossa frontendille
        sheetsMap[sheet.properties.title] = String(sheet.properties.sheetId);
      }
    }

    // Tallennetaan muistiin
    gidMapCache[sheetId] = sheetsMap;

    return res.status(200).json({ sheets: sheetsMap });

  } catch (error) {
    console.error('[ERROR] Virhe metadatan haussa:', error);
    return res.status(500).json({
      error: 'Taulukon rakenteen haku epäonnistui',
      message: error.message
    });
  }
}