// Finaalikaavio (pudotuspeli) FINAALI-välilehdeltä: rivi per ottelu.
// Sarakkeet otsikon mukaan: SARJA (valinnainen), KIERROS, SIJA A / AMPUJA A / TULOS A, SIJA B / AMPUJA B / TULOS B,
// VOITTAJA (valinnainen: A, B tai voittajan nimi; muuten suurempi tulos voittaa). Otsikkorivi voi olla minkä tahansa
// tyhjän rivin jälkeen, ja kierrokset näytetään siinä järjestyksessä, jossa ne ovat taulukossa. Pronssiottelu
// (KIERROS alkaa "PRONSSI" tai "BRONZE") näytetään finaalin alla, ei omana kierroksenaan.
import { normalisoiOtsikko } from './henkiloTulokset.js';

const OTSIKOT = {
  sarja: ['SARJA', 'CLASS'],
  kierros: ['KIERROS', 'ROUND'],
  sijaA: ['SIJAA', 'SEEDA'],
  nimiA: ['AMPUJAA', 'NIMIA', 'SHOOTERA'],
  tulosA: ['TULOSA', 'SCOREA'],
  sijaB: ['SIJAB', 'SEEDB'],
  nimiB: ['AMPUJAB', 'NIMIB', 'SHOOTERB'],
  tulosB: ['TULOSB', 'SCOREB'],
  voittaja: ['VOITTAJA', 'WINNER'],
  ratko: ['RATKO', 'SHOOTOFF']
};

const siisti = (arvo) => String(arvo ?? '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
const vertailuNimi = (nimi) => siisti(nimi).toLowerCase();
const onPronssi = (kierros) => /^(PRONSSI|BRONZE)/.test(normalisoiOtsikko(kierros));

function etsiOtsikkorivi(rivit) {
  for (let i = 0; i < rivit.length; i++) {
    const normalisoitu = (rivit[i] || []).map(normalisoiOtsikko);
    const sarake = (nimet) => normalisoitu.findIndex((o) => nimet.includes(o));
    const sarakkeet = Object.fromEntries(Object.entries(OTSIKOT).map(([avain, nimet]) => [avain, sarake(nimet)]));
    if (sarakkeet.kierros !== -1 && sarakkeet.nimiA !== -1 && sarakkeet.nimiB !== -1) return { indeksi: i, sarakkeet };
  }
  return null;
}

function luku(arvo) {
  const teksti = siisti(arvo).replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(teksti)) return null;
  return Number(teksti);
}

// Voittaja: 'A', 'B' tai null (ei vielä ratkennut).
function ratkaiseVoittaja(ottelu, voittajaArvo) {
  const arvo = siisti(voittajaArvo);
  if (arvo) {
    const iso = arvo.toUpperCase();
    if (iso === 'A' || iso === '1') return 'A';
    if (iso === 'B' || iso === '2') return 'B';
    if (vertailuNimi(arvo) === vertailuNimi(ottelu.a.nimi)) return 'A';
    if (vertailuNimi(arvo) === vertailuNimi(ottelu.b.nimi)) return 'B';
  }
  const { tulos: ta } = ottelu.a;
  const { tulos: tb } = ottelu.b;
  if (ta === null || tb === null || ta === tb) return null;
  return ta > tb ? 'A' : 'B';
}

// Palauttaa [{ sarja, kierrokset: [{ nimi, ottelut }], pronssi: ottelu | null }] taulukon järjestyksessä.
// ottelu: { a: { sija, nimi, tulos }, b: {...}, ratko, voittaja: 'A' | 'B' | null }
export function parsiFinaalit(rivit) {
  const otsikko = etsiOtsikkorivi(rivit || []);
  if (!otsikko) return [];
  const { indeksi, sarakkeet: s } = otsikko;
  const solu = (rivi, sarake) => (sarake === -1 ? '' : siisti(rivi[sarake]));

  const sarjat = new Map();
  for (const rivi of rivit.slice(indeksi + 1)) {
    const kierros = solu(rivi, s.kierros);
    const nimiA = solu(rivi, s.nimiA);
    const nimiB = solu(rivi, s.nimiB);
    if (!kierros || (!nimiA && !nimiB)) continue;
    const sarja = solu(rivi, s.sarja);
    const ottelu = {
      a: { sija: solu(rivi, s.sijaA), nimi: nimiA, tulos: luku(solu(rivi, s.tulosA)) },
      b: { sija: solu(rivi, s.sijaB), nimi: nimiB, tulos: luku(solu(rivi, s.tulosB)) },
      ratko: solu(rivi, s.ratko)
    };
    ottelu.voittaja = ratkaiseVoittaja(ottelu, solu(rivi, s.voittaja));

    if (!sarjat.has(sarja)) sarjat.set(sarja, { sarja, kierrokset: [], pronssi: null });
    const kaavio = sarjat.get(sarja);
    if (onPronssi(kierros)) {
      kaavio.pronssi = ottelu;
      continue;
    }
    let kierrosRyhma = kaavio.kierrokset.find((k) => k.nimi.toLowerCase() === kierros.toLowerCase());
    if (!kierrosRyhma) {
      kierrosRyhma = { nimi: kierros, ottelut: [] };
      kaavio.kierrokset.push(kierrosRyhma);
    }
    kierrosRyhma.ottelut.push(ottelu);
  }
  return [...sarjat.values()];
}
