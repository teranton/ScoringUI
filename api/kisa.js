// api/kisa.js
// Kisan välilehdet yhdellä pyynnöllä: { csvByName, notFound, timing }.
// Lähteet järjestyksessä: Vercelin CDN (otsikot kisan päivistä), päättyneen kisan tallennettu kuva, Sheets API.
import dotenv from 'dotenv';
dotenv.config();

import { normalisoiSheetId, onSallittuSheetId } from './_lib/sheetAllowlist.js';
import { haeGoogleAsiakas } from './_lib/googleAuth.js';
import { haeValilehdetCsv } from './_lib/sheetsData.js';
import { cdnOtsikko, kisanPaivaTila, onkoKuvaTuore } from './_lib/kisaValimuisti.js';
import { datanVersio, kuvanPolku, lueKuva, onkoKuvatKaytossa, tallennaKuva } from './_lib/kisaKuva.js';

const MAKS_VALILEHDET = 12;

function decodeQueryValue(value) {
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value.replace(/\+/g, ' ');
  }
}

function lahetaVirhe(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function lahetaData(req, res, { csvByName, notFound, paivaTila, kisa, timing }) {
  const versio = datanVersio(csvByName);
  const etag = `W/"${versio}"`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cdnOtsikko(paivaTila, kisa));
  res.setHeader('ETag', etag);
  res.setHeader('X-ScoringUI-Lahde', timing.source);
  if (req.headers?.['if-none-match'] === etag) return res.status(304).end();
  return res.status(200).json({ csvByName, notFound: notFound.length ? notFound : undefined, versio, timing });
}

async function haeGooglesta(sheetId, nimet) {
  const alku = Date.now();
  try {
    const asiakas = await haeGoogleAsiakas();
    const tulos = await haeValilehdetCsv({
      request: (opts) => asiakas.request(opts),
      sheetId,
      nimet
    });
    return { ok: true, ...tulos, google_ms: Date.now() - alku };
  } catch (error) {
    return { ok: false, error, google_ms: Date.now() - alku };
  }
}

export default async function handler(req, res) {
  const alku = Date.now();
  const { sheetId } = req.query;
  const raakaNimet = req.query.sheetNames;
  const nimet = [...new Set((Array.isArray(raakaNimet) ? raakaNimet : [raakaNimet])
    .map(decodeQueryValue)
    .map((n) => n.trim())
    .filter(Boolean))];

  if (!sheetId || normalisoiSheetId(sheetId) !== sheetId) return lahetaVirhe(res, 400, { error: 'sheetId vaaditaan' });
  if (nimet.length === 0 || nimet.length > MAKS_VALILEHDET) {
    return lahetaVirhe(res, 400, { error: `sheetNames: 1–${MAKS_VALILEHDET} välilehteä` });
  }

  // Kylmässä instanssissa rekisteri ei ole vielä muistissa: Google-haku aloitetaan heti sen rinnalla,
  // ja tulos heitetään pois, jos id ei ole rekisterissä. Lämpimässä instanssissa tarkistus on välitön.
  const rekisteriValmis = onSallittuSheetId.onLadattu();
  const rekisteriRivi = rekisteriValmis ? onSallittuSheetId.kisa(sheetId) : null;
  const polku = kuvanPolku(sheetId, nimet);
  const lueTallennettu = onkoKuvatKaytossa() && (!rekisteriValmis || kisanPaivaTila(rekisteriRivi) === 'paattynyt');

  const googleLupaus = rekisteriValmis ? null : haeGooglesta(sheetId, nimet);

  let sallittu;
  let kuva;
  try {
    [sallittu, kuva] = await Promise.all([
      onSallittuSheetId(sheetId),
      lueTallennettu ? lueKuva(polku) : null
    ]);
  } catch (error) {
    console.error('[ALLOWLIST] Kilpailurekisterin haku epäonnistui:', error);
    return lahetaVirhe(res, 503, { error: 'Kilpailurekisteriä ei saatu tarkistettua' });
  }
  if (!sallittu) return lahetaVirhe(res, 403, { error: 'Taulukko ei ole kilpailurekisterissä' });

  const kisa = onSallittuSheetId.kisa(sheetId);
  const paivaTila = kisanPaivaTila(kisa);

  if (onkoKuvaTuore(kuva) && paivaTila === 'paattynyt') {
    return lahetaData(req, res, {
      csvByName: kuva.csvByName,
      notFound: kuva.notFound || [],
      paivaTila,
      kisa,
      timing: { total_ms: Date.now() - alku, source: 'snapshot', generated_at_ms: kuva.tallennettu }
    });
  }

  const google = await (googleLupaus || haeGooglesta(sheetId, nimet));

  if (!google.ok) {
    console.error('[KISA] Google-haku epäonnistui:', google.error?.message);
    if (kuva?.csvByName) {
      // Google ei vastannut: vanhakin tallennettu kuva on parempi kuin virhe.
      return lahetaData(req, res, {
        csvByName: kuva.csvByName,
        notFound: kuva.notFound || [],
        paivaTila: 'tulossa',
        timing: { total_ms: Date.now() - alku, source: 'snapshot-fallback', generated_at_ms: kuva.tallennettu }
      });
    }
    return lahetaVirhe(res, 502, { error: 'Kisan datan haku epäonnistui', message: google.error?.message });
  }

  if (paivaTila === 'paattynyt' && onkoKuvatKaytossa()) {
    await tallennaKuva(polku, {
      versio: 1,
      tallennettu: Date.now(),
      paivaTila,
      alkuPvm: kisa?.alkuPvm || '',
      loppuPvm: kisa?.loppuPvm || '',
      csvByName: google.csvByName,
      notFound: google.notFound
    });
  }

  const total = Date.now() - alku;
  console.log(`[KISA] ${sheetId} ${paivaTila} google ${google.google_ms} ms, yhteensä ${total} ms`);
  return lahetaData(req, res, {
    csvByName: google.csvByName,
    notFound: google.notFound,
    paivaTila,
    kisa,
    timing: { total_ms: total, google_ms: google.google_ms, source: 'google', generated_at_ms: Date.now() }
  });
}
