// api/kisaData.js
import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';

// TÄMÄ ON VÄLIMUISTI: Se säilyy Vercelin palvelimen muistissa pyyntöjen välillä
const gidCache = {};
const gidMapCache = {}; // Välimuisti koko sheet-nimestä → gidiin mappingille
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
  const { sheetId, sheetName, mode, sheetNames } = req.query;

  // BATCH MODE: Haetaan useat CSV-tiedostot yhdessä pyynnössä
  if (mode === 'batchCsv' && sheetNames) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45, public');

    const batchStartTime = Date.now();
    console.log(`[BATCH START] ${new Date().toISOString()}`);

    try {
      const mapCacheKey = sheetId;

      // 1. VAIHE: Haetaan gid-kartta kerran kaikille välilehdille
      let gidMap = gidMapCache[mapCacheKey];
      let allSheets = [];
      const metaStartTime = Date.now();

      if (!gidMap) {
        try {
          const client = await getAuthClientWithLogs({ includeToken: false });
          const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title,sheetId))`;
          const metaRes = await client.request({ url: metaUrl });
          allSheets = metaRes.data.sheets || [];

          gidMap = {};
          for (const sheet of allSheets) {
            if (sheet.properties?.title) {
              gidMap[sheet.properties.title.trim().toLowerCase()] = String(sheet.properties.sheetId);
            }
          }

          gidMapCache[mapCacheKey] = gidMap;
          console.log(`[BATCH] Optimoitu API-metadata haettu: ${Date.now() - metaStartTime}ms (uusi cache)`);
        } catch (error) {
          console.error("[BATCH] Kriittinen virhe metadatan haussa:", error);
          throw error;
        }
      } else {
        console.log('[BATCH] Metadata cache osuma');
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
          
          // MUUTOS: Ladataan anonyyminä ilman client.request -metodia.
          // Tämä sallii Googlen hyödyntää CDN-välimuistiaan ja poistaa 'Waiting' (TTFB) viiveen.
          gidRequests.push(
            fetch(exportUrl)
              .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP error ${r.status}`);
                const data = await r.text();
                return { gid, data, sheetName: requestedSheetName };
              })
              .catch(err => ({ gid, data: '', error: err.message, sheetName: requestedSheetName }))
          );
        } else {
          notFound.push(requestedSheetName);
        }
      }

      // 3. VAIHE: Ladataan kaikki CSV:t rinnakkain ja palautetaan JSON-objektina
      const csvStartTime = Date.now();
      const results = await Promise.all(gidRequests);
      const csvDuration = Date.now() - csvStartTime;
      console.log(`[BATCH] CSV:t haettu: ${csvDuration}ms (${results.length} levyä rinnakkain)`);

      const csvByName = {};
      for (const { gid, data } of results) {
        const name = keyMap[gid];
        csvByName[name] = data;
      }

      const response = { csvByName };
      if (notFound.length > 0) {
        response.notFound = notFound;
        response.availableSheets = Object.keys(gidMap);
      }

      const totalTime = Date.now() - batchStartTime;
      const generatedAtMs = Date.now();
      response.timing = {
        total_ms: totalTime,
        meta_ms: metaStartTime ? (csvStartTime - metaStartTime) : 0,
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

    // MUUTOS: Ei käytetä client.requestia tässäkään, jotta CDN nopeuttaa latauksen
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