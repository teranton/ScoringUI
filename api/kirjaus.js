// api/kirjaus.js
// Mobiilikirjaus (Compak-ratalaite): GET ?toiminto=avaa antaa radan ampujajonon ja tallennetut kortit,
// POST ?toiminto=tallenna kirjoittaa kortit kisan MOBIILI Rata N -välilehdelle ja lokin MOBIILI_LOKI-välilehdelle.
// Pääsy ratakoodilla (Authorization: Bearer <koodi>, api/_lib/kirjausAvain.js). Kirjoittaa erillisellä
// kirjuripalvelutilillä, joka on jaettu muokkaajaksi vain kisoihin, joissa mobiilikirjaus on käytössä.
// Ei välimuistia: jokainen pyyntö menee Googleen.
import dotenv from 'dotenv';
dotenv.config();

import { torjuEiSallittuSheetId } from './_lib/sheetAllowlist.js';
import { haeKirjuriAsiakas, onKiintioVirhe, onKirjuriMaaritetty, pyyntoUudelleenyrittaen } from './_lib/googleAuth.js';
import { kohdistaValilehdet, valilehtiAlue } from './_lib/sheetsData.js';
import { tarkistaAvain } from './_lib/kirjausAvain.js';
import {
  AIKATAULU_VALILEHDET, KOHTEITA, KORTTI_OTSIKKO, LOKI_OTSIKKO, LOKI_VALILEHTI, MAKS_NRO, VIIMEINEN_SARAKE,
  aikaleima, korttiRivi, lueKorttiRivi, mobiiliValilehti, radanJono, speksiArvo, tarkistaTallennus
} from './_lib/kirjausData.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

function laheta(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

const googleStatus = (error) => Number(error?.response?.status || error?.status || error?.code);

function lahetaGoogleVirhe(res, error) {
  const status = googleStatus(error);
  if (status === 403 || status === 404) {
    return laheta(res, 403, { error: 'Mobiilikirjaus ei ole käytössä tässä kisassa (taulukkoa ei ole jaettu kirjaajalle)' });
  }
  if (onKiintioVirhe(error)) return laheta(res, 503, { error: 'Palvelu on ruuhkautunut, yritä hetken päästä' });
  console.error('[KIRJAUS] Google-virhe:', error?.message);
  return laheta(res, 502, { error: 'Taulukkoa ei saatu luettua' });
}

function bearer(req) {
  const otsikko = String(req.headers?.authorization || '');
  return otsikko.toLowerCase().startsWith('bearer ') ? otsikko.slice(7).trim() : '';
}

async function metatiedot(request, sheetId) {
  const res = await request({ url: `${SHEETS}/${sheetId}?fields=properties(title),sheets(properties(title))` });
  return {
    otsikko: res.data.properties?.title || '',
    valilehdet: (res.data.sheets || []).map((s) => s.properties?.title).filter(Boolean)
  };
}

async function batchGet(request, sheetId, alueet) {
  if (alueet.length === 0) return [];
  const params = new URLSearchParams();
  alueet.forEach((alue) => params.append('ranges', alue));
  params.append('valueRenderOption', 'FORMATTED_VALUE');
  const res = await request({ url: `${SHEETS}/${sheetId}/values:batchGet?${params.toString()}` });
  return (res.data.valueRanges || []).map((v) => v.values || []);
}

// Aikataulut ja KISANSPEKSIT, joista radan jono ja nimi luetaan.
function aikatauluKohteet(valilehdet) {
  return kohdistaValilehdet([...AIKATAULU_VALILEHDET, 'KISANSPEKSIT'], valilehdet).loydetyt;
}

function radanTiedot(kohteet, arvot, sarake) {
  const speksit = arvot[kohteet.findIndex((k) => k.pyydetty === 'KISANSPEKSIT')] || [];
  const aikataulut = kohteet
    .map((k, i) => ({ nimi: k.todellinen, rivit: arvot[i], pyydetty: k.pyydetty }))
    .filter((k) => k.pyydetty !== 'KISANSPEKSIT');
  const ratojaPaivassa = Number.parseInt(speksiArvo(speksit, 'LAYOUT/PÄIVÄ'), 10) || 0;
  return {
    rataNimi: speksiArvo(speksit, `RATA${sarake}_NIMI`),
    ...radanJono({ aikataulut, sarake, ratojaPaivassa })
  };
}

async function avaa(request, { sheetId, sarake, voimassaAsti }, res) {
  const { otsikko, valilehdet } = await metatiedot(request, sheetId);
  const kohteet = aikatauluKohteet(valilehdet);
  const mobiili = kohdistaValilehdet([mobiiliValilehti(sarake)], valilehdet).loydetyt[0];
  const alueet = [
    ...kohteet.map((k) => valilehtiAlue(k.todellinen)),
    ...(mobiili ? [`${valilehtiAlue(mobiili.todellinen)}!A2:${VIIMEINEN_SARAKE}${MAKS_NRO + 1}`] : [])
  ];
  const arvot = await batchGet(request, sheetId, alueet);
  const tiedot = radanTiedot(kohteet, arvot, sarake);
  const kortit = mobiili
    ? (arvot[kohteet.length] || []).map(lueKorttiRivi).filter((k) => k && k.versio > 0)
    : [];

  return laheta(res, 200, {
    kisa: otsikko,
    sarake,
    rataNimi: tiedot.rataNimi,
    aikataulu: tiedot.aikataulu,
    kaista: tiedot.kaista,
    kohteita: KOHTEITA,
    jono: tiedot.jono,
    nimet: tiedot.nimet,
    kortit: kortit.map(({ nro, merkit, versio }) => ({ nro, merkit, versio })),
    voimassaAsti
  });
}

const onJoOlemassa = (error) => googleStatus(error) === 400 && /already exists/i.test(JSON.stringify(error?.response?.data || error?.message || ''));

// Luo puuttuvat MOBIILI-välilehdet otsikkoriveineen. Kaksi laitetta voi yrittää samaan aikaan: jo luotu kelpaa.
async function varmistaValilehdet(request, sheetId, valilehdet, sarake) {
  const tarvittavat = [
    { nimi: mobiiliValilehti(sarake), otsikko: KORTTI_OTSIKKO, rivit: MAKS_NRO + 1 },
    { nimi: LOKI_VALILEHTI, otsikko: LOKI_OTSIKKO, rivit: 1000 }
  ];
  const { puuttuvat } = kohdistaValilehdet(tarvittavat.map((t) => t.nimi), valilehdet);
  for (const nimi of puuttuvat) {
    const t = tarvittavat.find((x) => x.nimi === nimi);
    try {
      await request({
        url: `${SHEETS}/${sheetId}:batchUpdate`,
        method: 'POST',
        data: { requests: [{ addSheet: { properties: {
          title: nimi,
          gridProperties: { rowCount: t.rivit, columnCount: t.otsikko.length, frozenRowCount: 1 }
        } } }] }
      });
      await request({
        url: `${SHEETS}/${sheetId}/values/${encodeURIComponent(`${valilehtiAlue(nimi)}!A1`)}?valueInputOption=RAW`,
        method: 'PUT',
        data: { values: [t.otsikko] }
      });
    } catch (error) {
      if (!onJoOlemassa(error)) throw error;
    }
  }
  return valilehdet.concat(puuttuvat);
}

async function tallenna(request, { sheetId, sarake }, req, res) {
  let runko = req.body;
  if (typeof runko === 'string') {
    try { runko = JSON.parse(runko); } catch { runko = null; }
  }
  const tarkistettu = tarkistaTallennus(runko);
  if (tarkistettu.virhe) return laheta(res, 400, { error: tarkistettu.virhe });
  const { laite, kortit } = tarkistettu;

  const { valilehdet: alussa } = await metatiedot(request, sheetId);
  const valilehdet = await varmistaValilehdet(request, sheetId, alussa, sarake);
  const tab = kohdistaValilehdet([mobiiliValilehti(sarake)], valilehdet).loydetyt[0].todellinen;
  const loki = kohdistaValilehdet([LOKI_VALILEHTI], valilehdet).loydetyt[0].todellinen;
  const korttiAlue = (nro) => `${valilehtiAlue(tab)}!A${nro + 1}:${VIIMEINEN_SARAKE}${nro + 1}`;

  const kohteet = aikatauluKohteet(valilehdet);
  const arvot = await batchGet(request, sheetId, [
    ...kohteet.map((k) => valilehtiAlue(k.todellinen)),
    ...kortit.map((k) => korttiAlue(k.nro))
  ]);
  const { nimet } = radanTiedot(kohteet, arvot, sarake);

  const aika = aikaleima();
  const tallennetut = [];
  const uudemmat = [];
  const kirjoitukset = [];
  const lokirivit = [];
  kortit.forEach((kortti, i) => {
    const tallessa = lueKorttiRivi((arvot[kohteet.length + i] || [])[0]);
    if (tallessa && tallessa.versio >= kortti.versio) {
      // Sama versio on jo tallessa (uudelleenlähetys) tai taulukossa on uudempi: ei kirjoiteta.
      if (tallessa.versio === kortti.versio && tallessa.merkit === kortti.merkit) tallennetut.push(kortti.nro);
      else uudemmat.push({ nro: kortti.nro, merkit: tallessa.merkit, versio: tallessa.versio });
      return;
    }
    kirjoitukset.push({
      range: korttiAlue(kortti.nro),
      values: [korttiRivi({ ...kortti, nimi: nimet[kortti.nro], laite, aika })]
    });
    lokirivit.push([aika, sarake, kortti.nro, laite, kortti.versio, tallessa?.merkit || '', kortti.merkit]);
    tallennetut.push(kortti.nro);
  });

  if (kirjoitukset.length > 0) {
    await request({
      url: `${SHEETS}/${sheetId}/values:batchUpdate`,
      method: 'POST',
      data: { valueInputOption: 'RAW', data: kirjoitukset }
    });
    await request({
      url: `${SHEETS}/${sheetId}/values/${encodeURIComponent(`${valilehtiAlue(loki)}!A:G`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      method: 'POST',
      data: { values: lokirivit }
    });
  }
  return laheta(res, 200, { tallennetut, uudemmat });
}

export default async function handler(req, res) {
  const toiminto = String(req.query?.toiminto || '');
  if (toiminto === 'avaa' && req.method !== 'GET') return laheta(res, 405, { error: 'Käytä GET-pyyntöä' });
  if (toiminto === 'tallenna' && req.method !== 'POST') return laheta(res, 405, { error: 'Käytä POST-pyyntöä' });
  if (toiminto !== 'avaa' && toiminto !== 'tallenna') return laheta(res, 400, { error: 'Tuntematon toiminto' });

  const avain = tarkistaAvain(bearer(req), process.env.KIRJAUS_SALAISUUS);
  if (avain.virhe) return laheta(res, 401, { error: avain.virhe });
  if (!onKirjuriMaaritetty()) return laheta(res, 503, { error: 'Mobiilikirjausta ei ole otettu käyttöön palvelimella' });
  if (await torjuEiSallittuSheetId(avain.sheetId, res)) return;

  try {
    const asiakas = await haeKirjuriAsiakas();
    const request = (opts) => pyyntoUudelleenyrittaen((o) => asiakas.request(o), opts);
    if (toiminto === 'avaa') return await avaa(request, avain, res);
    return await tallenna(request, avain, req, res);
  } catch (error) {
    return lahetaGoogleVirhe(res, error);
  }
}
