// Välilehtien haku Sheets API:n values:batchGet-kutsulla ja muunto CSV:ksi.
// CSV pidetään frontendin muotona, jotta kaikki nykyiset jäsentimet toimivat sellaisinaan.

import { luoValimuisti } from './valimuisti.js';

const VALILEHTI_TTL_MS = 10 * 60 * 1000;
// Pienet joukot (päättyneen kisan 3 välilehteä, pelkkä KISANSPEKSIT) löytyvät lähes aina, joten ne pyydetään
// suoraan. Live-joukossa on aikataulujen vaihtoehtoisia nimiä, joista osa puuttuu aina: se odottaa välilehtilistaa.
const SUORA_HAKU_MAKS = 4;
// Mobiilikirjaus luo MOBIILI-välilehdet kesken kisan (api/kirjaus.js). Jos pyydetty MOBIILI-välilehti puuttuu
// listasta, lista haetaan uudelleen, kun se on tätä vanhempi: muuten instanssi, jonka lista on vanha, antaa
// välilehden puuttuvana vielä 10 min, ja Radat live välkkyy eri instanssien vastausten välillä.
const MOBIILI_LISTA_MS = 60 * 1000;
const onMobiiliValilehti = (nimi) => /^mobiili[ _]/i.test(String(nimi || '').trim());
const valilehtiCache = luoValimuisti('valilehdet');

const normalisoi = (nimi) => String(nimi || '').normalize('NFC').trim().toLowerCase();

// Välilehdet, joita frontend lukee (contract/sheet-layout.md). API ei anna muita välilehtiä,
// koska taulukoissa on myös tietoja, joita ei julkaista (esim. Suomisport-tuonti ja Sportti-ID:t).
export const SALLITUT_VALILEHDET = [
  'KISANSPEKSIT', 'Tulokset Y', 'NEW_Joukkue', 'Ryhmäjako', 'Ilmoittautuneet',
  'Aikataulu', 'Aikataulu La', 'Aikataulu Su'
];
const sallitutNormalisoituna = new Map(SALLITUT_VALILEHDET.map((nimi) => [normalisoi(nimi), nimi]));
// Kauden rankingin välilehdet: tulokset (RANKING_2026 ...) ja kisojen nimet (KISAT).
// api/kisa.js antaa ne vain rekisterissä rankingiksi (H = RANKING) merkitystä taulukosta.
const RANKING_VALILEHTI = /^ranking_\d{4}$/;

export function onRankingValilehti(nimi) {
  const normalisoitu = normalisoi(nimi);
  return RANKING_VALILEHTI.test(normalisoitu) || normalisoitu === 'kisat';
}

// Mobiilikirjauksen välilehdet julkisiin näkymiin vain alla luetelluin sarakkein (otsikon mukaan):
// Compak-kortit (MOBIILI Rata N) ilman laitetta ja versiota ratanäkymälle (src/LiveRadat.jsx), radan laitteista
// (MOBIILI_LAITTEET) vain linjan tila, ryhmäkorteista (MOBIILI Layout N) numero, nimi, asemien osumat ja kiekot
// tulosten kiekkonäkymälle (src/HenkiloTulokset.jsx) ja ryhmäpuhelimista (MOBIILI_RYHMAT) vain ryhmän numero
// (onko ryhmäkortteja). Laitteiden tunnukset, haltijan nimi, PIN-virheet ja täydennykset eivät lähde API:sta.
const KOHDE = Array.from({ length: 25 }, (_, i) => String(i + 1));
const JULKISET_SARAKKEET = [
  { valilehti: /^mobiili rata \d{1,3}$/, sarake: (o) => ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', ...KOHDE].includes(o) },
  { valilehti: /^mobiili_laitteet$/, sarake: (o) => ['RATA', 'LINJA', 'LINJA PÄIVITETTY'].includes(o) },
  { valilehti: /^mobiili layout \d{1,2}$/, sarake: (o) => o === 'NRO' || o === 'NIMI' || /^ASEMA \d+$/.test(o) || /^\d+\/\d+$/.test(o) },
  { valilehti: /^mobiili_ryhmat$/, sarake: (o) => o === 'RYHMÄ' }
];

function julkisetSarakkeetValilehdelle(nimi) {
  const normalisoitu = normalisoi(nimi);
  return JULKISET_SARAKKEET.find((j) => j.valilehti.test(normalisoitu))?.sarake || null;
}

// Mobiilikirjauksen välilehtien nimet frontendin kirjoitusasussa (src/utils/mobiiliLive.js, HenkiloTulokset.jsx).
const MOBIILI_NIMET = [
  [/^mobiili rata (\d{1,3})$/, (n) => `MOBIILI Rata ${Number(n)}`],
  [/^mobiili layout (\d{1,2})$/, (n) => `MOBIILI Layout ${Number(n)}`],
  [/^mobiili_laitteet$/, () => 'MOBIILI_LAITTEET'],
  [/^mobiili_ryhmat$/, () => 'MOBIILI_RYHMAT']
];

// Sallitun välilehden nimi frontendin kirjoitusasussa ('tulokset y ' → 'Tulokset Y', 'ranking_2026' → 'RANKING_2026',
// 'mobiili rata 3' → 'MOBIILI Rata 3'), muuten tyhjä. Vastauksen avaimet ovat tätä muotoa, joten eri kirjoitusasulla
// tehty pyyntö ei täytä välimuistia ja Blob-kuvaa avaimilla, joita frontend ei löydä.
export function kanoninenValilehti(nimi) {
  const normalisoitu = normalisoi(nimi);
  if (sallitutNormalisoituna.has(normalisoitu)) return sallitutNormalisoituna.get(normalisoitu);
  if (onRankingValilehti(nimi)) return normalisoitu.toUpperCase();
  for (const [kuvio, nimeksi] of MOBIILI_NIMET) {
    const osuma = normalisoitu.match(kuvio);
    if (osuma && julkisetSarakkeetValilehdelle(nimi)) return nimeksi(osuma[1]);
  }
  return '';
}

export function onSallittuValilehti(nimi) {
  return Boolean(kanoninenValilehti(nimi));
}

// Rajatun välilehden rivit vain julkisin sarakkein (otsikkorivin mukaan, järjestys säilyy). Muut sellaisinaan.
export function julkisetSarakkeet(nimi, rivit) {
  const sallitut = julkisetSarakkeetValilehdelle(nimi);
  if (!sallitut || !Array.isArray(rivit) || rivit.length === 0) return rivit;
  const otsikko = Array.isArray(rivit[0]) ? rivit[0] : [];
  const pidettavat = otsikko
    .map((solu, i) => (sallitut(String(solu ?? '').trim().toUpperCase()) ? i : -1))
    .filter((i) => i !== -1);
  return rivit.map((rivi) => pidettavat.map((i) => (Array.isArray(rivi) ? rivi[i] ?? '' : '')));
}

function csvKentta(arvo) {
  const teksti = arvo == null ? '' : String(arvo);
  return /[",\r\n]|^\s|\s$/.test(teksti) ? `"${teksti.replace(/"/g, '""')}"` : teksti;
}

// Sheets API jättää rivien lopun tyhjät solut pois; rivit täytetään samaan leveyteen kuin CSV-viennissä.
export function rivitCsvksi(rivit) {
  if (!Array.isArray(rivit) || rivit.length === 0) return '';
  const leveys = rivit.reduce((max, rivi) => Math.max(max, Array.isArray(rivi) ? rivi.length : 0), 0);
  return rivit
    .map((rivi) => {
      const solut = Array.isArray(rivi) ? rivi : [];
      return Array.from({ length: leveys }, (_, i) => csvKentta(solut[i])).join(',');
    })
    .join('\n');
}

// A1-alue koko välilehdelle: nimi lainausmerkkeihin, heittomerkit tuplattuina.
export function valilehtiAlue(nimi) {
  return `'${String(nimi).replace(/'/g, "''")}'`;
}

// Yhdistää pyydetyt nimet taulukon todellisiin välilehtiin (kirjainkoko ja reunavälit ohitetaan).
export function kohdistaValilehdet(pyydetyt, todelliset) {
  const todellisetNormalisoituna = new Map(todelliset.map((nimi) => [normalisoi(nimi), nimi]));
  const loydetyt = [];
  const puuttuvat = [];
  for (const pyydetty of pyydetyt) {
    const todellinen = todellisetNormalisoituna.get(normalisoi(pyydetty));
    if (todellinen === undefined) puuttuvat.push(pyydetty);
    else loydetyt.push({ pyydetty, todellinen });
  }
  return { loydetyt, puuttuvat };
}

async function haeValilehtienNimet(request, sheetId) {
  const res = await request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title))`
  });
  const nimet = (res.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
  await valilehtiCache.aseta(sheetId, nimet);
  return nimet;
}

async function batchGet(request, sheetId, kohteet) {
  if (kohteet.length === 0) return {};
  const params = new URLSearchParams();
  kohteet.forEach(({ todellinen }) => params.append('ranges', valilehtiAlue(todellinen)));
  params.append('valueRenderOption', 'FORMATTED_VALUE');
  params.append('majorDimension', 'ROWS');
  const res = await request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params.toString()}`
  });
  const valueRanges = res.data.valueRanges || [];
  const csvByName = {};
  kohteet.forEach(({ pyydetty }, i) => {
    csvByName[pyydetty] = rivitCsvksi(julkisetSarakkeet(pyydetty, valueRanges[i]?.values || []));
  });
  return csvByName;
}

const onAlueVirhe = (error) => Number(error?.response?.status || error?.status || error?.code) === 400;

// Hakee pyydetyt välilehdet yhdellä batchGet-kutsulla. Jos välilehtilistaa ei ole muistissa, se haetaan;
// pienet joukot pyydetään samalla suoraan, ja puuttuva välilehti (400) haetaan uudelleen listan avulla.
export async function haeValilehdetCsv({ request, sheetId, nimet, nyt = Date.now() }) {
  const muistissa = await valilehtiCache.hae(sheetId);
  let tuoreLista = muistissa && (nyt - muistissa.tallennettu) < VALILEHTI_TTL_MS ? muistissa.arvo : null;

  const mobiiliPuuttuu = (lista) => kohdistaValilehdet(nimet, lista).puuttuvat.some(onMobiiliValilehti);
  if (tuoreLista && mobiiliPuuttuu(tuoreLista) && (nyt - muistissa.tallennettu) >= MOBIILI_LISTA_MS) {
    tuoreLista = null;
  }

  if (tuoreLista) {
    const { loydetyt, puuttuvat } = kohdistaValilehdet(nimet, tuoreLista);
    try {
      return { csvByName: await batchGet(request, sheetId, loydetyt), notFound: puuttuvat };
    } catch (error) {
      if (!onAlueVirhe(error)) throw error;
      // Välilehti on nimetty uudelleen tai poistettu listan haun jälkeen: haetaan lista uudelleen.
    }
  }

  const listaLupaus = tuoreLista ? null : haeValilehtienNimet(request, sheetId);
  listaLupaus?.catch(() => {});

  if (listaLupaus && nimet.length <= SUORA_HAKU_MAKS) {
    try {
      const suoraan = nimet.map((nimi) => ({ pyydetty: nimi, todellinen: nimi }));
      return { csvByName: await batchGet(request, sheetId, suoraan), notFound: [] };
    } catch (error) {
      if (!onAlueVirhe(error)) throw error;
    }
  }

  const lista = listaLupaus ? await listaLupaus : await haeValilehtienNimet(request, sheetId);
  const { loydetyt, puuttuvat } = kohdistaValilehdet(nimet, lista);
  return { csvByName: await batchGet(request, sheetId, loydetyt), notFound: puuttuvat };
}

export function tyhjennaValilehtiCache() {
  return valilehtiCache.tyhjenna();
}
