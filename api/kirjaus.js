// api/kirjaus.js
// Mobiilikirjaus (Compak-ratalaite): GET ?toiminto=avaa antaa radan ampujajonon, tallennetut kortit ja haltijan,
// POST ?toiminto=tallenna kirjoittaa kortit kisan MOBIILI Rata N -välilehdelle ja lokin MOBIILI_LOKI-välilehdelle.
// Radalla on yksi haltijalaite kerrallaan (api/_lib/kirjausHaltija.js, MOBIILI_LAITTEET): POST ?toiminto=ota ottaa
// radan (vapaan suoraan, varatun siirtoavaimella tai kilpailutoimiston PIN-koodilla), POST ?toiminto=vapauta luovuttaa
// sen. Korvatun laitteen kortteja ei tallenneta: ne kirjataan lokiin ristiriitoina kilpailutoimistolle.
// Pääsy ratakoodilla (Authorization: Bearer <koodi>, api/_lib/kirjausAvain.js). Kirjoittaa erillisellä
// kirjuripalvelutilillä, joka on jaettu muokkaajaksi vain kisoihin, joissa mobiilikirjaus on käytössä.
// Google-kiintiö on 60 lukua ja 60 kirjoitusta minuutissa per tili, joten tallennus tekee yhden luvun
// (haltijarivi ja korttirivit) ja yhden kirjoituksen (kortit ja lokirivit samassa batchUpdate-kutsussa, eli joko molemmat tai ei kumpaakaan);
// välilehtien tunnukset pidetään muistissa.
import dotenv from 'dotenv';
dotenv.config();

import { torjuEiSallittuSheetId } from './_lib/sheetAllowlist.js';
import { haeKirjuriAsiakas, onKiintioVirhe, onKirjuriMaaritetty, pyyntoUudelleenyrittaen } from './_lib/googleAuth.js';
import { kohdistaValilehdet, valilehtiAlue } from './_lib/sheetsData.js';
import { tarkistaAvain } from './_lib/kirjausAvain.js';
import {
  AIKATAULU_VALILEHDET, KOHTEITA, KORTTI_OTSIKKO, LOKI_OTSIKKO, LOKI_VALILEHTI, MAKS_NRO, VIIMEINEN_SARAKE,
  aikaleima, korttiRivi, lueKorttiRivi, mobiiliValilehti, onLaitetunnus, radanJono, solu, speksiArvo, taydenna,
  tarkistaTallennus
} from './_lib/kirjausData.js';
import {
  LAITTEET_OTSIKKO, LAITTEET_VALILEHTI, LINJA_SARAKE, MAKS_PIN_VIRHEET, haltijaAvain, haltijaRivi, julkinenHaltija,
  laitteenNimi, lueLaiteRivi, onHaltija, tarkistaLinja, vaihtoPin
} from './_lib/kirjausHaltija.js';

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

// Taulukon nimi ja välilehdet [{ nimi, id, sarakkeita }], muistissa META_TTL_MS (välilehtiä vain lisätään).
async function metatiedot(request, sheetId, { tuore = false } = {}) {
  const muistissa = metaMuisti.get(sheetId);
  if (!tuore && muistissa && Date.now() - muistissa.aika < META_TTL_MS) return muistissa.arvo;
  let res;
  try {
    res = await request({ url: `${SHEETS}/${sheetId}?fields=properties(title),sheets(properties(title,sheetId,gridProperties(columnCount)))` });
  } catch (error) {
    error.kirjausVaihe = 'meta';
    throw error;
  }
  const arvo = {
    otsikko: res.data.properties?.title || '',
    valilehdet: (res.data.sheets || []).map((s) => ({
      nimi: s.properties?.title, id: s.properties?.sheetId, sarakkeita: s.properties?.gridProperties?.columnCount
    })).filter((v) => v.nimi)
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
const solut = (tab, rivi, sarake, arvot) => ({ updateCells: {
  start: { sheetId: tab.id, rowIndex: rivi, columnIndex: sarake }, rows: [riviSoluiksi(arvot)], fields: 'userEnteredValue'
} });
const laiteAlue = (tab, sarake) => `${valilehtiAlue(tab.nimi)}!A${sarake + 1}:${String.fromCharCode(64 + LAITTEET_OTSIKKO.length)}${sarake + 1}`;
const salaisuus = () => process.env.KIRJAUS_SALAISUUS;

async function avaa(request, { sheetId, sarake, voimassaAsti }, { laite, haltija }, res) {
  // Aina tuoreet välilehdet: toisen palvelinilmentymän muisti ei tiedä toisen laitteen luomasta tai
  // poistetusta MOBIILI-välilehdestä, ja vaihtolaite saisi tyhjät kortit (tai luku kaatuisi).
  const meta = await metatiedot(request, sheetId, { tuore: true });
  const nimet = meta.valilehdet.map((v) => v.nimi);
  const kohteet = kohdistaValilehdet([...AIKATAULU_VALILEHDET, 'KISANSPEKSIT'], nimet).loydetyt;
  const mobiili = etsiValilehti(meta, mobiiliValilehti(sarake));
  const laitteet = etsiValilehti(meta, LAITTEET_VALILEHTI);

  // Korttirivit muotoilemattomina: 13-numeroinen VERSIO ei saa tulla tieteellisenä merkintänä.
  const omatAlueet = [
    mobiili ? `${valilehtiAlue(mobiili.nimi)}!A2:${VIIMEINEN_SARAKE}${MAKS_NRO + 1}` : null,
    laitteet ? laiteAlue(laitteet, sarake) : null
  ];
  const [arvot, omat] = await Promise.all([
    batchGet(request, sheetId, kohteet.map((k) => valilehtiAlue(k.todellinen)), 'FORMATTED_VALUE'),
    batchGet(request, sheetId, omatAlueet.filter(Boolean), 'UNFORMATTED_VALUE')
  ]);
  const [korttiRivit, laiteRivit] = omatAlueet.map((alue) => (alue ? omat[omatAlueet.filter(Boolean).indexOf(alue)] : []));

  const speksit = arvot[kohteet.findIndex((k) => k.pyydetty === 'KISANSPEKSIT')] || [];
  const aikataulut = kohteet
    .map((k, i) => ({ nimi: k.todellinen, rivit: arvot[i], pyydetty: k.pyydetty }))
    .filter((k) => k.pyydetty !== 'KISANSPEKSIT');
  const ratojaPaivassa = Number.parseInt(speksiArvo(speksit, 'LAYOUT/PÄIVÄ'), 10) || 0;
  const tiedot = radanJono({ aikataulut, sarake, ratojaPaivassa });
  const kortit = (korttiRivit || []).map(lueKorttiRivi).filter((k) => k && k.versio > 0);
  const rivi = lueLaiteRivi((laiteRivit || [])[0]);
  const julkinen = julkinenHaltija(rivi, laite);

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
    // Radan haltija: oma = tämän laitteen haltija-avain on voimassa (sama laite ilman avainta saa sen otolla).
    haltija: { ...julkinen, oma: julkinen.oma && onHaltija(haltija, rivi, { sheetId, sarake, laite }, salaisuus()) },
    linja: rivi.linja,
    voimassaAsti
  });
}

const onJoOlemassa = (error) => googleStatus(error) === 400 && /already exists/i.test(googleViesti(error));
const onPuuttuvaValilehti = (error) => googleStatus(error) === 400 && /no grid with id|unable to parse range/i.test(googleViesti(error));
const uusiId = () => 100000000 + Math.floor(Math.random() * 1900000000);

// Luo puuttuvat MOBIILI-välilehdet otsikkoriveineen yhdellä kutsulla (välilehti ja otsikko syntyvät yhdessä).
// Kaksi laitetta voi yrittää samaan aikaan: silloin toinen saa "already exists" ja lukee välilehdet uudelleen.
// Vanhan lokin (7 saraketta, ennen HUOM-saraketta) leveys ja otsikko korjataan samalla.
async function varmistaValilehdet(request, sheetId, sarake) {
  let meta = await metatiedot(request, sheetId);
  const tarvittavat = [
    { nimi: mobiiliValilehti(sarake), otsikko: KORTTI_OTSIKKO, rivit: MAKS_NRO + 1 },
    { nimi: LOKI_VALILEHTI, otsikko: LOKI_OTSIKKO, rivit: 1000 },
    { nimi: LAITTEET_VALILEHTI, otsikko: LAITTEET_OTSIKKO, rivit: MAKS_NRO + 1 }
  ].filter((t) => !etsiValilehti(meta, t.nimi));
  const loki = etsiValilehti(meta, LOKI_VALILEHTI);
  if (loki && Number.isInteger(loki.sarakkeita) && loki.sarakkeita < LOKI_OTSIKKO.length) {
    await batchUpdate(request, sheetId, [
      { appendDimension: { sheetId: loki.id, dimension: 'COLUMNS', length: LOKI_OTSIKKO.length - loki.sarakkeita } },
      solut(loki, 0, 0, LOKI_OTSIKKO)
    ]);
    if (tarvittavat.length === 0) meta = await metatiedot(request, sheetId, { tuore: true });
  }
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
  return {
    kortit: etsiValilehti(meta, mobiiliValilehti(sarake)),
    loki: etsiValilehti(meta, LOKI_VALILEHTI),
    laitteet: etsiValilehti(meta, LAITTEET_VALILEHTI)
  };
}

// Korvatun laitteen kortit (haltija vaihtui, esim. akku loppui ja rata otettiin PIN-koodilla): taulukon kortin
// ampumattomat kohteet täydennetään laitteen merkinnöillä, jotta yhtään ammuttua kiekkoa ei jää kirjaamatta.
// Uuden laitteen merkinnät pysyvät; eri merkinnät kirjataan lokiin kilpailutoimiston tarkistettaviksi.
// Palauttaa { requests, lokirivit, taydennetyt }.
function korvatunKortit(tabit, sarake, laite, kortit, tallessa, aika) {
  const requests = [];
  const lokirivit = [];
  let taydennetyt = 0;
  kortit.forEach((kortti, i) => {
    const vanha = lueKorttiRivi((tallessa[i] || [])[0]);
    const t = vanha ? taydenna(vanha.merkit, kortti.merkit) : { merkit: kortti.merkit, taytetty: 1, eri: 0 };
    if (t.taytetty === 0 && t.eri === 0) return;
    const huom = [
      t.taytetty > 0 ? 'KORVATTU LAITE: TÄYDENNETTY' : 'KORVATTU LAITE',
      t.eri > 0 ? `${t.eri} ERI MERKINTÄÄ, TAULUKON MERKINTÄ JÄI` : ''
    ].filter(Boolean).join(', ');
    // Versio taulukon versiota suurempi, jotta täydennys ei jää uudelleenlähetyksen alle; uuden laitteen seuraava
    // tallennus täydentää omansa tästä (tallennaKerran), joten sen merkinnät eivät katoa.
    const versio = vanha ? vanha.versio + 1 : kortti.versio;
    if (t.taytetty > 0) {
      requests.push(solut(tabit.kortit, kortti.nro, 0, korttiRivi({ ...kortti, merkit: t.merkit, versio, laite, aika })));
      taydennetyt++;
    }
    lokirivit.push([aika, sarake, kortti.nro, laite, versio, vanha?.merkit || '', kortti.merkit, huom]);
  });
  return { requests, lokirivit, taydennetyt };
}

async function tallennaKerran(request, { sheetId, sarake }, { laite, haltija, kortit, linja }) {
  const tabit = await varmistaValilehdet(request, sheetId, sarake);
  const korttiAlue = (nro) => `${valilehtiAlue(tabit.kortit.nimi)}!A${nro + 1}:${VIIMEINEN_SARAKE}${nro + 1}`;
  const [laiteRivit, ...tallessa] = await batchGet(request, sheetId,
    [laiteAlue(tabit.laitteet, sarake), ...kortit.map((k) => korttiAlue(k.nro))], 'UNFORMATTED_VALUE');
  const rivi = lueLaiteRivi((laiteRivit || [])[0]);
  const aika = aikaleima();

  if (!haltija) {
    // Vaiheen 3 sovellus (ei haltija-avainta): ei kirjoiteta eikä lokiteta; uusi versio latautuu sivun päivityksellä.
    return { status: 409, body: { error: 'Päivitä sivu: kirjauksen uusi versio', paivita: true } };
  }
  if (!onHaltija(haltija, rivi, { sheetId, sarake, laite }, salaisuus())) {
    const korvattu = korvatunKortit(tabit, sarake, laite, kortit, tallessa, aika);
    if (korvattu.lokirivit.length > 0) {
      await batchUpdate(request, sheetId, [
        ...korvattu.requests,
        { appendCells: { sheetId: tabit.loki.id, rows: korvattu.lokirivit.map(riviSoluiksi), fields: 'userEnteredValue' } }
      ]);
    }
    return { status: 409, body: {
      error: rivi.laite ? 'Rata on siirretty toiselle laitteelle' : 'Rata on luovutettu',
      korvattu: true,
      taydennetty: korvattu.taydennetyt,
      kirjattu: korvattu.lokirivit.length - korvattu.taydennetyt,
      haltija: julkinenHaltija(rivi, laite)
    } };
  }

  const tallennetut = [];
  const uudemmat = [];
  const requests = [];
  const lokirivit = [];
  kortit.forEach((kortti, i) => {
    const vanha = lueKorttiRivi((tallessa[i] || [])[0]);
    if (vanha && vanha.versio >= kortti.versio) {
      // Sama versio on jo tallessa (uudelleenlähetys) tai taulukossa on uudempi: ei kirjoiteta.
      if (vanha.versio === kortti.versio && vanha.merkit === kortti.merkit) tallennetut.push(kortti.nro);
      // Toisen laitteen tunnusta ei palauteta (sillä ja ratakoodilla saisi radan); vain tieto, että se oli toinen.
      else uudemmat.push({ nro: kortti.nro, merkit: vanha.merkit, versio: vanha.versio, muuLaite: vanha.laite !== laite, aika: vanha.aika });
      return;
    }
    // Taulukon kortin on kirjoittanut toinen laite (korvatun laitteen täydennys tai edellinen haltija): sen merkinnät
    // täyttävät tämän kortin ampumattomat kohteet. Tämä laite peruu vain omia merkintöjään, joten se ei tyhjennä niitä.
    const t = vanha && vanha.laite && vanha.laite !== laite ? taydenna(kortti.merkit, vanha.merkit) : null;
    const merkit = t?.taytetty ? t.merkit : kortti.merkit;
    requests.push(solut(tabit.kortit, kortti.nro, 0, korttiRivi({ ...kortti, merkit, laite, aika })));
    lokirivit.push([aika, sarake, kortti.nro, laite, kortti.versio, vanha?.merkit || '', merkit, t?.taytetty ? 'TÄYDENNETTY TAULUKOSTA' : '']);
    tallennetut.push(kortti.nro);
    // Laite ottaa täydennetyn kortin käyttöön (sama versio, eri merkit: taulukko voittaa).
    if (t?.taytetty) uudemmat.push({ nro: kortti.nro, merkit, versio: kortti.versio, muuLaite: false, aika });
  });

  if (lokirivit.length > 0) {
    requests.push({ appendCells: { sheetId: tabit.loki.id, rows: lokirivit.map(riviSoluiksi), fields: 'userEnteredValue' } });
  }
  // Linjan tila haltijariville: uusi laite jatkaa samoista lisäyksistä, ohituksista, tauoista ja keskeytyksistä.
  if (linja) requests.push(solut(tabit.laitteet, sarake, LINJA_SARAKE, [JSON.stringify(linja), aika]));
  if (requests.length > 0) await batchUpdate(request, sheetId, requests);
  return { status: 200, body: { tallennetut, uudemmat } };
}

// Lukee pyynnön rungon JSON-oliona (Vercel jäsentää sen yleensä valmiiksi).
function runkoOf(req) {
  if (typeof req.body !== 'string') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

// Toistaa toiminnon kerran tuoreilla välilehdillä, jos muistissa ollut välilehti on poistettu tai nimetty uudelleen.
async function uudelleenPoistetulla(avain, toimi) {
  try {
    return await toimi();
  } catch (error) {
    if (!onPuuttuvaValilehti(error) || onJoOlemassa(error)) throw error;
    metaMuisti.delete(avain.sheetId);
    return toimi();
  }
}

async function tallenna(request, avain, req, res) {
  const tarkistettu = tarkistaTallennus(runkoOf(req));
  if (tarkistettu.virhe) return laheta(res, 400, { error: tarkistettu.virhe });
  let linja;
  if (tarkistettu.linja !== undefined) {
    const t = tarkistaLinja(tarkistettu.linja);
    if (t.virhe) return laheta(res, 400, { error: t.virhe });
    linja = t.linja;
  }
  const tulos = await uudelleenPoistetulla(avain, () => tallennaKerran(request, avain, { ...tarkistettu, linja }));
  return laheta(res, tulos.status, tulos.body);
}

// Haltijarivi ja haltijan vaihto (rivi ja lokirivi yhdessä kirjoituksessa).
async function lueHaltija(request, avain) {
  const tabit = await varmistaValilehdet(request, avain.sheetId, avain.sarake);
  const [rivit] = await batchGet(request, avain.sheetId, [laiteAlue(tabit.laitteet, avain.sarake)], 'UNFORMATTED_VALUE');
  return { tabit, rivi: lueLaiteRivi((rivit || [])[0]) };
}

async function vaihdaHaltija(request, { sheetId, sarake }, tabit, uusi, { laite, teksti }, lisat = []) {
  await batchUpdate(request, sheetId, [
    solut(tabit.laitteet, sarake, 0, haltijaRivi(sarake, uusi)),
    ...lisat,
    { appendCells: { sheetId: tabit.loki.id, rows: [riviSoluiksi([uusi.otettu, sarake, '', laite, '', '', '', teksti])], fields: 'userEnteredValue' } }
  ]);
}

const TAVAT = { vapaa: 'vapaa rata', siirto: 'siirto edelliseltä laitteelta', pin: 'kilpailutoimiston PIN-koodi' };

// Ottaa radan tälle laitteelle: vapaa rata suoraan, sama laite saa avaimensa uudelleen, varattu rata edellisen
// laitteen siirtoavaimella tai vaihto-PIN-koodilla (väärät PIN-koodit lasketaan; MAKS_PIN_VIRHEET lukitsee vaihdon,
// kunnes kilpailutoimisto avaa PIN-koodit ScoringLibin valikosta).
const otot = new Map();
async function ota(request, avain, req, res) {
  // Saman radan otot jonossa tässä palvelinilmentymässä: rinnakkaiset väärät PIN-koodit lasketaan kaikki.
  const tunnus = `${avain.sheetId}:${avain.sarake}`;
  const edellinen = otot.get(tunnus) || Promise.resolve();
  const tama = edellinen.catch(() => {}).then(() => otaJonossa(request, avain, req, res));
  otot.set(tunnus, tama);
  try {
    return await tama;
  } finally {
    if (otot.get(tunnus) === tama) otot.delete(tunnus);
  }
}

async function otaJonossa(request, avain, req, res) {
  const runko = runkoOf(req);
  const laite = typeof runko?.laite === 'string' ? runko.laite : '';
  if (!onLaitetunnus(laite)) return laheta(res, 400, { error: 'Laitteen tunnus puuttuu' });
  const pin = typeof runko?.pin === 'string' ? runko.pin.trim() : '';
  const siirto = typeof runko?.siirto === 'string' ? runko.siirto.slice(0, 200) : '';
  const nimi = laitteenNimi(runko?.nimi);
  const { sheetId, sarake } = avain;

  return uudelleenPoistetulla(avain, async () => {
    const { tabit, rivi } = await lueHaltija(request, avain);
    const vastaa = (uusiRivi) => laheta(res, 200, {
      haltija: haltijaAvain({ sheetId, sarake, sukupolvi: uusiRivi.sukupolvi, laite }, salaisuus()),
      tila: julkinenHaltija(uusiRivi, laite),
      linja: rivi.linja
    });
    if (rivi.laite === laite) return vastaa(rivi);

    let tapa = null;
    if (!rivi.laite) tapa = 'vapaa';
    else if (siirto && onHaltija(siirto, rivi, { sheetId, sarake, laite: rivi.laite }, salaisuus())) tapa = 'siirto';
    else if (pin) {
      if (rivi.pinVirheet >= MAKS_PIN_VIRHEET) {
        return laheta(res, 423, { error: 'Liian monta väärää PIN-koodia. Kilpailutoimisto avaa vaihdon näyttämällä PIN-koodit uudelleen.', haltija: julkinenHaltija(rivi, laite) });
      }
      if (pin !== vaihtoPin({ sheetId, sarake, sukupolvi: rivi.sukupolvi }, salaisuus())) {
        const virheet = rivi.pinVirheet + 1;
        await batchUpdate(request, sheetId, [solut(tabit.laitteet, sarake, 6, [virheet])]);
        return laheta(res, 403, { error: 'Väärä PIN-koodi', yrityksia: Math.max(0, MAKS_PIN_VIRHEET - virheet), haltija: julkinenHaltija({ ...rivi, pinVirheet: virheet }, laite) });
      }
      tapa = 'pin';
    }
    if (!tapa) return laheta(res, 409, { error: 'Rata on käytössä toisella laitteella', varattu: true, haltija: julkinenHaltija(rivi, laite) });

    const uusi = { sukupolvi: rivi.sukupolvi + 1, laite, nimi, otettu: aikaleima(), tapa: TAVAT[tapa], pinVirheet: 0, linja: rivi.linja };
    await vaihdaHaltija(request, avain, tabit, uusi, { laite, teksti: `RATA OTETTU: ${TAVAT[tapa]}${rivi.laite ? ` (edellinen ${rivi.nimi || rivi.laite})` : ''}` });
    return vastaa(uusi);
  });
}

// Haltija luovuttaa radan: seuraava laite saa sen ilman PIN-koodia. Linjan tila tallennetaan samalla.
async function vapauta(request, avain, req, res) {
  const runko = runkoOf(req);
  const laite = typeof runko?.laite === 'string' ? runko.laite : '';
  if (!onLaitetunnus(laite)) return laheta(res, 400, { error: 'Laitteen tunnus puuttuu' });
  let linja = null;
  if (runko?.linja !== undefined) {
    const t = tarkistaLinja(runko.linja);
    if (t.virhe) return laheta(res, 400, { error: t.virhe });
    linja = t.linja;
  }
  return uudelleenPoistetulla(avain, async () => {
    const { tabit, rivi } = await lueHaltija(request, avain);
    if (!onHaltija(runko?.haltija, rivi, { sheetId: avain.sheetId, sarake: avain.sarake, laite }, salaisuus())) {
      return laheta(res, 409, { error: 'Tämä laite ei ole enää radan laite', korvattu: true, haltija: julkinenHaltija(rivi, laite) });
    }
    const uusi = { sukupolvi: rivi.sukupolvi + 1, laite: '', nimi: '', otettu: aikaleima(), tapa: 'luovutettu', pinVirheet: 0 };
    await vaihdaHaltija(request, avain, tabit, uusi, { laite, teksti: `RATA LUOVUTETTU (${rivi.nimi || laite})` },
      linja ? [solut(tabit.laitteet, avain.sarake, LINJA_SARAKE, [JSON.stringify(linja), uusi.otettu])] : []);
    return laheta(res, 200, { vapautettu: true });
  });
}

const TOIMINNOT = { avaa: 'GET', tallenna: 'POST', ota: 'POST', vapauta: 'POST' };

export default async function handler(req, res) {
  const toiminto = String(req.query?.toiminto || '');
  if (!Object.hasOwn(TOIMINNOT, toiminto)) return laheta(res, 400, { error: 'Tuntematon toiminto' });
  if (req.method !== TOIMINNOT[toiminto]) return laheta(res, 405, { error: `Käytä ${TOIMINNOT[toiminto]}-pyyntöä` });

  const avain = tarkistaAvain(bearer(req), process.env.KIRJAUS_SALAISUUS);
  if (avain.virhe) return laheta(res, 401, { error: avain.virhe });
  if (!onKirjuriMaaritetty()) return laheta(res, 503, { error: 'Mobiilikirjausta ei ole otettu käyttöön palvelimella' });
  if (await torjuEiSallittuSheetId(avain.sheetId, res)) return;

  try {
    const asiakas = await haeKirjuriAsiakas();
    const request = (opts) => pyyntoUudelleenyrittaen((o) => asiakas.request(o), opts);
    if (toiminto === 'avaa') {
      const laite = String(req.headers?.['x-kirjaus-laite'] || '');
      const haltija = String(req.headers?.['x-kirjaus-haltija'] || '');
      return await avaa(request, avain, { laite: onLaitetunnus(laite) ? laite : '', haltija }, res);
    }
    if (toiminto === 'ota') return await ota(request, avain, req, res);
    if (toiminto === 'vapauta') return await vapauta(request, avain, req, res);
    return await tallenna(request, avain, req, res);
  } catch (error) {
    return lahetaGoogleVirhe(res, error, error?.kirjausVaihe);
  }
}

// Testejä varten.
export function tyhjennaKirjausMuisti() {
  metaMuisti.clear();
}
