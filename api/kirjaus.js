// api/kirjaus.js
// Mobiilikirjaus (Compak-ratalaite): GET ?toiminto=avaa antaa radan ampujajonon, tallennetut kortit ja haltijan,
// POST ?toiminto=tallenna kirjoittaa kortit kisan MOBIILI Rata N -välilehdelle ja lokin MOBIILI_LOKI-välilehdelle.
// Radalla on yksi haltijalaite kerrallaan (api/_lib/kirjausHaltija.js, MOBIILI_LAITTEET): POST ?toiminto=ota ottaa
// radan (vapaan suoraan, varatun siirtoavaimella tai kilpailutoimiston PIN-koodilla), POST ?toiminto=vapauta luovuttaa
// sen. Korvatun laitteen kortteja ei tallenneta: ne kirjataan lokiin ristiriitoina kilpailutoimistolle.
// Ryhmäkoodilla (Sporting / FITASC / ESP) samat toiminnot koskevat yhtä ryhmää: avaa antaa ryhmän ampujat, layoutit
// asemineen ja kortit, tallenna kirjoittaa MOBIILI Layout N -välilehdille vain ryhmän ampujien kortteja, ja haltija on
// MOBIILI_RYHMAT-välilehdellä. Varatun ryhmän saa toiselle puhelimelle kuten radan: luovutuksella tai kilpailutoimiston
// ryhmän PIN-koodilla (ScoringLib laskee sen sarakkeella "r<ryhmä>").
// Pääsy rata- tai ryhmäkoodilla (Authorization: Bearer <koodi>, api/_lib/kirjausAvain.js). Kirjoittaa erillisellä
// kirjuripalvelutilillä, joka on jaettu muokkaajaksi vain kisoihin, joissa mobiilikirjaus on käytössä.
// Google-kiintiö on 60 lukua ja 60 kirjoitusta minuutissa per tili, joten tallennus tekee yhden luvun
// (haltijarivi ja korttirivit) ja yhden kirjoituksen (kortit ja lokirivit samassa batchUpdate-kutsussa, eli joko molemmat tai ei kumpaakaan);
// välilehtien tunnukset pidetään muistissa.
// Suora tulos (KISANSPEKSIT MOBIILI_TULOKSET = SUORAAN, api/_lib/kirjausTulokset.js): valmiin kortin tulos menee samassa
// kirjoituksessa OSALLISTUJAT+TULOKSET-välilehden tyhjään tulossoluun. Silloin tallennus lukee lisäksi pääsivun soluina, mutta
// vain kun kortin valmis tulos muuttuu (tavallinen tallennus pysyy yhdessä luvussa).
import dotenv from 'dotenv';
dotenv.config();

import { torjuEiSallittuSheetId } from './_lib/sheetAllowlist.js';
import { haeKirjuriAsiakas, kirjurienMaara, onKiintioVirhe, onKirjuriMaaritetty } from './_lib/googleAuth.js';
import { luoKirjuriValitsin } from './_lib/kirjuriTilit.js';
import { kohdistaValilehdet, valilehtiAlue } from './_lib/sheetsData.js';
import { tarkistaAvain } from './_lib/kirjausAvain.js';
import {
  AIKATAULU_VALILEHDET, KOHTEITA, KORTTI_OTSIKKO, LOKI_OTSIKKO, LOKI_VALILEHTI, MAKS_NRO, VIIMEINEN_SARAKE,
  aikaleima, korttiRivi, lueKorttiRivi, mobiiliValilehti, onLaitetunnus, radanJono, solu, speksiArvo, taydenna,
  tarkistaTallennus
} from './_lib/kirjausData.js';
import {
  LAITTEET_OTSIKKO, LAITTEET_VALILEHTI, LINJA_SARAKE, MAKS_PIN_VIRHEET, RYHMAT_OTSIKKO, TAYDENNYS_SARAKE, haltijaAvain,
  haltijaRivi, julkinenHaltija, laitteenNimi, lisaaTaydennys, lueLaiteRivi, onHaltija, tarkistaLinja, vaihtoPin
} from './_lib/kirjausHaltija.js';
import {
  PAA_VALILEHTI, RYHMAT_VALILEHTI, asemaJako, layoutValilehti, lueLayoutit, lueRyhmaKorttiRivi, onkoRyhmaMerkit, ryhmaKoko,
  ryhmaKorttiOtsikko, ryhmaKorttiRivi, ryhmanAmpujat, ryhmanVuorot, tarkistaRyhmaTallennus
} from './_lib/kirjausRyhma.js';
import { asemaTulokset, kaavaSarakkeet, kompakTulos, muuttuvat, onSuoraan, paaSolut, suoraTulos, tulosSolut } from './_lib/kirjausTulokset.js';

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
    // Korvattujen laitteiden merkinnät: haltija täyttää niillä korttiensa tyhjät kiekot (src/kirjaus/haltija.js).
    taydennykset: rivi.taydennykset,
    voimassaAsti
  });
}

const onJoOlemassa = (error) => googleStatus(error) === 400 && /already exists/i.test(googleViesti(error));
const onPuuttuvaValilehti = (error) => googleStatus(error) === 400 && /no grid with id|unable to parse range/i.test(googleViesti(error));
const uusiId = () => 100000000 + Math.floor(Math.random() * 1900000000);

// Luo puuttuvat MOBIILI-välilehdet otsikkoriveineen yhdellä kutsulla (välilehti ja otsikko syntyvät yhdessä).
// Kaksi laitetta voi yrittää samaan aikaan: silloin toinen saa "already exists" ja lukee välilehdet uudelleen.
// tarvittavat: [{ nimi, otsikko, rivit }]. Liian kapea olemassa oleva välilehti (loki ennen HUOM-saraketta, laitteet
// ennen TÄYDENNYKSET-saraketta, layoutin kortit kiekkomäärän kasvettua) levennetään ja sen otsikko kirjoitetaan uudelleen.
// Palauttaa tuoreet metatiedot.
async function varmista(request, sheetId, tarvittavat) {
  let meta = await metatiedot(request, sheetId);
  const puuttuvat = tarvittavat.filter((t) => !etsiValilehti(meta, t.nimi));
  const kapeat = tarvittavat
    .map((t) => ({ tab: etsiValilehti(meta, t.nimi), otsikko: t.otsikko }))
    .filter(({ tab, otsikko }) => tab && Number.isInteger(tab.sarakkeita) && tab.sarakkeita < otsikko.length);
  if (kapeat.length > 0) {
    await batchUpdate(request, sheetId, kapeat.flatMap(({ tab, otsikko }) => [
      { appendDimension: { sheetId: tab.id, dimension: 'COLUMNS', length: otsikko.length - tab.sarakkeita } },
      solut(tab, 0, 0, otsikko)
    ]));
    if (puuttuvat.length === 0) meta = await metatiedot(request, sheetId, { tuore: true });
  }
  if (puuttuvat.length > 0) {
    // Yksi välilehti kerrallaan: jos toinen laite ehti luoda toisen (esim. yhteisen lokin), tämä ei kaada omaa.
    for (const t of puuttuvat) {
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
  return meta;
}

const lokiTarve = { nimi: LOKI_VALILEHTI, otsikko: LOKI_OTSIKKO, rivit: 1000 };
const haltijaTarve = (kohde) => ({ nimi: kohde.tab, otsikko: kohde.otsikko, rivit: MAKS_NRO + 1 });

async function varmistaValilehdet(request, sheetId, sarake) {
  const meta = await varmista(request, sheetId, [
    { nimi: mobiiliValilehti(sarake), otsikko: KORTTI_OTSIKKO, rivit: MAKS_NRO + 1 },
    lokiTarve,
    haltijaTarve(radanKohde({ sheetId, sarake }))
  ]);
  return {
    meta,
    kortit: etsiValilehti(meta, mobiiliValilehti(sarake)),
    loki: etsiValilehti(meta, LOKI_VALILEHTI),
    laitteet: etsiValilehti(meta, LAITTEET_VALILEHTI)
  };
}

// Haltijarivin paikka: Compak-rata MOBIILI_LAITTEET-välilehdellä (rivi = rata + 1) tai ryhmä MOBIILI_RYHMAT-välilehdellä
// (rivi = ryhmä + 1). tunnus menee haltija-avaimen allekirjoitukseen, joten radan avain ei kelpaa samannumeroiselle ryhmälle.
function radanKohde({ sheetId, sarake }) {
  return { tab: LAITTEET_VALILEHTI, otsikko: LAITTEET_OTSIKKO, rivi: sarake, tunnus: sarake, ryhma: false, jono: `${sheetId}:${sarake}` };
}
function ryhmanKohde({ sheetId, ryhma }) {
  return { tab: RYHMAT_VALILEHTI, otsikko: RYHMAT_OTSIKKO, rivi: ryhma, tunnus: `r${ryhma}`, ryhma: true, jono: `${sheetId}:r${ryhma}` };
}
const kohdeOf = (avain) => (avain.ryhma !== undefined ? ryhmanKohde(avain) : radanKohde(avain));

// Korvatun laitteen kortit (haltija vaihtui, esim. akku loppui ja rata otettiin PIN-koodilla). Radan kortteja
// kirjoittaa vain haltija, joten korvattu laite ei kirjoita niitä: merkinnät, joiden kiekot ovat taulukossa vielä
// tyhjiä, välitetään haltijalle (MOBIILI_LAITTEET, TÄYDENNYKSET), ja haltija täyttää niillä omat tyhjät kiekkonsa.
// Taulukosta poikkeavat merkinnät kirjataan lokiin kilpailutoimiston tarkistettaviksi.
// Palauttaa { taydennykset, lokirivit, taydennetyt, eroavat }.
function korvatunKortit(sarake, laite, kortit, tallessa, taydennykset, aika) {
  const lokirivit = [];
  let uudet = taydennykset;
  let taydennetyt = 0;
  let eroavat = 0;
  kortit.forEach((kortti, i) => {
    const vanha = lueKorttiRivi((tallessa[i] || [])[0]);
    const t = taydenna(vanha?.merkit || '-'.repeat(KOHTEITA), kortti.merkit);
    if (t.taytetty === 0 && t.eri === 0) return;
    if (t.taytetty > 0) {
      uudet = lisaaTaydennys(uudet, kortti.nro, kortti.merkit);
      taydennetyt++;
    }
    if (t.eri > 0) eroavat++;
    const huom = [
      t.taytetty > 0 ? 'KORVATTU LAITE: VÄLITETTY RADAN LAITTEELLE' : 'KORVATTU LAITE',
      t.eri > 0 ? `${t.eri} ERI MERKINTÄÄ, TAULUKON MERKINTÄ JÄI` : ''
    ].filter(Boolean).join(', ');
    lokirivit.push([aika, sarake, kortti.nro, laite, kortti.versio, vanha?.merkit || '', kortti.merkit, huom]);
  });
  return { taydennykset: uudet, lokirivit, taydennetyt, eroavat };
}

// Korvatun laitteen tallennus jonossa (TÄYDENNYKSET luetaan ja kirjoitetaan saman radan muista tallennuksista erikseen).
async function korvatunTallennus(request, { sheetId, sarake }, tabit, laite, kortit, tallessa, aika) {
  const [laiteRivit] = await batchGet(request, sheetId, [laiteAlue(tabit.laitteet, sarake)], 'UNFORMATTED_VALUE');
  const rivi = lueLaiteRivi((laiteRivit || [])[0]);
  const korvattu = korvatunKortit(sarake, laite, kortit, tallessa, rivi.taydennykset, aika);
  if (korvattu.lokirivit.length > 0) {
    await batchUpdate(request, sheetId, [
      ...(korvattu.taydennetyt > 0 ? [solut(tabit.laitteet, sarake, TAYDENNYS_SARAKE, [JSON.stringify(korvattu.taydennykset)])] : []),
      { appendCells: { sheetId: tabit.loki.id, rows: korvattu.lokirivit.map(riviSoluiksi), fields: 'userEnteredValue' } }
    ]);
  }
  return { status: 409, body: {
    error: rivi.laite ? 'Rata on siirretty toiselle laitteelle' : 'Rata on luovutettu',
    korvattu: true,
    taydennetty: korvattu.taydennetyt,
    kirjattu: korvattu.eroavat,
    haltija: julkinenHaltija(rivi, laite)
  } };
}

async function tallennaKerran(request, { sheetId, sarake }, { laite, haltija, kortit, linja }) {
  const tabit = await varmistaValilehdet(request, sheetId, sarake);
  const korttiAlue = (nro) => `${valilehtiAlue(tabit.kortit.nimi)}!A${nro + 1}:${VIIMEINEN_SARAKE}${nro + 1}`;
  const speksiTab = perusValilehdet(tabit.meta).speksit;
  const [laiteRivit, ...luetut] = await batchGet(request, sheetId,
    [laiteAlue(tabit.laitteet, sarake), ...kortit.map((k) => korttiAlue(k.nro)), ...(speksiTab ? [valilehtiAlue(speksiTab)] : [])],
    'UNFORMATTED_VALUE');
  const tallessa = luetut.slice(0, kortit.length);
  const speksit = luetut[kortit.length] || [];
  const rivi = lueLaiteRivi((laiteRivit || [])[0]);
  const aika = aikaleima();

  if (!haltija) {
    // Vaiheen 3 sovellus (ei haltija-avainta): ei kirjoiteta eikä lokiteta; uusi versio latautuu sivun päivityksellä.
    return { status: 409, body: { error: 'Päivitä sivu: kirjauksen uusi versio', paivita: true } };
  }
  if (!onHaltija(haltija, rivi, { sheetId, sarake, laite }, salaisuus())) {
    return radanJonossa(`${sheetId}:${sarake}`,
      () => korvatunTallennus(request, { sheetId, sarake }, tabit, laite, kortit, tallessa, aika));
  }

  const tallennetut = [];
  const uudemmat = [];
  const requests = [];
  const kirjattavat = [];
  kortit.forEach((kortti, i) => {
    const vanha = lueKorttiRivi((tallessa[i] || [])[0]);
    if (vanha && vanha.versio >= kortti.versio) {
      // Sama versio on jo tallessa (uudelleenlähetys) tai taulukossa on uudempi: ei kirjoiteta.
      if (vanha.versio === kortti.versio && vanha.merkit === kortti.merkit) tallennetut.push(kortti.nro);
      // Toisen laitteen tunnusta ei palauteta (sillä ja ratakoodilla saisi radan); vain tieto, että se oli toinen.
      else uudemmat.push({ nro: kortti.nro, merkit: vanha.merkit, versio: vanha.versio, muuLaite: vanha.laite !== laite, aika: vanha.aika });
      return;
    }
    requests.push(solut(tabit.kortit, kortti.nro, 0, korttiRivi({ ...kortti, laite, aika })));
    kirjattavat.push({ kortti, vanha });
    tallennetut.push(kortti.nro);
  });

  // Linjan tila haltijariville: uusi laite jatkaa samoista lisäyksistä, ohituksista, tauoista ja keskeytyksistä.
  if (linja) requests.push(solut(tabit.laitteet, sarake, LINJA_SARAKE, [JSON.stringify(linja), aika]));
  const tulokset = onSuoraan(speksit)
    ? await suoratTulokset(request, sheetId, tabit.meta, kirjattavat.map(({ kortti, vanha }) => ({
      avain: kortti.nro, nro: kortti.nro, nimi: kortti.nimi, sarake, vanha: kompakTulos(vanha?.merkit), uusi: kompakTulos(kortti.merkit)
    })))
    : eiTuloksia();
  const lokirivit = (huomio) => kirjattavat.map(({ kortti, vanha }) => [aika, sarake, kortti.nro, laite, kortti.versio,
    vanha?.merkit || '', kortti.merkit, huomio(kortti.nro).join(', ')]);
  await kirjoitaTuloksin(request, sheetId, tabit.loki, requests, tulokset, lokirivit);
  const taydennykset = Object.keys(rivi.taydennykset).length > 0 ? { taydennykset: rivi.taydennykset } : {};
  return { status: 200, body: { tallennetut, uudemmat, ...taydennykset } };
}

// --- Ryhmäpuhelin (Sporting / FITASC / ESP) ---

// Kortin rivi ilman tietoa layoutin leveydestä: riittävän leveä alue kaikille layouteille (8 + asemat + 200 kiekkoa + KUITATUT).
const RYHMA_RIVIN_LOPPU = 'JZ';
const ryhmaKorttiAlue = (nimi, nro) => `${valilehtiAlue(nimi)}!A${nro + 1}:${RYHMA_RIVIN_LOPPU}${nro + 1}`;
const ryhmanTunnus = (k) => `${k.layout}:${k.nro}`;

// Ryhmän perustiedot pääsivun ja KISANSPEKSIT-välilehden arvoista: { layoutit, ampujat } tai { virhe }.
function ryhmanTiedot(paaRivit, speksit, ryhma) {
  const { layoutit, virhe } = lueLayoutit(speksit);
  if (virhe) return { virhe };
  return { layoutit, ampujat: ryhmanAmpujat(paaRivit, ryhma, ryhmaKoko(speksit)) };
}

function perusValilehdet(meta) {
  const nimet = meta.valilehdet.map((v) => v.nimi);
  const [paa, speksit] = kohdistaValilehdet([PAA_VALILEHTI, 'KISANSPEKSIT'], nimet).loydetyt
    .reduce((acc, k) => {
      acc[k.pyydetty === PAA_VALILEHTI ? 0 : 1] = k.todellinen;
      return acc;
    }, [null, null]);
  return { paa, speksit };
}

const puuttuvaPerus = ({ paa, speksit }) => (!paa ? `Välilehteä ${PAA_VALILEHTI} ei löydy` : !speksit ? 'Välilehteä KISANSPEKSIT ei löydy' : '');

async function avaaRyhma(request, { sheetId, ryhma, voimassaAsti }, { laite, haltija }, res) {
  const kohde = ryhmanKohde({ sheetId, ryhma });
  const meta = await metatiedot(request, sheetId, { tuore: true });
  const perus = perusValilehdet(meta);
  if (puuttuvaPerus(perus)) return laheta(res, 409, { error: puuttuvaPerus(perus) });
  // Ryhmäaikataulu voi olla millä tahansa Aikataulu-alkuisella välilehdellä (Aikataulu, Aikataulu La, Aikataulut ...).
  const aikataulut = meta.valilehdet.map((v) => v.nimi).filter((nimi) => /^\s*aikataulu/i.test(nimi));
  const layoutTabit = meta.valilehdet.filter((v) => /^MOBIILI Layout \d+$/i.test(v.nimi.trim()));
  const haltijaTab = etsiValilehti(meta, kohde.tab);

  // Ensin pääsivu, asetukset ja aikataulut muotoiltuina, sitten vain ryhmän ampujien korttirivit ja haltijarivi
  // muotoilemattomina (13-numeroinen VERSIO; rivi = NRO + 1).
  const [paaRivit, speksit, ...aikatauluRivit] = await batchGet(request, sheetId,
    [perus.paa, perus.speksit, ...aikataulut].map(valilehtiAlue), 'FORMATTED_VALUE');
  const tiedot = ryhmanTiedot(paaRivit, speksit, ryhma);
  if (tiedot.virhe) return laheta(res, 409, { error: tiedot.virhe });
  const { layoutit, ampujat } = tiedot;
  const vuorot = ryhmanVuorot(aikataulut.map((nimi, i) => ({ nimi, rivit: aikatauluRivit[i] })), layoutit, ryhma);

  const luettavat = [];
  for (const tab of layoutTabit) {
    const layout = layoutit.find((l) => layoutValilehti(l.nro).toLowerCase() === tab.nimi.trim().toLowerCase());
    if (layout) for (const a of ampujat) luettavat.push({ layout, alue: ryhmaKorttiAlue(tab.nimi, a.nro) });
  }
  const omat = await batchGet(request, sheetId,
    [...luettavat.map((l) => l.alue), ...(haltijaTab ? [laiteAlue(haltijaTab, kohde.rivi)] : [])], 'UNFORMATTED_VALUE');
  const kortit = [];
  luettavat.forEach(({ layout }, i) => {
    const k = lueRyhmaKorttiRivi((omat[i] || [])[0], layout);
    if (k && k.versio > 0) kortit.push({ layout: layout.nro, nro: k.nro, merkit: k.merkit, versio: k.versio, kuitatut: k.kuitatut, hyvaksytty: Boolean(k.hyvaksytty) });
  });
  const rivi = lueLaiteRivi(haltijaTab ? (omat[luettavat.length] || [])[0] : null, { ryhma: true });
  const julkinen = julkinenHaltija(rivi, laite);

  return laheta(res, 200, {
    kisa: meta.otsikko,
    ryhma,
    ampujat,
    layoutit: layoutit.map((l) => ({ ...l, ...(vuorot[l.nro] || {}) })),
    kortit,
    haltija: { ...julkinen, oma: julkinen.oma && onHaltija(haltija, rivi, { sheetId, sarake: kohde.tunnus, laite }, salaisuus()) },
    taydennykset: rivi.taydennykset,
    voimassaAsti
  });
}

// Korvatun puhelimen kortit (ryhmä otettiin toiselle puhelimelle): merkinnät, joiden kiekot ovat taulukossa vielä tyhjiä,
// välitetään haltijalle (MOBIILI_RYHMAT, TÄYDENNYKSET, avain "<layout>:<nro>"); poikkeavat kirjataan lokiin.
async function korvatunRyhmaTallennus(request, sheetId, kohde, tabit, laite, kortit, vieraat, aika) {
  const [laiteRivit] = await batchGet(request, sheetId, [laiteAlue(tabit.laitteet, kohde.rivi)], 'UNFORMATTED_VALUE');
  const rivi = lueLaiteRivi((laiteRivit || [])[0], { ryhma: true });
  let taydennykset = rivi.taydennykset;
  let taydennetyt = 0;
  let eroavat = 0;
  const lokirivit = [...vieraat];
  for (const { kortti, layout, vanha } of kortit) {
    const t = taydenna(vanha?.merkit || '-'.repeat(layout.kohteita), kortti.merkit);
    if (t.taytetty === 0 && t.eri === 0) continue;
    if (t.taytetty > 0) {
      taydennykset = lisaaTaydennys(taydennykset, ryhmanTunnus(kortti), kortti.merkit);
      taydennetyt++;
    }
    if (t.eri > 0) eroavat++;
    const huom = [
      t.taytetty > 0 ? 'KORVATTU PUHELIN: VÄLITETTY RYHMÄN PUHELIMELLE' : 'KORVATTU PUHELIN',
      t.eri > 0 ? `${t.eri} ERI MERKINTÄÄ, TAULUKON MERKINTÄ JÄI` : '',
      `RYHMÄ ${kohde.rivi}`
    ].filter(Boolean).join(', ');
    lokirivit.push([aika, `Layout ${layout.nro}`, kortti.nro, laite, kortti.versio, vanha?.merkit || '', kortti.merkit, huom]);
  }
  if (lokirivit.length > 0) {
    await batchUpdate(request, sheetId, [
      ...(taydennetyt > 0 ? [solut(tabit.laitteet, kohde.rivi, TAYDENNYS_SARAKE, [JSON.stringify(taydennykset)])] : []),
      { appendCells: { sheetId: tabit.loki.id, rows: lokirivit.map(riviSoluiksi), fields: 'userEnteredValue' } }
    ]);
  }
  return { status: 409, body: {
    error: rivi.laite ? 'Ryhmää kirjaa nyt toinen puhelin' : 'Ryhmän kirjaus on luovutettu',
    korvattu: true,
    taydennetty: taydennetyt,
    kirjattu: eroavat,
    haltija: julkinenHaltija(rivi, laite)
  } };
}

// Ryhmän tallennus: yksi luku (pääsivu, asetukset, haltijarivi ja korttirivit) ja yksi kirjoitus. Vain ryhmän ampujien
// kortit kirjoitetaan; muut (ryhmiä muutettu) ja kortit, joiden kiekkomäärä ei vastaa layoutia (asemataulukkoa
// muutettu), palautetaan hylättyinä. Ryhmän ulkopuolisten merkinnät kirjataan lokiin kilpailutoimistolle.
async function tallennaRyhmaKerran(request, avain, { laite, haltija, kortit }) {
  const { sheetId, ryhma } = avain;
  const kohde = ryhmanKohde(avain);
  let meta = await metatiedot(request, sheetId);
  const perus = perusValilehdet(meta);
  if (puuttuvaPerus(perus)) return { status: 409, body: { error: puuttuvaPerus(perus) } };

  // Puuttuvat välilehdet luodaan ensin (otsikko tarvitsee layoutin asemat); tavallisesti ne ovat jo olemassa.
  const layoutNrot = [...new Set(kortit.map((k) => k.layout))];
  const puuttuu = [LOKI_VALILEHTI, kohde.tab, ...layoutNrot.map(layoutValilehti)].some((nimi) => !etsiValilehti(meta, nimi));
  let layoutit = null;
  if (puuttuu) {
    const [speksit] = await batchGet(request, sheetId, [valilehtiAlue(perus.speksit)], 'UNFORMATTED_VALUE');
    const luettu = lueLayoutit(speksit);
    if (luettu.virhe) return { status: 409, body: { error: luettu.virhe } };
    layoutit = luettu.layoutit;
    meta = await varmista(request, sheetId, [
      lokiTarve,
      haltijaTarve(kohde),
      ...layoutit.filter((l) => layoutNrot.includes(l.nro))
        .map((l) => ({ nimi: layoutValilehti(l.nro), otsikko: ryhmaKorttiOtsikko(l), rivit: MAKS_NRO + 1 }))
    ]);
  }
  const tabit = { loki: etsiValilehti(meta, LOKI_VALILEHTI), laitteet: etsiValilehti(meta, kohde.tab) };
  const korttiTab = (nro) => etsiValilehti(meta, layoutValilehti(nro));
  // Layout, jota ei ole asemataulukossa, ei saa välilehteä: sen kortit hylätään alla.
  const luettavat = kortit.filter((k) => korttiTab(k.layout));

  const [paaRivit, speksit, laiteRivit, ...tallessa] = await batchGet(request, sheetId, [
    valilehtiAlue(perus.paa), valilehtiAlue(perus.speksit), laiteAlue(tabit.laitteet, kohde.rivi),
    ...luettavat.map((k) => ryhmaKorttiAlue(korttiTab(k.layout).nimi, k.nro))
  ], 'UNFORMATTED_VALUE');
  const tiedot = ryhmanTiedot(paaRivit, speksit, ryhma);
  if (tiedot.virhe) return { status: 409, body: { error: tiedot.virhe } };
  layoutit = tiedot.layoutit;
  const ryhmassa = new Map(tiedot.ampujat.map((a) => [a.nro, a.nimi]));
  const rivi = lueLaiteRivi((laiteRivit || [])[0], { ryhma: true });
  const aika = aikaleima();

  const hylatyt = [];
  const kelvot = [];
  const vieraat = [];
  kortit.forEach((kortti) => {
    const layout = layoutit.find((l) => l.nro === kortti.layout);
    const i = luettavat.indexOf(kortti);
    // Layout poistettu kisan asetuksista: kortti ei tallennu, merkinnät lokiin, eikä laite lähetä sitä uudelleen.
    if (!layout || i === -1) {
      hylatyt.push({ layout: kortti.layout, nro: kortti.nro, syy: 'layout' });
      vieraat.push([aika, `Layout ${kortti.layout}`, kortti.nro, laite, kortti.versio, '', kortti.merkit, `LAYOUT EI KISASSA (RYHMÄ ${ryhma}): EI TALLENNETTU`]);
      return;
    }
    // Asemataulukkoa muutettu: laite hakee layoutit uudelleen, sovittaa kortin ja lähettää sen uudelleen.
    if (!onkoRyhmaMerkit(kortti.merkit, layout.kohteita) || (kortti.jako && kortti.jako !== asemaJako(layout))) {
      hylatyt.push({ layout: kortti.layout, nro: kortti.nro, syy: 'kohteet' });
      return;
    }
    const vanha = lueRyhmaKorttiRivi((tallessa[i] || [])[0], layout);
    if (!ryhmassa.has(kortti.nro)) {
      hylatyt.push({ layout: kortti.layout, nro: kortti.nro, syy: 'ryhma' });
      vieraat.push([aika, `Layout ${layout.nro}`, kortti.nro, laite, kortti.versio, vanha?.merkit || '', kortti.merkit, `EI RYHMÄSSÄ ${ryhma}: EI TALLENNETTU`]);
      return;
    }
    kelvot.push({ kortti, layout, vanha });
  });

  if (!haltija) return { status: 409, body: { error: 'Päivitä sivu: kirjauksen uusi versio', paivita: true } };
  if (!onHaltija(haltija, rivi, { sheetId, sarake: kohde.tunnus, laite }, salaisuus())) {
    return radanJonossa(kohde.jono, () => korvatunRyhmaTallennus(request, sheetId, kohde, tabit, laite, kelvot, vieraat, aika));
  }

  // Liian kapea layoutin välilehti (asemataulukon kiekkoja lisätty) levennetään, ja otsikko kirjoitetaan aina
  // uudelleen (asemajako voi muuttua kiekkojen määrän pysyessä samana) samassa kirjoituksessa.
  const requests = [];
  const levennetyt = new Set();
  const otsikoidut = new Set();
  const tallennetut = [];
  const uudemmat = [];
  const kirjattavat = [];
  for (const { kortti, layout, vanha } of kelvot) {
    if (vanha && vanha.versio >= kortti.versio) {
      if (vanha.versio === kortti.versio && vanha.merkit === kortti.merkit) tallennetut.push({ layout: layout.nro, nro: kortti.nro });
      else {
        uudemmat.push({
          layout: layout.nro, nro: kortti.nro, merkit: vanha.merkit, versio: vanha.versio, kuitatut: vanha.kuitatut,
          hyvaksytty: Boolean(vanha.hyvaksytty), muuLaite: vanha.laite !== laite, aika: vanha.aika
        });
      }
      continue;
    }
    const tab = korttiTab(layout.nro);
    const otsikko = ryhmaKorttiOtsikko(layout);
    if (Number.isInteger(tab.sarakkeita) && tab.sarakkeita < otsikko.length && !levennetyt.has(tab.id)) {
      levennetyt.add(tab.id);
      requests.push({ appendDimension: { sheetId: tab.id, dimension: 'COLUMNS', length: otsikko.length - tab.sarakkeita } });
    }
    if (!otsikoidut.has(tab.id)) {
      otsikoidut.add(tab.id);
      requests.push(solut(tab, 0, 0, otsikko));
    }
    const hyvaksytty = hyvaksynta(kortti.hyvaksytty, vanha);
    requests.push(solut(tab, kortti.nro, 0, ryhmaKorttiRivi(layout, {
      ...kortti, nimi: ryhmassa.get(kortti.nro), laite, aika, ryhma, hyvaksytty
    })));
    kirjattavat.push({ kortti, layout, vanha, hyvaksytty });
    tallennetut.push({ layout: layout.nro, nro: kortti.nro });
  }
  // Suora tulos: aseman tulos, kun sen kiekot on merkitty ja ampuja on kuitannut sen.
  const tulokset = onSuoraan(speksit)
    ? await suoratTulokset(request, sheetId, meta, kirjattavat.flatMap(({ kortti, layout, vanha, hyvaksytty }) => {
      const vanhat = asemaTulokset(layout, vanha);
      return asemaTulokset(layout, { ...kortti, hyvaksytty }).map((a, j) => ({
        avain: ryhmanTunnus(kortti), nro: kortti.nro, sarake: a.sarake, vanha: vanhat[j].tulos, uusi: a.tulos
      }));
    }))
    : eiTuloksia();
  const lokirivit = (huomio) => [...vieraat, ...kirjattavat.map(({ kortti, layout, vanha }) => [aika, `Layout ${layout.nro}`,
    kortti.nro, laite, kortti.versio, vanha?.merkit || '', kortti.merkit,
    [`RYHMÄ ${ryhma}`, ...(kortti.hyvaksytty ? ['HYVÄKSYTTY'] : []), ...huomio(ryhmanTunnus(kortti))].join(', ')])];
  await kirjoitaTuloksin(request, sheetId, tabit.loki, requests, tulokset, lokirivit);
  if (levennetyt.size > 0) metaMuisti.delete(sheetId);
  const taydennykset = Object.keys(rivi.taydennykset).length > 0 ? { taydennykset: rivi.taydennykset } : {};
  return { status: 200, body: { tallennetut, uudemmat, hylatyt, ...taydennykset } };
}

// Hyväksynnän aika riville: laitteen aika, taulukossa jo oleva (true: laite sai hyväksynnän taulukosta) tai tyhjä.
// true ilman taulukon hyväksyntää (rivi tyhjennetty) ei keksi uutta aikaa: ampuja hyväksyy kortin uudelleen.
function hyvaksynta(hyvaksytty, vanha) {
  if (hyvaksytty === true) return vanha?.hyvaksytty || '';
  return hyvaksytty ? aikaleima(hyvaksytty) : '';
}

// --- Suora tulos (MOBIILI_TULOKSET = SUORAAN) ---

const eiTuloksia = () => ({ requests: [], huomiot: new Map() });

// Tulossolujen kirjoitukset kohteille [{ avain, nro, sarake, vanha, uusi }] (vanha / uusi: kortin edellinen ja uusi valmis
// tulos tai null). Pääsivu luetaan yhdellä spreadsheets.get-kutsulla soluina (syöte ja laskettu arvo), jotta kaavaa,
// taulukkokaavan aluetta tai paperilta kirjoitettua tulosta ei korvata. Palauttaa { requests, huomiot: Map(avain →
// [{ teksti, estetty? }]) }.
async function suoratTulokset(request, sheetId, meta, kohteet) {
  const tulos = eiTuloksia();
  const lisaa = (avain, huom) => tulos.huomiot.set(avain, [...(tulos.huomiot.get(avain) || []), huom]);
  const valitut = muuttuvat(kohteet);
  if (valitut.length === 0) return tulos;
  const paa = etsiValilehti(meta, PAA_VALILEHTI);
  if (!paa) {
    valitut.filter((k) => k.uusi !== null).forEach((k) => lisaa(k.avain, { teksti: `TULOS ${k.uusi} EI KIRJOITETTU: VÄLILEHTEÄ ${PAA_VALILEHTI} EI LÖYDY` }));
    return tulos;
  }
  const params = new URLSearchParams({ ranges: valilehtiAlue(paa.nimi), fields: 'sheets(data(rowData(values(userEnteredValue,effectiveValue))))' });
  const res = await request({ url: `${SHEETS}/${sheetId}?${params.toString()}` });
  const { rivit, tiedot } = paaSolut(res.data?.sheets?.[0]?.data?.[0]?.rowData);
  const paikat = tulosSolut(rivit, valitut);
  paikat.filter((k) => k.puuttuu && k.uusi !== null).forEach((k) => lisaa(k.avain, { teksti: `TULOS ${k.uusi} EI KIRJOITETTU: ${k.puuttuu}` }));
  const loydetyt = paikat.filter((k) => !k.puuttuu);
  const kaavoilla = kaavaSarakkeet(tiedot, [...new Set(loydetyt.map((k) => k.sarakeIndeksi))]);
  loydetyt.forEach((k) => {
    const solu = kaavoilla.has(k.sarakeIndeksi) ? { ...tiedot[k.rivi]?.[k.sarakeIndeksi], kaava: true } : tiedot[k.rivi]?.[k.sarakeIndeksi];
    const p = suoraTulos({ solu, vanha: k.vanha, uusi: k.uusi, sarake: k.sarake });
    if (p.huom) lisaa(k.avain, { teksti: p.huom, estetty: p.estetty });
    if (p.arvo !== undefined) tulos.requests.push(solut(paa, k.rivi, k.sarakeIndeksi, [p.arvo]));
  });
  return tulos;
}

// Kortit, tulossolut ja lokirivit yhdellä kirjoituksella. lokirivit(huomio) rakentaa lokirivit, huomio(avain) antaa kortin
// tuloshuomautukset tekstinä. Jos pääsivun kirjoitus torjutaan (suojattu alue: Sheets vastaa 400 tai 403), kortit
// tallennetaan silti ilman tuloksia ja loki kertoo sen; muu virhe toistuu uudelleenyrityksessä ja heitetään.
async function kirjoitaTuloksin(request, sheetId, loki, requests, tulokset, lokirivit) {
  const kirjoita = (lisat, huomio) => {
    const rivit = lokirivit(huomio);
    const kaikki = [...requests, ...lisat,
      ...(rivit.length > 0 ? [{ appendCells: { sheetId: loki.id, rows: rivit.map(riviSoluiksi), fields: 'userEnteredValue' } }] : [])];
    return kaikki.length > 0 ? batchUpdate(request, sheetId, kaikki) : null;
  };
  const huomiot = (avain) => tulokset.huomiot.get(avain) || [];
  try {
    await kirjoita(tulokset.requests, (avain) => huomiot(avain).map((h) => h.teksti));
  } catch (error) {
    if (tulokset.requests.length === 0 || ![400, 403].includes(googleStatus(error))) throw error;
    console.warn('[KIRJAUS] Tulossolujen kirjoitus torjuttiin, kortit tallennetaan ilman tuloksia:', googleViesti(error).slice(0, 300));
    await kirjoita([], (avain) => huomiot(avain).map((h) => h.estetty || h.teksti));
  }
}

async function tallennaRyhma(request, avain, req, res) {
  const tarkistettu = tarkistaRyhmaTallennus(runkoOf(req), onLaitetunnus);
  if (tarkistettu.virhe) return laheta(res, 400, { error: tarkistettu.virhe });
  const tulos = await uudelleenPoistetulla(avain, () => tallennaRyhmaKerran(request, avain, tarkistettu));
  return laheta(res, tulos.status, tulos.body);
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
async function lueHaltija(request, avain, kohde) {
  let tabit;
  if (kohde.ryhma) {
    const meta = await varmista(request, avain.sheetId, [lokiTarve, haltijaTarve(kohde)]);
    tabit = { loki: etsiValilehti(meta, LOKI_VALILEHTI), laitteet: etsiValilehti(meta, kohde.tab) };
  } else {
    tabit = await varmistaValilehdet(request, avain.sheetId, avain.sarake);
  }
  const [rivit] = await batchGet(request, avain.sheetId, [laiteAlue(tabit.laitteet, kohde.rivi)], 'UNFORMATTED_VALUE');
  return { tabit, rivi: lueLaiteRivi((rivit || [])[0], { ryhma: kohde.ryhma }) };
}

const lokinKohde = (kohde) => (kohde.ryhma ? `RYHMÄ ${kohde.rivi}` : kohde.rivi);

async function vaihdaHaltija(request, sheetId, kohde, tabit, uusi, { laite, teksti }, lisat = []) {
  await batchUpdate(request, sheetId, [
    solut(tabit.laitteet, kohde.rivi, 0, haltijaRivi(kohde.rivi, uusi)),
    ...lisat,
    { appendCells: { sheetId: tabit.loki.id, rows: [riviSoluiksi([uusi.otettu, lokinKohde(kohde), '', laite, '', '', '', teksti])], fields: 'userEnteredValue' } }
  ]);
}

// Saman radan tai ryhmän haltijarivin luku-kirjoitukset (otot, korvatun laitteen täydennykset) jonossa tässä palvelinilmentymässä.
const jonot = new Map();
async function radanJonossa(tunnus, toimi) {
  const edellinen = jonot.get(tunnus) || Promise.resolve();
  const tama = edellinen.catch(() => {}).then(toimi);
  jonot.set(tunnus, tama);
  try {
    return await tama;
  } finally {
    if (jonot.get(tunnus) === tama) jonot.delete(tunnus);
  }
}

const TAVAT = {
  vapaa: 'vapaa rata', siirto: 'siirto edelliseltä laitteelta', pin: 'kilpailutoimiston PIN-koodi'
};

// Ottaa radan tai ryhmän tälle laitteelle: vapaa suoraan, sama laite saa avaimensa uudelleen, varattu edellisen
// laitteen siirtoavaimella tai radan vaihto-PIN-koodilla (väärät PIN-koodit lasketaan; MAKS_PIN_VIRHEET lukitsee vaihdon,
// kunnes kilpailutoimisto avaa PIN-koodit ScoringLibin valikosta). Ryhmä samoin: sen PIN lasketaan tunnuksella
// "r<ryhmä>", jotta vahingossa avattu ryhmäkoodi ei vie ryhmää kirjaajalta.
async function ota(request, avain, req, res) {
  const kohde = kohdeOf(avain);
  // Saman radan otot jonossa tässä palvelinilmentymässä: rinnakkaiset väärät PIN-koodit lasketaan kaikki.
  return radanJonossa(kohde.jono, () => otaJonossa(request, avain, kohde, req, res));
}

async function otaJonossa(request, avain, kohde, req, res) {
  const runko = runkoOf(req);
  const laite = typeof runko?.laite === 'string' ? runko.laite : '';
  if (!onLaitetunnus(laite)) return laheta(res, 400, { error: 'Laitteen tunnus puuttuu' });
  const pin = typeof runko?.pin === 'string' ? runko.pin.trim() : '';
  const siirto = typeof runko?.siirto === 'string' ? runko.siirto.slice(0, 200) : '';
  const nimi = laitteenNimi(runko?.nimi);
  const { sheetId } = avain;
  const tunnus = { sheetId, sarake: kohde.tunnus };

  return uudelleenPoistetulla(avain, async () => {
    const { tabit, rivi } = await lueHaltija(request, avain, kohde);
    const vastaa = (uusiRivi) => laheta(res, 200, {
      haltija: haltijaAvain({ ...tunnus, sukupolvi: uusiRivi.sukupolvi, laite }, salaisuus()),
      tila: julkinenHaltija(uusiRivi, laite),
      linja: rivi.linja
    });
    if (rivi.laite === laite) return vastaa(rivi);

    let tapa = null;
    if (!rivi.laite) tapa = 'vapaa';
    else if (siirto && onHaltija(siirto, rivi, { ...tunnus, laite: rivi.laite }, salaisuus())) tapa = 'siirto';
    else if (pin) {
      if (rivi.pinVirheet >= MAKS_PIN_VIRHEET) {
        return laheta(res, 423, { error: 'Liian monta väärää PIN-koodia. Kilpailutoimisto avaa vaihdon näyttämällä PIN-koodit uudelleen.', haltija: julkinenHaltija(rivi, laite) });
      }
      if (pin !== vaihtoPin({ sheetId, sarake: kohde.tunnus, sukupolvi: rivi.sukupolvi }, salaisuus())) {
        const virheet = rivi.pinVirheet + 1;
        await batchUpdate(request, sheetId, [solut(tabit.laitteet, kohde.rivi, 6, [virheet])]);
        return laheta(res, 403, { error: 'Väärä PIN-koodi', yrityksia: Math.max(0, MAKS_PIN_VIRHEET - virheet), haltija: julkinenHaltija({ ...rivi, pinVirheet: virheet }, laite) });
      }
      tapa = 'pin';
    }
    if (!tapa) {
      const error = kohde.ryhma ? 'Ryhmää kirjaa toinen puhelin' : 'Rata on käytössä toisella laitteella';
      return laheta(res, 409, { error, varattu: true, haltija: julkinenHaltija(rivi, laite) });
    }

    const tapaTeksti = tapa === 'vapaa' && kohde.ryhma ? 'vapaa ryhmä' : TAVAT[tapa];
    const uusi = { sukupolvi: rivi.sukupolvi + 1, laite, nimi, otettu: aikaleima(), tapa: tapaTeksti, pinVirheet: 0, linja: rivi.linja };
    const otettu = kohde.ryhma ? 'RYHMÄ OTETTU' : 'RATA OTETTU';
    await vaihdaHaltija(request, sheetId, kohde, tabit, uusi, { laite, teksti: `${otettu}: ${tapaTeksti}${rivi.laite ? ` (edellinen ${rivi.nimi || rivi.laite})` : ''}` });
    return vastaa(uusi);
  });
}

// Haltija luovuttaa radan tai ryhmän: seuraava laite saa sen ilman PIN-koodia. Radan linjan tila tallennetaan samalla.
async function vapauta(request, avain, req, res) {
  const kohde = kohdeOf(avain);
  const runko = runkoOf(req);
  const laite = typeof runko?.laite === 'string' ? runko.laite : '';
  if (!onLaitetunnus(laite)) return laheta(res, 400, { error: 'Laitteen tunnus puuttuu' });
  let linja = null;
  if (runko?.linja !== undefined && !kohde.ryhma) {
    const t = tarkistaLinja(runko.linja);
    if (t.virhe) return laheta(res, 400, { error: t.virhe });
    linja = t.linja;
  }
  return uudelleenPoistetulla(avain, async () => {
    const { tabit, rivi } = await lueHaltija(request, avain, kohde);
    if (!onHaltija(runko?.haltija, rivi, { sheetId: avain.sheetId, sarake: kohde.tunnus, laite }, salaisuus())) {
      const error = kohde.ryhma ? 'Tämä puhelin ei enää kirjaa ryhmää' : 'Tämä laite ei ole enää radan laite';
      return laheta(res, 409, { error, korvattu: true, haltija: julkinenHaltija(rivi, laite) });
    }
    const uusi = { sukupolvi: rivi.sukupolvi + 1, laite: '', nimi: '', otettu: aikaleima(), tapa: 'luovutettu', pinVirheet: 0 };
    const teksti = `${kohde.ryhma ? 'RYHMÄ' : 'RATA'} LUOVUTETTU (${rivi.nimi || laite})`;
    await vaihdaHaltija(request, avain.sheetId, kohde, tabit, uusi, { laite, teksti },
      linja ? [solut(tabit.laitteet, kohde.rivi, LINJA_SARAKE, [JSON.stringify(linja), uusi.otettu])] : []);
    return laheta(res, 200, { vapautettu: true });
  });
}

let valitsin = null;
const kirjuriValitsin = () => {
  if (!valitsin) valitsin = luoKirjuriValitsin({ haeAsiakas: haeKirjuriAsiakas, maara: kirjurienMaara() });
  return valitsin;
};

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
    const ryhmalle = avain.ryhma !== undefined;
    // Rata tai ryhmä käyttää aina samaa kirjuritiliä, jotta kisan laitteet jakautuvat tilien kiintiöille.
    const request = kirjuriValitsin()(avain.sheetId, ryhmalle ? `r${avain.ryhma}` : avain.sarake);
    if (toiminto === 'avaa') {
      const laite = String(req.headers?.['x-kirjaus-laite'] || '');
      const haltija = String(req.headers?.['x-kirjaus-haltija'] || '');
      const tiedot = { laite: onLaitetunnus(laite) ? laite : '', haltija };
      return await (ryhmalle ? avaaRyhma : avaa)(request, avain, tiedot, res);
    }
    if (toiminto === 'ota') return await ota(request, avain, req, res);
    if (toiminto === 'vapauta') return await vapauta(request, avain, req, res);
    return await (ryhmalle ? tallennaRyhma : tallenna)(request, avain, req, res);
  } catch (error) {
    return lahetaGoogleVirhe(res, error, error?.kirjausVaihe);
  }
}

// Testejä varten.
export function tyhjennaKirjausMuisti() {
  metaMuisti.clear();
}
