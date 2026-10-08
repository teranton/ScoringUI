import { parseCsvRows } from './csv.js';

// Arkin kyllä-merkinnät (pienillä kirjaimilla), joita kaikki totuusarvoasetukset hyväksyvät.
export const TOSI_ARVOT = ['1', 'true', 'yes', 'on', 'x'];

export function tulkitseTotuusarvo(arvo) {
  if (arvo == null) return false;
  const normalisoitu = String(arvo).trim().toLowerCase();
  return TOSI_ARVOT.includes(normalisoitu);
}

function normalizeSpeksiHeader(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function detectSpeksiColumnIndexes(speksiRivit) {
  const fallback = { asemaIdx: 9, maksimiIdx: 10, toiseksiParasIdx: 11, headerRowIdx: -1 };
  if (!Array.isArray(speksiRivit) || speksiRivit.length === 0) return fallback;

  const asemaMatchers = ['ASEMA', 'RATA', 'LANE', 'STATION'];
  const maksimiMatchers = ['MAKS', 'MAX', 'MAARA', 'COUNT'];
  const secondMatchers = ['TOISEKSI', 'SECOND', 'PARAS2', 'SECONDBEST'];

  const scanLimit = Math.min(8, speksiRivit.length);
  for (let rowIdx = 0; rowIdx < scanLimit; rowIdx++) {
    const row = speksiRivit[rowIdx];
    if (!Array.isArray(row) || row.length < 2) continue;

    const normalized = row.map(normalizeSpeksiHeader);
    const asemaIdx = normalized.findIndex((h) => asemaMatchers.some((token) => h.includes(token)));
    const maksimiIdx = normalized.findIndex((h) => maksimiMatchers.some((token) => h.includes(token)));

    if (asemaIdx === -1 || maksimiIdx === -1 || asemaIdx === maksimiIdx) {
      continue;
    }

    const toiseksiParasIdx = normalized.findIndex((h) => secondMatchers.some((token) => h.includes(token)));
    return {
      asemaIdx,
      maksimiIdx,
      toiseksiParasIdx: toiseksiParasIdx === -1 ? maksimiIdx + 1 : toiseksiParasIdx,
      headerRowIdx: rowIdx
    };
  }

  return fallback;
}

export function parseAsemaSpeksitRows(speksiRivit) {
  const asemaMaksimit = {};
  const asemaToiseksiParasKaytossa = {};

  if (!Array.isArray(speksiRivit) || speksiRivit.length === 0) {
    return {
      asemaMaksimit,
      asemaToiseksiParasKaytossa,
      ratkoPalkintoSija: ratkoPalkintoSijaOletus
    };
  }

  const { asemaIdx, maksimiIdx, toiseksiParasIdx, headerRowIdx } = detectSpeksiColumnIndexes(speksiRivit);

  speksiRivit.forEach((rivi, rowIdx) => {
    if (!rivi || rowIdx === headerRowIdx) return;

    const raakaAsema = rivi[asemaIdx];
    const raakaMaksimi = rivi[maksimiIdx];

    if (raakaAsema !== undefined && raakaAsema !== null && raakaMaksimi !== undefined && raakaMaksimi !== null) {
      const asemaTunnus = raakaAsema.toString().trim();
      const maksimiArvo = parseInt(raakaMaksimi, 10);
      const naytaToiseksiParas = tulkitseTotuusarvo(rivi[toiseksiParasIdx]);

      if (asemaTunnus && !Number.isNaN(maksimiArvo)) {
        const asemaNumero = asemaTunnus.replace(/\D/g, '');
        const avain = asemaNumero || asemaTunnus;
        asemaMaksimit[avain] = maksimiArvo;
        asemaToiseksiParasKaytossa[avain] = naytaToiseksiParas;
      }
    }
  });

  return {
    asemaMaksimit,
    asemaToiseksiParasKaytossa,
    ratkoPalkintoSija: haeRatkoPalkintoSija(speksiRivit)
  };
}

export function parseAsemaSpeksitCsv(speksitCsv) {
  const tyhja = {
    asemaMaksimit: {},
    asemaToiseksiParasKaytossa: {},
    ratkoPalkintoSija: ratkoPalkintoSijaOletus
  };

  if (!speksitCsv || typeof speksitCsv !== 'string' || speksitCsv.trim().length < 2) {
    return tyhja;
  }

  try {
    const speksiRivit = parseCsvRows(speksitCsv);
    return parseAsemaSpeksitRows(speksiRivit);
  } catch (error) {
    console.error('Virhe speksien parsinnoissa:', error);
    return tyhja;
  }
}

export const ratkoStatusPainot = {
  DNS: -1,
  DNF: -2,
  DNQ: -3,
  DSQ: -4
};

export const ratkoPalkintoSijaOletus = 3;

function haeRatkoPalkintoSija(speksiRivit) {
  const avainSanat = new Set(['RATKOPALKINTOSIJA', 'RATKO_PALKINTO_SIJA']);

  for (const rivi of speksiRivit) {
    if (!Array.isArray(rivi)) continue;

    const solut = rivi.map((solu) => String(solu || '').trim());
    const normalisoidut = solut.map((solu) => solu.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
    const avainIndeksi = normalisoidut.findIndex((avain) => avainSanat.has(avain));
    if (avainIndeksi === -1) continue;

    // Arvo luetaan vain avaimen viereisestä solusta; tyhjä tai virheellinen arvo -> oletus.
    const sija = Number.parseInt(solut[avainIndeksi + 1], 10);
    return Number.isInteger(sija) && sija > 0 ? sija : ratkoPalkintoSijaOletus;
  }

  return ratkoPalkintoSijaOletus;
}

export function puraRatkoArvo(arvo) {
  const teksti = String(arvo || '').trim().toUpperCase();
  if (!teksti) return { tyyppi: 'empty', piste: -9999 };

  const status = teksti.replace(/[^A-Z]/g, '');
  if (Object.prototype.hasOwnProperty.call(ratkoStatusPainot, status)) {
    return { tyyppi: 'status', piste: ratkoStatusPainot[status], status };
  }

  const numero = parseInt(teksti, 10);
  if (!Number.isNaN(numero)) {
    return { tyyppi: 'num', piste: numero };
  }

  return { tyyppi: 'text', piste: -5000, teksti };
}

export function muodostaRatkoNaytto(ratko1, ratko2) {
  const eka = String(ratko1 || '').trim();
  const toka = String(ratko2 || '').trim();
  if (eka && toka) return `${eka} + ${toka}`;
  return eka || toka || '';
}

export function muodostaRatkoNakyma(ratko1, ratko2) {
  const arvo1 = puraRatkoArvo(ratko1);
  const arvo2 = puraRatkoArvo(ratko2);

  const statusTunnisteet = [];
  if (arvo1.tyyppi === 'status' && arvo1.status) statusTunnisteet.push(arvo1.status);
  if (arvo2.tyyppi === 'status' && arvo2.status) statusTunnisteet.push(arvo2.status);

  const uniikitStatus = Array.from(new Set(statusTunnisteet));
  const naytto = muodostaRatkoNaytto(ratko1, ratko2);

  if (uniikitStatus.length > 0) {
    const osat = naytto
      .split('+')
      .map((s) => s.trim())
      .filter((s) => s && !uniikitStatus.includes(s.toUpperCase()));
    return { statusEtiketit: uniikitStatus, teksti: osat.join(' + ') };
  }

  return { statusEtiketit: [], teksti: naytto };
}

function haeCountbackSarja(ampuja) {
  if (Array.isArray(ampuja?.sarjat) && ampuja.sarjat.length > 0) {
    return ampuja.sarjat.map((sarja) => {
      const piste = parseInt(sarja?.tulos, 10);
      return Number.isNaN(piste) ? -9999 : piste;
    });
  }

  if (ampuja?.erat && typeof ampuja.erat === 'object') {
    return Object.keys(ampuja.erat)
      .map((avain) => Number(avain))
      .filter((avain) => Number.isFinite(avain))
      .sort((a, b) => a - b)
      .map((avain) => {
        const piste = parseInt(ampuja.erat[avain], 10);
        return Number.isNaN(piste) ? -9999 : piste;
      });
  }

  return [];
}

function vertaaCountbackSarjoja(ampujaA, ampujaB) {
  const sarjaA = haeCountbackSarja(ampujaA);
  const sarjaB = haeCountbackSarja(ampujaB);
  const pisin = Math.max(sarjaA.length, sarjaB.length);

  for (let i = pisin - 1; i >= 0; i--) {
    const arvoA = sarjaA[i] ?? -9999;
    const arvoB = sarjaB[i] ?? -9999;
    if (arvoA !== arvoB) return arvoB - arvoA;
  }

  return 0;
}

function onkoRatkoArvoAnnettu(ampuja) {
  const ratko1 = String(ampuja?.ratko || '').trim();
  const ratko2 = String(ampuja?.ratko2 || '').trim();
  return Boolean(ratko1 || ratko2);
}

export function laskeHenkilosijoitukset(
  ampujat,
  sarjaSuodatin = 'OPEN (Y)',
  ratkoSija = ratkoPalkintoSijaOletus
) {
  const onKaikkiNakyma = sarjaSuodatin === 'OPEN (Y)';
  const lajiteltuLista = onKaikkiNakyma
    ? [...ampujat]
    : ampujat.filter((ampuja) => String(ampuja.sarja || '').toUpperCase() === sarjaSuodatin.toUpperCase());

  lajiteltuLista.sort((a, b) => {
    const tulosA = parseInt(a.tulos, 10) || 0;
    const tulosB = parseInt(b.tulos, 10) || 0;
    if (tulosB !== tulosA) return tulosB - tulosA;

    const ratkoA = puraRatkoArvo(a.ratko);
    const ratkoB = puraRatkoArvo(b.ratko);
    if (ratkoB.piste !== ratkoA.piste) return ratkoB.piste - ratkoA.piste;

    const ratko2A = puraRatkoArvo(a.ratko2);
    const ratko2B = puraRatkoArvo(b.ratko2);
    if (ratko2B.piste !== ratko2A.piste) return ratko2B.piste - ratko2A.piste;

    return vertaaCountbackSarjoja(a, b);
  });

  let aktiivinenSija = 1;
  const ratkoRajatulos = lajiteltuLista.length >= ratkoSija
    ? parseInt(lajiteltuLista[ratkoSija - 1].tulos, 10) || 0
    : 0;

  return lajiteltuLista.map((ampuja, index, array) => {
    const tulosNum = parseInt(ampuja.tulos, 10) || 0;

    if (index > 0) {
      const edellinen = array[index - 1];
      const edellinenTulos = parseInt(edellinen.tulos, 10) || 0;

      const ratkoArvo = puraRatkoArvo(ampuja.ratko);
      const ratko2Arvo = puraRatkoArvo(ampuja.ratko2);
      const edellinenRatko = puraRatkoArvo(edellinen.ratko);
      const edellinenRatko2 = puraRatkoArvo(edellinen.ratko2);
      const countbackVertailu = vertaaCountbackSarjoja(ampuja, edellinen);

      const onkoMukanaRatkoissa = index < ratkoSija || tulosNum >= ratkoRajatulos;
      const onkoRatkoAnnettuVertailuparille = onkoRatkoArvoAnnettu(ampuja) || onkoRatkoArvoAnnettu(edellinen);

      if (edellinenTulos === tulosNum) {
        if (onkoMukanaRatkoissa) {
          // Älä riko tasatulosta ennen kuin ratkoarvoja on oikeasti annettu.
          if (onkoRatkoAnnettuVertailuparille
            && !(edellinenRatko.piste === ratkoArvo.piste && edellinenRatko2.piste === ratko2Arvo.piste && countbackVertailu === 0)) {
            aktiivinenSija = index + 1;
          }
        }
      } else {
        aktiivinenSija = index + 1;
      }
    } else {
      aktiivinenSija = 1;
    }

    return { ...ampuja, laskettuSija: aktiivinenSija.toString() };
  });
}

// Palauttaa niiden ampujien id:t, joiden ratkotulos näytetään.
// Ratko näytetään vain tasatuloksessa oleville. OPEN-näkymässä lisäksi vain
// palkintosijojen (ratkoSija) rajatuloksen saavuttaneille.
export function laskeNaytettavatRatkoIdt(
  sijoitetutAmpujat,
  sarjaSuodatin = 'OPEN (Y)',
  ratkoSija = ratkoPalkintoSijaOletus
) {
  const onKaikkiNakyma = sarjaSuodatin === 'OPEN (Y)';
  const rajatulos = onKaikkiNakyma && sijoitetutAmpujat.length >= ratkoSija
    ? parseInt(sijoitetutAmpujat[ratkoSija - 1]?.tulos, 10)
    : NaN;

  const tulosRyhmat = new Map();
  for (const ampuja of sijoitetutAmpujat) {
    const tulos = parseInt(ampuja.tulos, 10) || 0;
    const ryhma = tulosRyhmat.get(tulos) || [];
    ryhma.push(ampuja);
    tulosRyhmat.set(tulos, ryhma);
  }

  const ids = new Set();
  for (const [tulos, ryhma] of tulosRyhmat) {
    if (ryhma.length < 2) continue;
    if (!Number.isNaN(rajatulos) && tulos < rajatulos) continue;
    for (const ampuja of ryhma) ids.add(ampuja.id);
  }
  return ids;
}

// Päiväkohtaiset tulokset ovat hyödyllisiä vasta, kun jollakin ampujalla on
// tulos päivältä 2 tai myöhemmältä. Ennen sitä kokonaistulos = päivän 1 tulos.
export function onkoMyohempiaPaivaTuloksia(ampujat) {
  return ampujat.some((ampuja) => (ampuja.dayScores || []).some(
    (paiva) => paiva.numero > 1 && (Number.parseInt(paiva.tulos, 10) || 0) > 0
  ));
}

// Tunnistaa päiväsarakkeet normalisoiduista otsikoista (A-Z0-9, ääkköset ilman pisteitä).
// Ensisijaisesti DAY1/PÄIVÄ1..., muuten LA/LAUANTAI = päivä 1 ja SU/SUNNUNTAI = päivä 2.
// AP/IP ovat saman päivän puoliskoja, eivät päiviä. Alle kaksi päiväsaraketta -> yksipäiväinen kisa.
export function tunnistaPaivaSarakkeet(otsikotNormalisoitu) {
  const numeroidut = [];
  otsikotNormalisoitu.forEach((otsikko, indeksi) => {
    const paivaNumero = otsikko.match(/^(?:DAY|PAIVA)(\d+)$/)?.[1];
    if (paivaNumero) numeroidut.push({ indeksi, numero: Number(paivaNumero) });
  });

  const etsiViikonpaiva = (lyhenne, nimi) => {
    const tarkka = otsikotNormalisoitu.indexOf(lyhenne);
    return tarkka !== -1 ? tarkka : otsikotNormalisoitu.findIndex((otsikko) => otsikko.startsWith(nimi));
  };
  const idxLa = etsiViikonpaiva('LA', 'LAUANTAI');
  const idxSu = etsiViikonpaiva('SU', 'SUNNUNTAI');

  const sarakkeet = numeroidut.length > 0
    ? numeroidut
    : [
      idxLa !== -1 && { indeksi: idxLa, numero: 1 },
      idxSu !== -1 && { indeksi: idxSu, numero: 2 }
    ].filter(Boolean);

  if (sarakkeet.length < 2) return [];
  return sarakkeet.sort((a, b) => a.numero - b.numero || a.indeksi - b.indeksi);
}

export function normalisoiOtsikko(otsikko) {
  return String(otsikko || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
}
