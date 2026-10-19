// api/kirjaus.js
// Mobiilikirjaus (Compak-ratalaite): GET ?toiminto=avaa antaa radan ampujajonon ja tallennetut kortit,
// POST ?toiminto=tallenna kirjoittaa kortit kisan MOBIILI Rata N -välilehdelle ja lokin MOBIILI_LOKI-välilehdelle.
// Pääsy ratakoodilla (Authorization: Bearer <koodi>, api/_lib/kirjausAvain.js). Kirjoittaa erillisellä
// kirjuripalvelutilillä, joka on jaettu muokkaajaksi vain kisoihin, joissa mobiilikirjaus on käytössä.
// Google-kiintiö on 60 lukua ja 60 kirjoitusta minuutissa per tili, joten tallennus tekee yhden luvun
// (korttirivit) ja yhden kirjoituksen (kortit ja lokirivit samassa batchUpdate-kutsussa, eli joko molemmat tai ei kumpaakaan);
// välilehtien tunnukset pidetään muistissa.
import dotenv from 'dotenv';
dotenv.config();

import { torjuEiSallittuSheetId } from './_lib/sheetAllowlist.js';
import { haeKirjuriAsiakas, onKiintioVirhe, onKirjuriMaaritetty, pyyntoUudelleenyrittaen } from './_lib/googleAuth.js';
import { kohdistaValilehdet, valilehtiAlue } from './_lib/sheetsData.js';
import { tarkistaAvain } from './_lib/kirjausAvain.js';
import {
  AIKATAULU_VALILEHDET, KOHTEITA, KORTTI_OTSIKKO, LOKI_OTSIKKO, LOKI_VALILEHTI, MAKS_NRO, VIIMEINEN_SARAKE,
  aikaleima, korttiRivi, lueKorttiRivi, mobiiliValilehti, onLaitetunnus, radanJono, solu, speksiArvo, tarkistaTallennus,
  viimeisinMuuLaite
} from './_lib/kirjausData.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const META_TTL_MS = 5 * 60 * 1000;
const metaMuisti = new Map();

function laheta(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

const googleStatus = (error) => Number(error?.response?.status || error?.status || error?.code);
const googleViesti = (error) => JSON.stringify(error?.response?.data || error?.message || '');

function lahetaGoogleVirhe(res, error, vaihe) {
  const status = googleStatus(error);
  if (onKiintioVirhe(error)) return laheta(res, 503, { error: 'Palvelu on ruuhkautunut, yritä hetken päästä' });
  if (vaihe === 'meta' && (status === 403 || status === 404)) {
    return laheta(res, 403, { error: 'Mobiilikirjaus ei ole käytössä tässä kisassa (taulukkoa ei ole jaettu kirjaajalle)' });
  }
  if (status === 403) return laheta(res, 403, { error: 'Taulukko esti kirjoituksen (suojattu alue tai kirjaajalla ei ole muokkausoikeutta)' });
  console.error('[KIRJAUS] Google-virhe:', status, googleViesti(error).slice(0, 500));
  return laheta(res, 502, { error: 'Taulukkoa ei saatu luettua tai kirjoitettua' });
}

function bearer(req) {
  const otsikko = String(req.headers?.authorization || '');
  return otsikko.toLowerCase().startsWith('bearer ') ? otsikko.slice(7).trim() : '';
}

// Taulukon nimi ja välilehdet [{ nimi, id }], muistissa META_TTL_MS (välilehtiä vain lisätään).
async function metatiedot(request, sheetId, { tuore = false } = {}) {
  const muistissa = metaMuisti.get(sheetId);
  if (!tuore && muistissa && Date.now() - muistissa.aika < META_TTL_MS) return muistissa.arvo;
  let res;
  try {
    res = await request({ url: `${SHEETS}/${sheetId}?fields=properties(title),sheets(properties(title,sheetId))` });
  } catch (error) {
    error.kirjausVaihe = 'meta';
    throw error;
  }
  const arvo = {
    otsikko: res.data.properties?.title || '',
    valilehdet: (res.data.sheets || []).map((s) => ({ nimi: s.properties?.title, id: s.properties?.sheetId })).filter((v) => v.nimi)
  };
  metaMuisti.set(sheetId, { arvo, aika: Date.now() });
  return arvo;
}

function etsiValilehti(meta, nimi) {
  const osuma = kohdistaValilehdet([nimi], meta.valilehdet.map((v) => v.nimi)).loydetyt[0];
  return osuma ? meta.valilehdet.find((v) => v.nimi === osuma.todellinen) : null;
}

async function batchGet(request, sheetId, alueet, valueRenderOption) {
  if (alueet.length === 0) return [];
  const params = new URLSearchParams();
  alueet.forEach((alue) => params.append('ranges', alue));
  params.append('valueRenderOption', valueRenderOption);
  const res = await request({ url: `${SHEETS}/${sheetId}/values:batchGet?${params.toString()}` });
  return (res.data.valueRanges || []).map((v) => v.values || []);
}

const batchUpdate = (request, sheetId, requests) => request({
  url: `${SHEETS}/${sheetId}:batchUpdate`,
  method: 'POST',
  data: { requests }
});

const riviSoluiksi = (rivi) => ({ values: rivi.map(solu) });

async function avaa(request, { sheetId, sarake, voimassaAsti }, laite, res) {
  const meta = await metatiedot(request, sheetId);
  const nimet = meta.valilehdet.map((v) => v.nimi);
  const kohteet = kohdistaValilehdet([...AIKATAULU_VALILEHDET, 'KISANSPEKSIT'], nimet).loydetyt;
  const mobiili = etsiValilehti(meta, mobiiliValilehti(sarake));

  const [arvot, korttiRivit] = await Promise.all([
    batchGet(request, sheetId, kohteet.map((k) => valilehtiAlue(k.todellinen)), 'FORMATTED_VALUE'),
    // Korttirivit muotoilemattomina: 13-numeroinen VERSIO ei saa tulla tieteellisenä merkintänä.
    mobiili
      ? batchGet(request, sheetId, [`${valilehtiAlue(mobiili.nimi)}!A2:${VIIMEINEN_SARAKE}${MAKS_NRO + 1}`], 'UNFORMATTED_VALUE')
      : Promise.resolve([[]])
  ]);

  const speksit = arvot[kohteet.findIndex((k) => k.pyydetty === 'KISANSPEKSIT')] || [];
  const aikataulut = kohteet
    .map((k, i) => ({ nimi: k.todellinen, rivit: arvot[i], pyydetty: k.pyydetty }))
    .filter((k) => k.pyydetty !== 'KISANSPEKSIT');
  const ratojaPaivassa = Number.parseInt(speksiArvo(speksit, 'LAYOUT/PÄIVÄ'), 10) || 0;
  const tiedot = radanJono({ aikataulut, sarake, ratojaPaivassa });
  const kortit = (korttiRivit[0] || []).map(lueKorttiRivi).filter((k) => k && k.versio > 0);

  return laheta(res, 200, {
    kisa: meta.otsikko,
    sarake,
    rataNimi: speksiArvo(speksit, `RATA${sarake}_NIMI`),
    // Radan ammuntaohjelma, sama kaikilla asemilla: SSSD, SDD tai SSSSS (laite jäsentää; puuttuessa asetetaan laitteella).
    ohjelma: speksiArvo(speksit, `RATA${sarake}_OHJELMA`),
    aikataulu: tiedot.aikataulu,
    kaista: tiedot.kaista,
    kohteita: KOHTEITA,
    jono: tiedot.jono,
    nimet: tiedot.nimet,
    kortit: kortit.map(({ nro, merkit, versio }) => ({ nro, merkit, versio })),
    // Toinen laite on tallentanut radalle viimeksi: laite varoittaa ennen käyttöönottoa (yksi laite per rata).
    muuLaite: viimeisinMuuLaite(kortit, laite),
    voimassaAsti
  });
}

const onJoOlemassa = (error) => googleStatus(error) === 400 && /already exists/i.test(googleViesti(error));
const onPuuttuvaValilehti = (error) => googleStatus(error) === 400 && /grid|sheet/i.test(googleViesti(error));
const uusiId = () => 100000000 + Math.floor(Math.random() * 1900000000);

// Luo puuttuvat MOBIILI-välilehdet otsikkoriveineen yhdellä kutsulla (välilehti ja otsikko syntyvät yhdessä).
// Kaksi laitetta voi yrittää samaan aikaan: silloin toinen saa "already exists" ja lukee välilehdet uudelleen.
async function varmistaValilehdet(request, sheetId, sarake) {
  let meta = await metatiedot(request, sheetId);
  const tarvittavat = [
    { nimi: mobiiliValilehti(sarake), otsikko: KORTTI_OTSIKKO, rivit: MAKS_NRO + 1 },
    { nimi: LOKI_VALILEHTI, otsikko: LOKI_OTSIKKO, rivit: 1000 }
  ].filter((t) => !etsiValilehti(meta, t.nimi));
  if (tarvittavat.length > 0) {
    // Yksi välilehti kerrallaan: jos toinen laite ehti luoda toisen (esim. yhteisen lokin), tämä ei kaada omaa.
    for (const t of tarvittavat) {
      const id = uusiId();
      try {
        await batchUpdate(request, sheetId, [
          { addSheet: { properties: { sheetId: id, title: t.nimi, gridProperties: { rowCount: t.rivit, columnCount: t.otsikko.length, frozenRowCount: 1 } } } },
          { updateCells: { start: { sheetId: id, rowIndex: 0, columnIndex: 0 }, rows: [riviSoluiksi(t.otsikko)], fields: 'userEnteredValue' } }
        ]);
      } catch (error) {
        if (!onJoOlemassa(error)) throw error;
      }
    }
    meta = await metatiedot(request, sheetId, { tuore: true });
  }
  return { kortit: etsiValilehti(meta, mobiiliValilehti(sarake)), loki: etsiValilehti(meta, LOKI_VALILEHTI) };
}

async function tallennaKerran(request, { sheetId, sarake }, { laite, kortit }) {
  const tabit = await varmistaValilehdet(request, sheetId, sarake);
  const korttiAlue = (nro) => `${valilehtiAlue(tabit.kortit.nimi)}!A${nro + 1}:${VIIMEINEN_SARAKE}${nro + 1}`;
  const tallessa = await batchGet(request, sheetId, kortit.map((k) => korttiAlue(k.nro)), 'UNFORMATTED_VALUE');

  const aika = aikaleima();
  const tallennetut = [];
  const uudemmat = [];
  const requests = [];
  const lokirivit = [];
  kortit.forEach((kortti, i) => {
    const vanha = lueKorttiRivi((tallessa[i] || [])[0]);
    if (vanha && vanha.versio >= kortti.versio) {
      // Sama versio on jo tallessa (uudelleenlähetys) tai taulukossa on uudempi: ei kirjoiteta.
      if (vanha.versio === kortti.versio && vanha.merkit === kortti.merkit) tallennetut.push(kortti.nro);
      else uudemmat.push({ nro: kortti.nro, merkit: vanha.merkit, versio: vanha.versio, laite: vanha.laite, aika: vanha.aika });
      return;
    }
    requests.push({ updateCells: {
      start: { sheetId: tabit.kortit.id, rowIndex: kortti.nro, columnIndex: 0 },
      rows: [riviSoluiksi(korttiRivi({ ...kortti, laite, aika }))],
      fields: 'userEnteredValue'
    } });
    lokirivit.push([aika, sarake, kortti.nro, laite, kortti.versio, vanha?.merkit || '', kortti.merkit]);
    tallennetut.push(kortti.nro);
  });

  if (requests.length > 0) {
    requests.push({ appendCells: { sheetId: tabit.loki.id, rows: lokirivit.map(riviSoluiksi), fields: 'userEnteredValue' } });
    await batchUpdate(request, sheetId, requests);
  }
  return { tallennetut, uudemmat };
}

async function tallenna(request, avain, req, res) {
  let runko = req.body;
  if (typeof runko === 'string') {
    try { runko = JSON.parse(runko); } catch { runko = null; }
  }
  const tarkistettu = tarkistaTallennus(runko);
  if (tarkistettu.virhe) return laheta(res, 400, { error: tarkistettu.virhe });

  try {
    return laheta(res, 200, await tallennaKerran(request, avain, tarkistettu));
  } catch (error) {
    // Muistissa ollut välilehti on poistettu tai nimetty uudelleen: luetaan välilehdet ja yritetään kerran uudelleen.
    if (!onPuuttuvaValilehti(error) || onJoOlemassa(error)) throw error;
    metaMuisti.delete(avain.sheetId);
    return laheta(res, 200, await tallennaKerran(request, avain, tarkistettu));
  }
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
    if (toiminto === 'avaa') {
      const laite = String(req.headers?.['x-kirjaus-laite'] || '');
      return await avaa(request, avain, onLaitetunnus(laite) ? laite : '', res);
    }
    return await tallenna(request, avain, req, res);
  } catch (error) {
    return lahetaGoogleVirhe(res, error, error?.kirjausVaihe);
  }
}

// Testejä varten.
export function tyhjennaKirjausMuisti() {
  metaMuisti.clear();
}
