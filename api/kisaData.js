import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';

// TÄMÄ ON VÄLIMUISTI: Se säilyy Vercelin palvelimen muistissa pyyntöjen välillä
const gidCache = {};
const gidMapCache = {}; // Välimuisti koko sheet-nimestä → gidiin mappingille
let cachedAuthClient = null; // Välimuisti Google Auth -asiakkaalle (uudelleenkäyttö välttää JWT-allekirjoituksen uusinnan)

function logStep(start, name) {
  const ms = Date.now() - start;
  console.log(`[${name}] ${ms}ms`);
}

async function getAuthClientWithLogs() {
  const authStart = Date.now();

  let client = cachedAuthClient;

  if (!client) {
    console.log('[AUTH] Creating GoogleAuth');

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

    client = await auth.getClient();
    cachedAuthClient = client;
    logStep(authStart, 'AUTH getClient');
  } else {
    console.log('[AUTH] Cached client');
  }

  const tokenStart = Date.now();
  const token = await client.getAccessToken();
  logStep(tokenStart, 'TOKEN');

  console.log(
    `[TOKEN] ${
      typeof token === 'string'
        ? token.substring(0, 20)
        : (token.token || '').substring(0, 20)
    }...`
  );

  return client;
}

export default async function handler(req, res) {
  const { sheetId, sheetName, mode, sheetNames } = req.query;

  // BATCH MODE: Haetaan useat CSV-tiedostot yhdessä pyynnössä
  if (mode === 'batchCsv' && sheetNames) {
    res.setHeader('Content-Type', 'application/json');
    // Lisää cache-headers: välimuisti 5 minuuttia (jos kisa ei ole muuttumassa live)
    res.setHeader('Cache-Control', 'public, max-age=300');

    const batchStartTime = Date.now();
    console.log(`[BATCH START] ${new Date().toISOString()}`);

    try {
      const client = await getAuthClientWithLogs();

      const mapCacheKey = sheetId;

      // 1. VAIHE: Haetaan gid-kartta kerran kaikille välilehdille
      let gidMap = gidMapCache[mapCacheKey];
      let allSheets = [];
      const metaStartTime = Date.now();
      if (!gidMap) {
        const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
        const metaRes = await client.request({ url: metaUrl });

        allSheets = metaRes.data.sheets || [];
        gidMap = {};
        for (const sheet of allSheets) {
          gidMap[sheet.properties.title.trim().toLowerCase()] = sheet.properties.sheetId;
        }
        gidMapCache[mapCacheKey] = gidMap;
        console.log(`[BATCH] Metadata haettu: ${Date.now() - metaStartTime}ms (uusi cache)`);
      } else {
        console.log('[BATCH] Metadata cache osuma (säästy ~200-500ms)');
      }

      // 2. VAIHE: Muutetaan pyydetyt nimet gideiksi
      const rawSheetNames = Array.isArray(sheetNames) ? sheetNames : [sheetNames];
      const sheetNamesArray = rawSheetNames.map((n) => {
        try {
          return decodeURIComponent(n);
        } catch {
          return n;
        }
      });
      const gidRequests = [];
      const keyMap = {}; // Mappaa gid → alkuperäisen avaimen
      const notFound = [];

      console.log(`[BATCH] Pyydetyt levyt: ${sheetNamesArray.join(', ')}`);
      console.log(`[BATCH] Käytettävissä olevat levyt: ${Object.keys(gidMap).join(', ')}`);

      for (const requestedSheetName of sheetNamesArray) {
        const normalizedName = requestedSheetName.trim().toLowerCase();
        const gid = gidMap[normalizedName];
        if (gid !== undefined) {
          keyMap[gid] = requestedSheetName;
          const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
          gidRequests.push(
            client.request({ url: exportUrl, responseType: 'text' })
              .then(r => ({ gid, data: r.data, sheetName: requestedSheetName }))
              .catch(err => ({ gid, data: '', error: err.message, sheetName: requestedSheetName }))
          );
        } else {
          notFound.push(requestedSheetName);
          console.warn(`[BATCH] Levyä '${requestedSheetName}' (normalized: '${normalizedName}') ei löytynyt`);
        }
      }

      // 3. VAIHE: Ladataan kaikki CSV:t rinnakkain ja palauta JSON-objektina
      const csvStartTime = Date.now();
      const results = await Promise.all(gidRequests);
      const csvDuration = Date.now() - csvStartTime;
      console.log(`[BATCH] CSV:t haettu: ${csvDuration}ms (${results.length} levyä rinnakkain)`);
      results.forEach((r) => {
        const size = (r.data?.length || 0) / 1024;
        console.log(`  - ${r.sheetName}: ${size.toFixed(1)}KB`);
      });

      const csvByName = {};
      for (const { gid, data } of results) {
        const name = keyMap[gid];
        csvByName[name] = data;
      }

      // Palauta debug-info jos joitain levyjä ei löytynyt
      const response = { csvByName };
      if (notFound.length > 0) {
        response.notFound = notFound;
        response.availableSheets = allSheets.length > 0
          ? allSheets.map(s => s.properties.title)
          : Object.keys(gidMap);
        response.debug = `Haetut: ${sheetNamesArray.join(', ')} | Saadut: ${Object.keys(csvByName).join(', ')}`;
      }

      const totalTime = Date.now() - batchStartTime;
      response.timing = {
        total_ms: totalTime,
        meta_ms: metaStartTime ? (csvStartTime - metaStartTime) : 0,
        csv_ms: csvDuration
      };
      console.log(`[BATCH DONE] Kokonaisaika: ${totalTime}ms`);

      return res.status(200).json(response);
    } catch (error) {
      return res.status(500).json({
        error: 'Kisan datan haku epäonnistui',
        message: error.message
      });
    }
  }

  // SINGLE MODE: Haetaan yksi CSV
  res.setHeader('Content-Type', 'application/json');

  if (!sheetId || !sheetName) {
    return res.status(400).json({ error: 'sheetId ja sheetName vaaditaan' });
  }

  const cacheKey = `${sheetId}_${sheetName.trim().toLowerCase()}`;

  try {
    const client = await getAuthClientWithLogs();

    let foundGid = null;

    // KATSOTAAN LÖYTYYKÖ GID JO VALMIUKSI MUISTISTA
    if (gidCache[cacheKey]) {
      foundGid = gidCache[cacheKey];
    } else {
      // 1. VAIHE: Haetaan rakenne VAIN jos sitä ei löydy muistista
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
     // const metaRes = await client.request({ url: metaUrl });
const metaRes = await timedRequest(
    client,
    metaUrl,
    undefined,
    "META"
);
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

    // 2. VAIHE: Ladataan itse data
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${foundGid}`;
    const exportStart = Date.now();

    // const googleRes = await client.request({
    //   url: exportUrl,
    //   responseType: 'text'
    // });

    const googleRes = timedRequest(
    client,
    exportUrl,
    "text",
    `CSV ${sheetName}`
)

    logStep(exportStart, 'SINGLE CSV');
    res.setHeader('Content-Type', 'text/csv');
    return res.status(200).send(googleRes.data);
  } catch (error) {
    return res.status(500).json({
      error: 'Kisan datan haku epäonnistui',
      message: error.message
    });
  }
}