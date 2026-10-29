// api/kisa.js
// Kisan välilehdet yhdellä pyynnöllä: { csvByName, notFound, timing }.
// Lähteet järjestyksessä: Vercelin CDN (otsikot kisan päivistä), palvelimen oma vastausvälimuisti,
// päättyneen kisan tallennettu kuva, Sheets API. Google-kiintiön (429) ylittyessä palautetaan vanha data, jos sellaista on.
// Tallennetun kuvan kirjoitus ja vanhentuneen kuvan päivitys tehdään vastauksen jälkeen (waitUntil).
import dotenv from 'dotenv';
dotenv.config();

import { waitUntil } from '@vercel/functions';

import { normalisoiSheetId, onSallittuSheetId } from './_lib/sheetAllowlist.js';
import { haeGoogleAsiakas, onKiintioVirhe, pyyntoUudelleenyrittaen } from './_lib/googleAuth.js';
import { haeValilehdetCsv, onRankingValilehti, onSallittuValilehti } from './_lib/sheetsData.js';
import { VANHA_KUVA_OTSIKKO, VARALLA_OTSIKKO, cdnOtsikko, kisanPaivaTila, onkoKuvaKaytettava, onkoKuvaTuore, vastausTuoreMs } from './_lib/kisaValimuisti.js';
import { datanVersio, kuvanPolku, lueKuva, onkoKuvatKaytossa, tallennaKuva } from './_lib/kisaKuva.js';
import { luoValimuisti, luoYhdistaja } from './_lib/valimuisti.js';
import { asetaValimuisti } from './_lib/cdnOtsikot.js';

const MAKS_VALILEHDET = 12;
// Näin vanhaa vastausta käytetään vielä, jos Google ei vastaa (esim. kiintiö täynnä).
const VARALLA_MAKS_IKA_MS = 24 * 60 * 60 * 1000;

const vastausValimuisti = luoValimuisti('vastaukset');
const yhdistaHaku = luoYhdistaja();

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

function lahetaData(req, res, { csvByName, notFound, cacheControl, timing }) {
  const versio = datanVersio(csvByName);
  const etag = `W/"${versio}"`;
  res.setHeader('Content-Type', 'application/json');
  asetaValimuisti(res, cacheControl);
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
      request: (opts) => pyyntoUudelleenyrittaen((o) => asiakas.request(o), opts),
      sheetId,
      nimet
    });
    return { ok: true, ...tulos, google_ms: Date.now() - alku };
  } catch (error) {
    return { ok: false, error, google_ms: Date.now() - alku };
  }
}

// Ajaa tehtävän vastauksen jälkeen Vercelin waitUntililla. Ilman Vercelin pyyntökontekstia
// (esim. `vercel dev` tai testit) waitUntil ei tee mitään, joten tehtävä odotetaan loppuun.
// Kontekstin tarkistus on sama, jota @vercel/functions käyttää sisäisesti.
const PYYNTOKONTEKSTI = Symbol.for('@vercel/request-context');

async function taustalla(lupaus) {
  const turvallinen = Promise.resolve(lupaus).catch((error) => console.error('[KISA] Taustatehtävä epäonnistui:', error?.message));
  if (typeof globalThis[PYYNTOKONTEKSTI]?.get?.()?.waitUntil === 'function') waitUntil(turvallinen);
  else await turvallinen;
}

// Palvelimen välimuisti kirjoitetaan ennen vastausta (paikallinen ja nopea); päättyneen kisan kuva (Blob) taustalla.
async function tallennaTulos(polku, google, paivaTila, kisa) {
  await vastausValimuisti.aseta(polku, { csvByName: google.csvByName, notFound: google.notFound, paivaTila, kisa });
  if (paivaTila !== 'paattynyt' || !onkoKuvatKaytossa()) return;
  await taustalla(tallennaKuva(polku, {
    versio: 1,
    tallennettu: Date.now(),
    paivaTila,
    alkuPvm: kisa?.alkuPvm || '',
    loppuPvm: kisa?.loppuPvm || '',
    csvByName: google.csvByName,
    notFound: google.notFound
  }));
}

// Vanhentuneen kuvan päivitys Googlesta vastauksen jälkeen.
async function paivitaKuva(googleLupaus, polku, paivaTila, kisa) {
  const google = await googleLupaus;
  if (!google.ok) {
    console.error('[KISA] Kuvan päivitys Googlesta epäonnistui:', google.error?.message);
    return;
  }
  await tallennaTulos(polku, google, paivaTila, kisa);
}

export default async function handler(req, res) {
  const alku = Date.now();
  const { sheetId } = req.query;
  const raakaNimet = req.query.sheetNames;
  let nimet = [...new Set((Array.isArray(raakaNimet) ? raakaNimet : [raakaNimet])
    .map(decodeQueryValue)
    .map((n) => n.trim())
    .filter(Boolean))];

  if (!sheetId || normalisoiSheetId(sheetId) !== sheetId) return lahetaVirhe(res, 400, { error: 'sheetId vaaditaan' });
  if (nimet.length === 0 || nimet.length > MAKS_VALILEHDET) {
    return lahetaVirhe(res, 400, { error: `sheetNames: 1–${MAKS_VALILEHDET} välilehteä` });
  }
  // Muita välilehtiä ei julkaista. Jos frontend pyytää vain niitä, pyyntö torjutaan; muuten ne jätetään pois.
  const eiSallitut = nimet.filter((n) => !onSallittuValilehti(n));
  if (eiSallitut.length === nimet.length) return lahetaVirhe(res, 400, { error: 'Välilehteä ei julkaista', sheetNames: eiSallitut });
  if (eiSallitut.length) {
    console.error('[KISA] Ohitetaan välilehdet, joita ei julkaista:', eiSallitut);
    nimet = nimet.filter(onSallittuValilehti);
  }

  const polku = kuvanPolku(sheetId, nimet);
  const tallessa = await vastausValimuisti.hae(polku);
  const tallessaIka = tallessa ? Date.now() - tallessa.tallennettu : Infinity;
  const tallessaTuore = Boolean(tallessa) && tallessaIka < vastausTuoreMs(tallessa.arvo.paivaTila, tallessa.arvo.kisa);

  // Kylmässä instanssissa rekisteri ei ole vielä muistissa: Google-haku aloitetaan heti sen rinnalla,
  // ja tulos heitetään pois, jos id ei ole rekisterissä. Lämpimässä instanssissa tarkistus on välitön.
  // Samanaikaiset samat haut yhdistetään yhdeksi Google-hauksi.
  const haeYhdistetysti = () => yhdistaHaku(polku, () => haeGooglesta(sheetId, nimet));
  const rekisteriValmis = onSallittuSheetId.onLadattu();
  const rekisteriRivi = rekisteriValmis ? onSallittuSheetId.kisa(sheetId) : null;
  const lueTallennettu = !tallessaTuore && onkoKuvatKaytossa()
    && (!rekisteriValmis || kisanPaivaTila(rekisteriRivi) === 'paattynyt');

  const googleLupaus = rekisteriValmis || tallessaTuore ? null : haeYhdistetysti();

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
  // Rankingin välilehti julkaistaan vain rekisterissä rankingiksi (H = RANKING) merkitystä taulukosta.
  if (!kisa?.ranking && nimet.some(onRankingValilehti)) {
    return lahetaVirhe(res, 400, { error: 'Välilehteä ei julkaista', sheetNames: nimet.filter(onRankingValilehti) });
  }
  const paivaTila = kisanPaivaTila(kisa);

  // Rekisterin päivät ovat voineet muuttua tallennuksen jälkeen: lyhyempi tuoreusaika ratkaisee.
  if (tallessaTuore && tallessaIka < vastausTuoreMs(paivaTila, kisa)) {
    return lahetaData(req, res, {
      csvByName: tallessa.arvo.csvByName,
      notFound: tallessa.arvo.notFound || [],
      cacheControl: cdnOtsikko(tallessa.arvo.paivaTila, tallessa.arvo.kisa, Date.now(), tallessaIka),
      timing: { total_ms: Date.now() - alku, source: 'server-cache', cache_age_ms: tallessaIka, generated_at_ms: tallessa.tallennettu }
    });
  }

  // Päättyneen kisan kuva annetaan heti. Jos se ei ole enää tuore, uusi haetaan Googlesta taustalla,
  // ja CDN pitää vanhaa vastausta tuoreena vain hetken, jotta päivitetty data tulee pian näkyviin.
  // Korjausajan raja lasketaan rekisterin nykyisistä päivistä, ei kuvaan tallennetuista.
  const kuvaNyt = kuva && { ...kuva, alkuPvm: kisa?.alkuPvm || '', loppuPvm: kisa?.loppuPvm || '' };
  if (paivaTila === 'paattynyt' && onkoKuvaKaytettava(kuvaNyt)) {
    const tuore = onkoKuvaTuore(kuvaNyt);
    if (!tuore) await taustalla(paivitaKuva(googleLupaus || haeYhdistetysti(), polku, paivaTila, kisa));
    return lahetaData(req, res, {
      csvByName: kuva.csvByName,
      notFound: kuva.notFound || [],
      cacheControl: tuore ? cdnOtsikko(paivaTila, kisa) : VANHA_KUVA_OTSIKKO,
      timing: { total_ms: Date.now() - alku, source: tuore ? 'snapshot' : 'snapshot-stale', generated_at_ms: kuva.tallennettu }
    });
  }

  const google = await (googleLupaus || haeYhdistetysti());

  if (!google.ok) {
    const kiintio = onKiintioVirhe(google.error);
    console.error(`[KISA] Google-haku epäonnistui${kiintio ? ' (kiintiö täynnä)' : ''}:`, google.error?.message);
    // Google ei vastannut: vanhakin data on parempi kuin virhe.
    // Varalle valitaan uudempi: tallennettu kuva tai palvelimen välimuistissa oleva vastaus.
    const vaihtoehdot = [
      kuva?.csvByName && { csvByName: kuva.csvByName, notFound: kuva.notFound, tallennettu: kuva.tallennettu, source: 'snapshot-fallback' },
      tallessa && tallessaIka < VARALLA_MAKS_IKA_MS && { ...tallessa.arvo, tallennettu: tallessa.tallennettu, source: 'server-cache-fallback' }
    ].filter(Boolean);
    const varalla = vaihtoehdot.sort((a, b) => (b.tallennettu || 0) - (a.tallennettu || 0))[0] || null;
    if (varalla) {
      return lahetaData(req, res, {
        csvByName: varalla.csvByName,
        notFound: varalla.notFound || [],
        cacheControl: VARALLA_OTSIKKO,
        timing: { total_ms: Date.now() - alku, source: varalla.source, generated_at_ms: varalla.tallennettu }
      });
    }
    if (kiintio) {
      res.setHeader('Retry-After', '15');
      return lahetaVirhe(res, 503, { error: 'Googlen lukukiintiö on hetkellisesti täynnä, yritä hetken päästä uudelleen' });
    }
    return lahetaVirhe(res, 502, { error: 'Kisan datan haku epäonnistui', message: google.error?.message });
  }

  await tallennaTulos(polku, google, paivaTila, kisa);

  const total = Date.now() - alku;
  console.log(`[KISA] ${sheetId} ${paivaTila} google ${google.google_ms} ms, yhteensä ${total} ms`);
  return lahetaData(req, res, {
    csvByName: google.csvByName,
    notFound: google.notFound,
    cacheControl: cdnOtsikko(paivaTila, kisa),
    timing: { total_ms: total, google_ms: google.google_ms, source: 'google', generated_at_ms: Date.now() }
  });
}
