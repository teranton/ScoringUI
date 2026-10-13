// Välilehtien haku Sheets API:n values:batchGet-kutsulla ja muunto CSV:ksi.
// CSV pidetään frontendin muotona, jotta kaikki nykyiset jäsentimet toimivat sellaisinaan.

const VALILEHTI_TTL_MS = 10 * 60 * 1000;
const valilehtiCache = new Map();

const normalisoi = (nimi) => String(nimi || '').trim().toLowerCase();

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
  valilehtiCache.set(sheetId, { nimet, haettu: Date.now() });
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
    csvByName[pyydetty] = rivitCsvksi(valueRanges[i]?.values || []);
  });
  return csvByName;
}

const onAlueVirhe = (error) => Number(error?.response?.status || error?.status || error?.code) === 400;

// Hakee pyydetyt välilehdet yhdellä batchGet-kutsulla. Jos välilehtilistaa ei ole muistissa,
// pyydetään kaikkia nimiä suoraan ja haetaan lista rinnalla; puuttuva välilehti (400) haetaan uudelleen listan avulla.
export async function haeValilehdetCsv({ request, sheetId, nimet, nyt = Date.now() }) {
  const muistissa = valilehtiCache.get(sheetId);
  const tuoreLista = muistissa && (nyt - muistissa.haettu) < VALILEHTI_TTL_MS ? muistissa.nimet : null;

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

  if (listaLupaus) {
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
  valilehtiCache.clear();
}
