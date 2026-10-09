import test from 'node:test';
import assert from 'node:assert/strict';

import {
  laskeHenkilosijoitukset,
  laskeNaytettavatRatkoIdt,
  muodostaRatkoNakyma,
  normalisoiOtsikko,
  onkoMyohempiaPaivaTuloksia,
  tunnistaPaivaSarakkeet,
  parseAsemaSpeksitRows
} from './henkiloTulokset.js';
import { ratkoTapaukset } from './ratkoTapaukset.fixture.js';

function muodostaAmpuja({ id, sarja, tulos, ratko = '', ratko2 = '', asemat = [] }) {
  return {
    id,
    sarja,
    tulos: String(tulos),
    ratko,
    ratko2,
    sarjat: asemat.map((piste, indeksi) => ({ numero: String(indeksi + 1), tulos: String(piste) }))
  };
}

function laskeNakyma({ ampujat, sarja, ratkoPalkintoSija }) {
  const sijoitetut = laskeHenkilosijoitukset(ampujat.map(muodostaAmpuja), sarja, ratkoPalkintoSija);
  const ratkoIdt = laskeNaytettavatRatkoIdt(sijoitetut, sarja, ratkoPalkintoSija);

  return sijoitetut.map((ampuja) => [
    ampuja.id,
    Number(ampuja.laskettuSija),
    ratkoIdt.has(ampuja.id) && Boolean(muodostaRatkoNakyma(ampuja.ratko, ampuja.ratko2).teksti)
  ]);
}

for (const tapaus of ratkoTapaukset) {
  test(tapaus.nimi, { todo: tapaus.todo }, () => {
    assert.deepEqual(laskeNakyma(tapaus), tapaus.odotettu);
  });
}

const speksiTapaukset = [
  { nimi: 'avain ja arvo', rivit: [['RATKO_PALKINTO_SIJA', '5']], odotettu: 5 },
  { nimi: 'tyhjä arvo käyttää oletusta 3', rivit: [['LAYOUT/KISA', '24', 'RATKO_PALKINTO_SIJA', '']], odotettu: 3 },
  { nimi: 'arvo on ensimmäinen ei-tyhjä solu avaimen oikealla puolella', rivit: [['Ratko palkinto sija', '', '4']], odotettu: 4 },
  { nimi: 'virheellinen arvo käyttää oletusta 3', rivit: [['RATKO_PALKINTO_SIJA', 'kaikki']], odotettu: 3 },
  { nimi: 'puuttuva avain käyttää oletusta 3', rivit: [['ASEMA', 'MAKSIMI'], ['1', '25']], odotettu: 3 },
  { nimi: 'tyhjät speksit käyttävät oletusta 3', rivit: [], odotettu: 3 }
];

for (const tapaus of speksiTapaukset) {
  test(`RATKO_PALKINTO_SIJA: ${tapaus.nimi}`, () => {
    assert.equal(parseAsemaSpeksitRows(tapaus.rivit).ratkoPalkintoSija, tapaus.odotettu);
  });
}

const paivaTapaukset = [
  { nimi: 'vain päivän 1 tuloksia', paivat: [[{ numero: 1, tulos: '89' }, { numero: 2, tulos: '' }]], odotettu: false },
  { nimi: 'päivän 2 sarakkeessa nollia (kaavat)', paivat: [[{ numero: 1, tulos: '89' }, { numero: 2, tulos: '0' }]], odotettu: false },
  { nimi: 'yhdellä ampujalla päivän 2 tulos', paivat: [[{ numero: 1, tulos: '89' }, { numero: 2, tulos: '' }], [{ numero: 1, tulos: '90' }, { numero: 2, tulos: '23' }]], odotettu: true },
  { nimi: 'ei päiväsarakkeita', paivat: [[]], odotettu: false }
];

for (const tapaus of paivaTapaukset) {
  test(`Päivätulokset näkyvät: ${tapaus.nimi}`, () => {
    const ampujat = tapaus.paivat.map((dayScores) => ({ dayScores }));
    assert.equal(onkoMyohempiaPaivaTuloksia(ampujat), tapaus.odotettu);
  });
}

// Kokonaiset otsikko- ja tulosrivit kuten sheetissä. Lisää tähän oikeiden kisojen otsikoita.
//   odotettuPaivat: tunnistetut päivänumerot
//   naytetaan:      näytetäänkö päiväerittely korteissa ja päivävalinnat järjestyksessä
const paivaSarakeTapaukset = [
  {
    nimi: 'yksipäiväinen, ei päiväsarakkeita',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', '1', '2', '3', '4'],
    rivit: [['', '1', 'A', 'Y', 'X', '98', '25', '24', '25', '24']],
    odotettuPaivat: [],
    naytetaan: false
  },
  {
    nimi: 'yksipäiväinen AP/IP (aamu- ja iltapäivä)',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', 'AP', 'IP'],
    rivit: [['', '1', 'A', 'Y', 'X', '98', '49', '49']],
    odotettuPaivat: [],
    naytetaan: false
  },
  {
    nimi: 'yksipäiväinen sunnuntaina, vain SU-sarake',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', 'SU'],
    rivit: [['', '1', 'A', 'Y', 'X', '98', '98']],
    odotettuPaivat: [],
    naytetaan: false
  },
  {
    nimi: 'yksipäiväinen, vain PÄIVÄ 1 -sarake',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', 'PÄIVÄ 1'],
    rivit: [['', '1', 'A', 'Y', 'X', '98', '98']],
    odotettuPaivat: [],
    naytetaan: false
  },
  {
    nimi: 'kaksipäiväinen LA/SU, ensimmäinen päivä käynnissä',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', 'LA', 'SU'],
    rivit: [['', '1', 'A', 'Y', 'X', '89', '89', ''], ['', '2', 'B', 'Y', 'X', '88', '88', '0']],
    odotettuPaivat: [1, 2],
    naytetaan: false
  },
  {
    nimi: 'kaksipäiväinen LA/SU, toinen päivä alkanut',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', 'LA', 'SU'],
    rivit: [['', '1', 'A', 'Y', 'X', '112', '89', '23'], ['', '2', 'B', 'Y', 'X', '88', '88', '']],
    odotettuPaivat: [1, 2],
    naytetaan: true
  },
  {
    nimi: 'kaksipäiväinen PÄIVÄ 1 / PÄIVÄ 2 ja lisäksi AP/IP',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', 'PÄIVÄ 1', 'PÄIVÄ 2', 'AP', 'IP'],
    rivit: [['', '1', 'A', 'Y', 'X', '178', '89', '89', '45', '44']],
    odotettuPaivat: [1, 2],
    naytetaan: true
  },
  {
    nimi: 'kolmipäiväinen DAY 1-3',
    otsikot: ['', 'SIJA', 'NIMI', 'SARJA', 'SEURA', 'TULOS', 'DAY 1', 'DAY 2', 'DAY 3'],
    rivit: [['', '1', 'A', 'Y', 'X', '180', '90', '90', '']],
    odotettuPaivat: [1, 2, 3],
    naytetaan: true
  }
];

for (const tapaus of paivaSarakeTapaukset) {
  test(`Päiväsarakkeet: ${tapaus.nimi}`, () => {
    const sarakkeet = tunnistaPaivaSarakkeet(tapaus.otsikot.map(normalisoiOtsikko));
    assert.deepEqual(sarakkeet.map((sarake) => sarake.numero), tapaus.odotettuPaivat);

    const ampujat = tapaus.rivit.map((rivi) => ({
      dayScores: sarakkeet.map(({ indeksi, numero }) => ({ numero, tulos: rivi[indeksi] ?? '' }))
    }));
    assert.equal(onkoMyohempiaPaivaTuloksia(ampujat), tapaus.naytetaan);
  });
}
