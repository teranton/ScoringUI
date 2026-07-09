// api/kisaData.js
import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';

// TÄMÄ ON VÄLIMUISTI: Se säilyy Vercelin palvelimen muistissa pyyntöjen välillä
const gidCache = {};
const gidMapCache = {}; // Välimuisti: sisältää nyt { gidMap, spreadsheetTitle }
let cachedAuthClient = null; // Välimuisti Google Auth -asiakkaalle
const batchCsvCache = {};

const BATCH_CACHE_TTL_MS = Number.isFinite(Number(process.env.BATCH_CSV_CACHE_TTL_MS))
  ? Number(process.env.BATCH_CSV_CACHE_TTL_MS)
  : 60000;

function logStep(start, name) {
  const ms = Date.now() - start;
  console.log(`[${name}] ${ms}ms`);
}

function decodeQueryValue(value) {
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value.replace(/\+/g, ' ');
  }
}

async function getAuthClientWithLogs(options = {}) {
  const { includeToken = true } = options;
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

  if (includeToken) {
    const tokenStart = Date.now();
    await client.getAccessToken();
    logStep(tokenStart, 'TOKEN');
  }

  return client;
}

export default async function handler(req, res) {
  const { sheetId, sheetName, mode, sheetNames, status } = req.query;

  // BATCH MODE: Haetaan useat CSV-tiedostot yhdessä pyynnössä
  if (mode === 'batchCsv' && sheetNames) {
    res.setHeader('Content-Type', 'application/json');
    
    // Dynaaminen cache TTL: live-kisoille 20s, muille 60s
    const cacheTtl = status === 'kaynnissa' ? 20 : 60;
    res.setHeader('Cache-Control', `public, s-maxage=${cacheTtl}, stale-while-revalidate=60`);

    const batchStartTime = Date.now();
    console.log(`[BATCH START] ${new Date().toISOString()}`);

    try {
      const mapCacheKey = sheetId;

      // 1. VAIHE: Haetaan gid-kartta ja tiedoston nimi kerran kaikille välilehdille
      let cachedMeta = gidMapCache[mapCacheKey];
      let gidMap = cachedMeta?.gidMap;
      let spreadsheetTitle = cachedMeta?.spreadsheetTitle || "Tuntematon Google Sheet";
      const metaStartTime = Date.now();

      if (!gidMap) {
        console.log(`[BATCH META] Välimuisti tyhjä, haetaan...`);
        try {
          const client = await getAuthClientWithLogs({ includeToken: false });
          // Haetaan sekä työkirjan otsikko (properties/title) että välilehdet
          const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties(title),sheets(properties(title,sheetId))`;
          const metaRes = await client.request({ url: metaUrl });
          
          spreadsheetTitle = metaRes.data.properties?.title || "Nimetön kisa";
          const allSheets = metaRes.data.sheets || [];

          gidMap = {};
          for (const sheet of allSheets) {
            if (sheet.properties?.title) {
              gidMap[sheet.properties.title.trim().toLowerCase()] = String(sheet.properties.sheetId);
            }
          }

          // Tallennetaan molemmat tiedot välimuistiin
          gidMapCache[mapCacheKey] = { gidMap, spreadsheetTitle };
          const metaDuration = Date.now() - metaStartTime;
          console.log(`[BATCH META] Metadata: ${metaDuration}ms (uusi cache, ${Object.keys(gidMap).length} levyä)`);
        } catch (error) {
          console.error("[BATCH] Kriittinen virhe metadatan haussa:", error);
          throw error;
        }
      } else {
        const metaDuration = Date.now() - metaStartTime;
        console.log(`[BATCH META] Metadata: ${metaDuration}ms (välimuistista, ${Object.keys(gidMap).length} levyä)`);
      }

      // 2. VAIHE: Muutetaan pyydetyt nimet gideiksi
      const rawSheetNames = Array.isArray(sheetNames) ? sheetNames : [sheetNames];
      const sheetNamesArray = rawSheetNames.map((n) => decodeQueryValue(n));
      const batchCacheKey = `${sheetId}::${sheetNamesArray.map((n) => n.trim().toLowerCase()).sort().join('|')}`;

      const cachedBatch = batchCsvCache[batchCacheKey];
      if (cachedBatch && (Date.now() - cachedBatch.cachedAt) < BATCH_CACHE_TTL_MS) {
        const cacheAgeMs = Date.now() - cachedBatch.cachedAt;
        const cachedTiming = {
          ...(cachedBatch.payload.timing || {}),
          total_ms: Date.now() - batchStartTime,
          source: 'memory-cache-hit',
          cache_age_ms: cacheAgeMs,
          generated_at_ms: cachedBatch.cachedAt
        };

        res.setHeader('X-ScoringUI-Batch-Cache', 'memory-hit');
        res.setHeader('X-ScoringUI-Batch-Cache-Age-Ms', String(cacheAgeMs));
        res.setHeader('Cache-Control', `public, s-maxage=${cacheTtl}, stale-while-revalidate=10`);

        // Tulostetaan lokit myös välimuistiosumista, jotta näet mistä tiedostosta on kyse
        const totalBatchTime = Date.now() - batchStartTime;
        console.log(`\n--- TIEDOSTO: "${spreadsheetTitle}" (MUISTIVÄLIMUISTIOSUMA) ---`);
        console.log(`[BATCH CACHE] TTL: ${cacheTtl}s (status: ${status || 'unknown'})`);
        console.log(`[BATCH DONE] Yhteensä: ${totalBatchTime}ms (välimuistista, ikä: ${cacheAgeMs}ms)`);

        return res.status(200).json({
          ...cachedBatch.payload,
          timing: cachedTiming
        });
      }

      const gidRequests = [];
      const keyMap = {};
      const notFound = [];

      for (const requestedSheetName of sheetNamesArray) {
        const normalizedName = requestedSheetName.trim().toLowerCase();
        const gid = gidMap[normalizedName];
        if (gid !== undefined) {
          keyMap[gid] = requestedSheetName;
          const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

          gidRequests.push((async () => {
            const sivuStart = performance.now();
            try {
              const r = await fetch(exportUrl);
              if (!r.ok) throw new Error(`HTTP error ${r.status}`);
              const data = await r.text();
              const kesto = Math.round(performance.now() - sivuStart);

              return {
                gid,
                data,
                sheetName: requestedSheetName,
                latausaika_ms: kesto,
                koko_tavua: data.length
              };
            } catch (err) {
              const kesto = Math.round(performance.now() - sivuStart);
              return {
                gid,
                data: '',
                error: err.message,
                sheetName: requestedSheetName,
                latausaika_ms: kesto,
                koko_tavua: 0
              };
            }
          })());
        } else {
          notFound.push(requestedSheetName);
        }
      }

      // 3. VAIHE: Ladataan kaikki CSV:t rinnakkain ja koottu diagnostiikka
      const csvStartTime = Date.now();
      const results = await Promise.all(gidRequests);
      const csvDuration = Date.now() - csvStartTime;
      console.log(`[BATCH CSV] ${results.length} levyä rinnakkain: ${csvDuration}ms`);

      const csvByName = {};
      const sheetDiagnostics = {};

      for (const resObj of results) {
        const name = resObj.sheetName;
        csvByName[name] = resObj.data;

        // Tallennetaan diagnostiikka ja muotoillaan suomenkieliset kentät taulukkoon
        sheetDiagnostics[name] = {
          'Latausaika (ms)': resObj.latausaika_ms,
          'Koko (KB)': (resObj.koko_tavua / 1024).toFixed(2),
          'Virhe': resObj.error || 'Ei virheitä'
        };
      }

      const response = { csvByName, sheetDiagnostics };
      if (notFound.length > 0) {
        response.notFound = notFound;
        response.availableSheets = Object.keys(gidMap);
      }

      const metaDuration = csvStartTime - metaStartTime;
      const totalTime = Date.now() - batchStartTime;
      const generatedAtMs = Date.now();
      response.timing = {
        total_ms: totalTime,
        meta_ms: metaDuration,
        csv_ms: csvDuration,
        source: 'origin',
        cache_age_ms: 0,
        generated_at_ms: generatedAtMs
      };

      batchCsvCache[batchCacheKey] = {
        cachedAt: generatedAtMs,
        payload: response
      };

      res.setHeader('X-ScoringUI-Batch-Cache', 'origin');
      res.setHeader('X-ScoringUI-Batch-Cache-Age-Ms', '0');

      // TULOSTETAAN DIAGNOSTIIKKARAPORTTI KONSOLIIN
      console.log(`\n--- TIEDOSTO: "${spreadsheetTitle}" ---`);
      console.log(`[BATCH CACHE] TTL: ${cacheTtl}s (status: ${status || 'unknown'})`);
      console.table(sheetDiagnostics);
      console.log(`[BATCH DONE] Yhteensä: ${totalTime}ms (meta: ${metaDuration}ms + csv: ${csvDuration}ms)`);

      return res.status(200).json(response);
    } catch (error) {
      return res.status(500).json({
        error: 'Kisan datan haku epäonnistui',
        message: error.message
      });
    }
  }

  // SINGLE MODE: Haetaan yksi CSV
  if (!sheetId || !sheetName) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(400).json({ error: 'sheetId ja sheetName vaaditaan' });
  }

  const decodedSheetName = decodeQueryValue(sheetName);
  const cacheKey = `${sheetId}_${decodedSheetName.trim().toLowerCase()}`;

  try {
    let foundGid = null;

    if (gidCache[cacheKey]) {
      foundGid = gidCache[cacheKey];
    } else {
      const client = await getAuthClientWithLogs({ includeToken: false });
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title,sheetId))`;
      const metaRes = await client.request({ url: metaUrl });
      const sheets = metaRes.data.sheets || [];
      const tarjollaOlevat = sheets.map(s => s.properties.title);

      for (const sheet of sheets) {
        if (sheet.properties.title.trim().toLowerCase() === decodedSheetName.trim().toLowerCase()) {
          foundGid = sheet.properties.sheetId;
          break;
        }
      }

      if (foundGid === null) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({
          error: `Välilehteä '${decodedSheetName}' ei löytynyt taulukosta.`,
          availableSheets: tarjollaOlevat
        });
      }

      gidCache[cacheKey] = foundGid;
    }

    // 2. VAIHE: Ladataan itse data anonyyminä
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${foundGid}`;
    const exportStart = Date.now();

    const googleRes = await fetch(exportUrl);
    if (!googleRes.ok) throw new Error(`Google vastasi tilakoodilla ${googleRes.status}`);
    const csvData = await googleRes.text();

    logStep(exportStart, 'SINGLE CSV');
    res.setHeader('Content-Type', 'text/csv');
    return res.status(200).send(csvData);
  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: 'Kisan datan haku epäonnistui',
      message: error.message
    });
  }
}