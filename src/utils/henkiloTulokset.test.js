import test from 'node:test';
import assert from 'node:assert/strict';

import {
  laskeHenkilosijoitukset,
  laskeNaytettavatRatkoIdt,
  muodostaRatkoNakyma,
  onkoMyohempiaPaivaTuloksia,
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
