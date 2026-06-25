import { parseCsvRows } from './csv';

export function tulkitseTotuusarvo(arvo) {
  if (arvo == null) return false;
  const normalisoitu = String(arvo).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'x'].includes(normalisoitu);
}

export function parseAsemaSpeksitCsv(speksitCsv) {
  const asemaMaksimit = {};
  const asemaToiseksiParasKaytossa = {};

  if (!speksitCsv || typeof speksitCsv !== 'string' || speksitCsv.trim().length < 2) {
    return { asemaMaksimit, asemaToiseksiParasKaytossa };
  }

  try {
    const speksiRivit = parseCsvRows(speksitCsv);
    if (!Array.isArray(speksiRivit)) return { asemaMaksimit, asemaToiseksiParasKaytossa };

    speksiRivit.forEach((rivi) => {
      if (!rivi || rivi.length < 11) return;

      const raakaAsema = rivi[9];
      const raakaMaksimi = rivi[10];

      if (raakaAsema !== undefined && raakaAsema !== null && raakaMaksimi !== undefined && raakaMaksimi !== null) {
        const asemaTunnus = raakaAsema.toString().trim();
        const maksimiArvo = parseInt(raakaMaksimi, 10);
        const naytaToiseksiParas = tulkitseTotuusarvo(rivi[11]);

        if (asemaTunnus && !Number.isNaN(maksimiArvo)) {
          const asemaNumero = asemaTunnus.replace(/\D/g, '');
          const avain = asemaNumero || asemaTunnus;
          asemaMaksimit[avain] = maksimiArvo;
          asemaToiseksiParasKaytossa[avain] = naytaToiseksiParas;
        }
      }
    });
  } catch (error) {
    console.error('Virhe speksien parsinnoissa:', error);
  }

  return { asemaMaksimit, asemaToiseksiParasKaytossa };
}

export const ratkoStatusPainot = {
  DNS: -1,
  DNF: -2,
  DNQ: -3,
  DSQ: -4
};

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

export function laskeHenkilosijoitukset(ampujat, sarjaSuodatin = 'OPEN (Y)') {
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
  const top3Rajatulos = lajiteltuLista.length >= 3
    ? parseInt(lajiteltuLista[2].tulos, 10) || 0
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

      const onkoMukanaRatkoissa = index < 3 || tulosNum >= top3Rajatulos;

      if (edellinenTulos === tulosNum) {
        if (onkoMukanaRatkoissa) {
          if (edellinenRatko.piste === ratkoArvo.piste && edellinenRatko2.piste === ratko2Arvo.piste && countbackVertailu === 0) {
          } else {
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
