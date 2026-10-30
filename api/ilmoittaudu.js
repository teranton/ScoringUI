// api/ilmoittaudu.js
// Ilmoittautumislomake (src/IlmoittautumisLomake.jsx): POST lisää ilmoittautumisen kisan ILMOITTAUTUMISET-välilehdelle.
// Käytössä vain, kun KISANSPEKSIT ILMOITTAUTUMINEN = LOMAKE, ja auki ILMOITTAUTUMINEN_PAATTYY-hetkeen tai kisan
// alkupäivään asti (src/utils/ilmoittautumiset.js). Kirjoittaa mobiilikirjauksen kirjuripalvelutilillä (KIRJURI_*),
// joka on muokkaaja vain kisoissa, joissa lomake tai mobiilikirjaus on sallittu (ScoringLib). Pääsivulle
// (OSALLISTUJAT+TULOKSET) ei kirjoiteta: kilpailutoimisto siirtää ilmoittautumiset ScoringLibin valikosta.
// Roskapostin torjunta: piilokenttä (botti täyttää, vastaus näyttää onnistuneelta mutta mitään ei kirjoiteta),
// lomakkeen täyttöaika vähintään MIN_KESTO_MS, rajoitus per IP (yritykset) ja per kisa (tallennetut, instanssin muistissa) ja saman nimen
// toinen ilmoittautuminen torjutaan. IP-osoitetta ei tallenneta.
import dotenv from 'dotenv';
dotenv.config();

import { onSallittuSheetId, normalisoiSheetId } from './_lib/sheetAllowlist.js';
import { haeKirjuriAsiakas, onKiintioVirhe, onKirjuriMaaritetty, pyyntoUudelleenyrittaen } from './_lib/googleAuth.js';
import { kohdistaValilehdet, valilehtiAlue } from './_lib/sheetsData.js';
import {
  GOOGLE_LOMAKE, LAHDE_VALILEHDET, LOMAKE_OTSIKKO, LOMAKE_VALILEHTI, lahteenIlmoittautuneet, lomakkeenNimi, lomakkeenTila, nimiAvain,
  tarkistaLomake
} from '../src/utils/ilmoittautumiset.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const uusiId = () => 100000000 + Math.floor(Math.random() * 1900000000);
export const MIN_KESTO_MS = 4000;
const IKKUNA_MS = 10 * 60 * 1000;
export const MAKS_PER_IP = 10;
export const MAKS_PER_KISA = 40;

const googleStatus = (error) => Number(error?.response?.status || error?.status || error?.code);
const googleViesti = (error) => JSON.stringify(error?.response?.data || error?.message || '');

// Liukuva ikkuna: tilaa(avain, maks, nyt) kertoo, mahtuuko uusi kirjaus, kirjaa(avain, nyt) kirjaa sen.
// sallittu(avain, maks, nyt) tekee molemmat.
export function luoRajoitin(ikkunaMs = IKKUNA_MS) {
  const kirjaukset = new Map();
  const tuoreet = (avain, nyt) => (kirjaukset.get(avain) || []).filter((t) => nyt - t < ikkunaMs);
  const rajoitin = {
    tilaa(avain, maks, nyt = Date.now()) {
      return tuoreet(avain, nyt).length < maks;
    },
    kirjaa(avain, nyt = Date.now()) {
      const lista = tuoreet(avain, nyt);
      lista.push(nyt);
      kirjaukset.set(avain, lista);
      if (kirjaukset.size > 5000) kirjaukset.delete(kirjaukset.keys().next().value);
    },
    sallittu(avain, maks, nyt = Date.now()) {
      if (!rajoitin.tilaa(avain, maks, nyt)) return false;
      rajoitin.kirjaa(avain, nyt);
      return true;
    },
    tyhjenna() {
      kirjaukset.clear();
    }
  };
  return rajoitin;
}

const rajoitin = luoRajoitin();

// Asiakkaan IP: Cloudflaren takana cf-connecting-ip (kaikki käyttäjät tulevat Cloudflaren osoitteista), muuten Vercelin
// x-real-ip / x-forwarded-for. Suoraan Verceliin tehty pyyntö voi väärentää cf-connecting-ip:n ja kiertää IP-rajan,
// mutta kisan oma raja, kaksoiskappaleiden torjunta ja piilokenttä pätevät silti.
export function asiakkaanIp(headers = {}) {
  const cf = String(headers['cf-connecting-ip'] || '').trim();
  const vercel = String(headers['x-real-ip'] || String(headers['x-forwarded-for'] || '').split(',')[0]).trim();
  return cf || vercel || 'tuntematon';
}

function runkoOf(req) {
  if (typeof req.body !== 'string') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

async function valilehdet(request, sheetId) {
  const res = await request({ url: `${SHEETS}/${sheetId}?fields=sheets(properties(title,sheetId))` });
  return (res.data.sheets || []).map((s) => ({ nimi: s.properties?.title, id: s.properties?.sheetId })).filter((v) => v.nimi);
}

async function batchGet(request, sheetId, nimet) {
  if (nimet.length === 0) return [];
  const params = new URLSearchParams();
  nimet.forEach((nimi) => params.append('ranges', valilehtiAlue(nimi)));
  params.append('valueRenderOption', 'FORMATTED_VALUE');
  const res = await request({ url: `${SHEETS}/${sheetId}/values:batchGet?${params.toString()}` });
  return (res.data.valueRanges || []).map((v) => v.values || []);
}

// Ilmoittautuneet-välilehden nimet (otsikko "NIMI" ensimmäisillä riveillä; master-pohjassa otsikko on rivillä 2).
export function ilmoittautuneidenNimet(rivit) {
  const otsikkoRivi = rivit.findIndex((r) => (r || []).some((s) => String(s ?? '').trim().toUpperCase() === 'NIMI'));
  if (otsikkoRivi === -1) return [];
  const sarake = rivit[otsikkoRivi].findIndex((s) => String(s ?? '').trim().toUpperCase() === 'NIMI');
  return rivit.slice(otsikkoRivi + 1).map((r) => String((r || [])[sarake] ?? '').trim()).filter((n) => n && !/^\d+$/.test(n));
}

const aikaleima = (nyt) => new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
}).format(nyt).replace(' klo', '');

// Ilmoittautumisen käsittely ilman HTTP:tä (testit). Palauttaa { status, body }.
export async function ilmoittaudu({ request, sheetId, kisa, runko, nyt = new Date() }) {
  const lista = await valilehdet(request, sheetId);
  const nimet = lista.map((v) => v.nimi);
  // Duplikaattitarkistukseen kaikki Google-lomakkeen vastausvälilehdet (Lomakevastaukset 2 ... uudelleenlinkityksen jälkeen).
  const lahteet = [...new Set([...LAHDE_VALILEHDET, ...nimet.filter((n) => GOOGLE_LOMAKE.test(String(n).trim()))])];
  const kohteet = kohdistaValilehdet(['KISANSPEKSIT', 'Ilmoittautuneet', ...lahteet], nimet).loydetyt;
  const arvot = await batchGet(request, sheetId, kohteet.map((k) => k.todellinen));
  const rivit = (nimi) => arvot[kohteet.findIndex((k) => k.pyydetty === nimi)] || [];

  const tila = lomakkeenTila(rivit('KISANSPEKSIT'), kisa?.alkuPvm, nyt);
  if (!tila.kaytossa) return { status: 403, body: { koodi: 'eiKaytossa', error: 'Ilmoittautumislomake ei ole käytössä tässä kisassa' } };
  if (!tila.auki) return { status: 403, body: { koodi: 'suljettu', error: 'Ilmoittautuminen on päättynyt' } };

  const { kentat, virheet } = tarkistaLomake(runko, tila.sarjat);
  if (Object.keys(virheet).length) return { status: 400, body: { koodi: 'virheet', virheet, error: 'Tarkista lomakkeen tiedot' } };

  const nimi = lomakkeenNimi(kentat.sukunimi, kentat.etunimi);
  const olemassa = new Set([
    ...ilmoittautuneidenNimet(rivit('Ilmoittautuneet')),
    // Myös siirretyt lomakerivit: sama ampuja ei ilmoittaudu kahdesti, vaikka nimi olisi korjattu pääsivulla.
    ...lahteet.flatMap((n) => lahteenIlmoittautuneet(rivit(n), { myosSiirretyt: true }).map((o) => o.nimi))
  ].map(nimiAvain));
  if (olemassa.has(nimiAvain(nimi))) return { status: 409, body: { koodi: 'kaksoiskappale', error: 'Tällä nimellä on jo ilmoittauduttu' } };

  if (!kohteet.some((k) => k.pyydetty === LOMAKE_VALILEHTI)) {
    const id = uusiId();
    // Välilehti ja otsikko yhdessä kutsussa: samanaikainen ilmoittautuja ei voi kirjoittaa riviä niiden väliin.
    try {
      await request({
        url: `${SHEETS}/${sheetId}:batchUpdate`,
        method: 'POST',
        data: { requests: [
          { addSheet: { properties: { sheetId: id, title: LOMAKE_VALILEHTI, gridProperties: { rowCount: 2, columnCount: LOMAKE_OTSIKKO.length, frozenRowCount: 1 } } } },
          { updateCells: { start: { sheetId: id, rowIndex: 0, columnIndex: 0 }, rows: [{ values: LOMAKE_OTSIKKO.map((o) => ({ userEnteredValue: { stringValue: o } })) }], fields: 'userEnteredValue' } }
        ] }
      });
    } catch (error) {
      // Toinen ilmoittautuja ehti luoda välilehden samaan aikaan.
      if (!(googleStatus(error) === 400 && /already exists/i.test(googleViesti(error)))) throw error;
    }
  }
  const lomake = kohteet.find((k) => k.pyydetty === LOMAKE_VALILEHTI)?.todellinen || LOMAKE_VALILEHTI;
  const otsikko = (rivit(LOMAKE_VALILEHTI)[0] || LOMAKE_OTSIKKO).map((o) => String(o ?? '').trim().toUpperCase());
  // Sarakkeet otsikon mukaan: järjestäjä voi siirtää tai lisätä sarakkeita.
  const arvo = {
    AIKALEIMA: aikaleima(nyt), SUKUNIMI: kentat.sukunimi, ETUNIMI: kentat.etunimi, NIMI: nimi, SARJA: kentat.sarja,
    SEURA: kentat.seura, SÄHKÖPOSTI: kentat.sahkoposti, PUHELIN: kentat.puhelin, LISÄTIETOJA: kentat.lisatietoja, SIIRRETTY: ''
  };
  const rivi = (otsikko.some((o) => o in arvo) ? otsikko : LOMAKE_OTSIKKO).map((o) => arvo[o] ?? '');
  // RAW: teksti tallentuu sellaisenaan (ei kaavoja eikä päivämäärätulkintaa); INSERT_ROWS ei kirjoita olemassa olevan päälle.
  await request({
    url: `${SHEETS}/${sheetId}/values/${encodeURIComponent(`${valilehtiAlue(lomake)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: 'POST',
    data: { values: [rivi] }
  });
  return { status: 200, body: { ok: true, nimi, sarja: kentat.sarja, seura: kentat.seura } };
}

function laheta(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return laheta(res, 405, { error: 'Käytä POST-pyyntöä' });
  const runko = runkoOf(req);
  const sheetId = String(runko?.sheetId || '');
  if (!sheetId || normalisoiSheetId(sheetId) !== sheetId) return laheta(res, 400, { error: 'sheetId vaaditaan' });

  // Piilokenttä: ihminen ei näe sitä. Botille vastataan kuin onnistuneesti, jotta se ei opi kiertämään tarkistusta.
  if (String(runko?.kotisivu || '').trim()) return laheta(res, 200, { ok: true });
  const kesto = Number(runko?.kesto);
  if (!Number.isFinite(kesto) || kesto < MIN_KESTO_MS) return laheta(res, 400, { koodi: 'liianNopea', error: 'Lomake lähetettiin liian nopeasti' });

  if (!onKirjuriMaaritetty()) return laheta(res, 503, { koodi: 'eiKaytossa', error: 'Ilmoittautumista ei ole otettu käyttöön palvelimella' });

  let kisa;
  try {
    if (!(await onSallittuSheetId(sheetId))) return laheta(res, 403, { error: 'Taulukko ei ole kilpailurekisterissä' });
    kisa = onSallittuSheetId.kisa(sheetId);
  } catch (error) {
    console.error('[ILMOITTAUDU] Kilpailurekisterin haku epäonnistui:', error);
    return laheta(res, 503, { error: 'Kilpailurekisteriä ei saatu tarkistettua' });
  }

  // IP-raja laskee kaikki yritykset, kisan raja vain tallennetut ilmoittautumiset: hylätyt pyynnöt eivät sulje kisan lomaketta.
  const nyt = Date.now();
  const kisaAvain = `kisa:${sheetId}`;
  if (!rajoitin.sallittu(`ip:${asiakkaanIp(req.headers)}`, MAKS_PER_IP, nyt) || !rajoitin.tilaa(kisaAvain, MAKS_PER_KISA, nyt)) {
    res.setHeader('Retry-After', '600');
    return laheta(res, 429, { koodi: 'liianMonta', error: 'Liian monta ilmoittautumista lyhyessä ajassa' });
  }

  try {
    const asiakas = await haeKirjuriAsiakas();
    const request = (opts) => pyyntoUudelleenyrittaen((o) => asiakas.request(o), opts);
    const tulos = await ilmoittaudu({ request, sheetId, kisa, runko, nyt: new Date(nyt) });
    if (tulos.status === 200) rajoitin.kirjaa(kisaAvain, nyt);
    return laheta(res, tulos.status, tulos.body);
  } catch (error) {
    const status = googleStatus(error);
    if (onKiintioVirhe(error)) return laheta(res, 503, { error: 'Palvelu on ruuhkautunut, yritä hetken päästä' });
    if (status === 403 || status === 404) {
      return laheta(res, 403, { koodi: 'eiKaytossa', error: 'Ilmoittautumislomake ei ole käytössä tässä kisassa (taulukkoa ei ole jaettu)' });
    }
    console.error('[ILMOITTAUDU] Google-virhe:', status, googleViesti(error).slice(0, 500));
    return laheta(res, 502, { error: 'Ilmoittautumista ei saatu tallennettua' });
  }
}

// Testejä varten.
export function tyhjennaRajoitin() {
  rajoitin.tyhjenna();
}
