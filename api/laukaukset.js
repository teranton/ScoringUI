import dotenv from 'dotenv';
dotenv.config();
import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  // Sallitaan vain GET-pyynnöt (datan haku)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Luetaan parametrit React-pyynnöstä: ampuja ja se kisan oma sheetId!
  const { ampuja, sheetId } = req.query;

  if (!ampuja || !sheetId) {
    return res.status(400).json({ error: 'Puuttuvia parametreja (ampuja tai sheetId)' });
  }

  try {
    // 1. Kirjaudutaan sisään Googleen Vercelin salaisilla avaimilla
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Korjataan rivinvaihdot varmuuden vuoksi
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    // 2. Tehdään haku suoraan Googlen nopeaan gviz-rajapintaan
    // Oletetaan, että välilehden nimi on "Laukaukset" ja sarake C on ampuja_id
    const query = encodeURIComponent(`where B = '${ampuja}'`);
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=Kierrokset&tq=${query}`;

    const googleRes = await fetch(gvizUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const text = await googleRes.text();

    // 3. Siivotaan Googlen vastaus puhtaaksi JSON-muodoksi
    const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const rawData = JSON.parse(jsonText);

    // 4. Muotoillaan rivit helpoksi taulukoksi Reactia varten
    const muotoillutKierrokset = rawData.table.rows.map(row => {
      // Kerätään sarakkeet F-AD (indeksit 5-29) yhdeksi taulukoksi koodissa
      const laukauksetTaulukko = [];
      for (let i = 5; i <= 29; i++) {
        laukauksetTaulukko.push(row.c[i]?.v ?? 0); // Jos tyhjä, laitetaan 0
      }

      return {
        kierros_id: row.c[0]?.v,
        ampuja_id: row.c[1]?.v,
        rata_id: row.c[2]?.v,
        pvm: row.c[3]?.v,
        kokonaistulos: row.c[4]?.v,
        laukaukset: laukauksetTaulukko // Sisältää nyt esim: [1, 1, 0, 1, ..., 0]
      };
    });

    // Lähetetään valmis, suodatettu paketti turvallisesti React-sovellukselle
    return res.status(200).json(muotoillutKierrokset);

  } catch (error) {
    console.error("Virhe Vercel-backendissä:", error);
    return res.status(500).json({ error: 'Palvelinvirhe tietoja hakiessa' });
  }
}
