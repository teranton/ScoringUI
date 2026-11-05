import test from 'node:test';
import assert from 'node:assert/strict';

import { etsiFinaaliSarake, yhdistaFinaali } from './karsintaFinaali.js';
import { parsiTaulukkoAmpujat } from './henkiloTaulukko.js';
import { laskeHenkilosijoitukset, laskeNaytettavatRatkoIdt } from './henkiloTulokset.js';
import { muodostaTulosteSarjat } from './tulosteTulokset.js';

// Eley Compak 150k 2024, Tulokset Y(OPEN): top-6-finaali karsinnasta, TULOS = karsinta, RATKO ratkaisee finaalin tasatuloksen.
const OTSIKKO = ['', 'SIJOITUS', 'NIMI', 'SARJA', 'SEURA', '1', '2', '3', '4', '5', '6', '7', '8', 'TULOS ', 'FINAALI', 'RATKO'];
const rivi = (nimi, sarja, asemat, tulos, finaali = '', ratko = '') =>
  ['', '', nimi, sarja, 'OMAS', ...asemat, '', '', tulos, finaali, ratko];
const RIVIT = [
  OTSIKKO,
  rivi('Juha Kumpuvaara', 'A', ['24', '24', '25', '25', '21', '24'], '143', '23', '20'),
  rivi('Tero Rantonen', 'HG', ['22', '25', '24', '24', '22', '25'], '142', '23', '23'),
  rivi('Rasmus Kumpuvaara', 'A', ['23', '21', '25', '24', '24', '24'], '141', '22', '23'),
  rivi('Roope Hanni', 'A', ['24', '23', '24', '25', '21', '24'], '141', '22', '19'),
  rivi('Pauli Moilanen', 'B', ['23', '25', '25', '23', '22', '23'], '141', '22'),
  rivi('Marko Sivonen', 'A', ['24', '25', '22', '23', '23', '24'], '141', '21'),
  rivi('Antti Poutiainen', 'A', ['24', '23', '24', '25', '22', '22'], '140')
];

test('etsiFinaaliSarake löytää FINAALI- tai FINAL-otsikon, ei muita', () => {
  assert.equal(etsiFinaaliSarake(['NIMI', 'TULOS', 'FINAALI', 'RATKO']), 2);
  assert.equal(etsiFinaaliSarake(['NIMI', 'FINAL']), 1);
  assert.equal(etsiFinaaliSarake(['NIMI', 'FINAALIRYHMA', 'TULOS']), -1);
  assert.equal(etsiFinaaliSarake(undefined), -1);
});

test('yhdistaFinaali lisää finaalin karsinnan tulokseen', () => {
  assert.deepEqual(yhdistaFinaali('143', '23', ['24', '24', '25', '25', '21', '24']), { tulos: '166', karsinta: '143', finaali: '23' });
  assert.deepEqual(yhdistaFinaali('140', '', ['24']), { tulos: '140', karsinta: '140', finaali: '' });
  assert.deepEqual(yhdistaFinaali('140', 'DNS', []), { tulos: '140', karsinta: '140', finaali: 'DNS' });
  // Finaali 0 lasketaan mukaan (tulos ei muutu).
  assert.deepEqual(yhdistaFinaali('100', '0', ['50', '50']), { tulos: '100', karsinta: '100', finaali: '0' });
});

test('yhdistaFinaali ei lisää finaalia toiseen kertaan, jos TULOS jo sisältää sen', () => {
  assert.deepEqual(yhdistaFinaali('166', '23', ['24', '24', '25', '25', '21', '24']), { tulos: '166', karsinta: '143', finaali: '23' });
  // Asemia puuttuu: summa ei täsmää, joten finaali lisätään.
  assert.deepEqual(yhdistaFinaali('143', '23', ['24', '-']), { tulos: '166', karsinta: '143', finaali: '23' });
});

test('2024 top-6-finaali: järjestys karsinta + finaali, tasatulos RATKOlla', () => {
  const ampujat = parsiTaulukkoAmpujat(RIVIT, 8);
  const sijoitetut = laskeHenkilosijoitukset(ampujat, 'OPEN (Y)', 3);
  assert.deepEqual(sijoitetut.map((a) => [a.nimi, a.kokonaistulos, a.laskettuSija]), [
    ['Juha Kumpuvaara', '166', '1'],
    ['Tero Rantonen', '165', '2'],
    ['Rasmus Kumpuvaara', '163', '3'],
    ['Roope Hanni', '163', '4'],
    ['Pauli Moilanen', '163', '5'],
    ['Marko Sivonen', '162', '6'],
    ['Antti Poutiainen', '140', '7']
  ]);
  assert.equal(sijoitetut[0].karsinta, '143');
  assert.equal(sijoitetut[0].finaali, '23');
  assert.equal(sijoitetut[6].finaali, '');
  const ratkot = laskeNaytettavatRatkoIdt(sijoitetut, 'OPEN (Y)', 3);
  assert.deepEqual(sijoitetut.filter((a) => ratkot.has(a.id)).map((a) => a.nimi),
    ['Rasmus Kumpuvaara', 'Roope Hanni', 'Pauli Moilanen']);
});

test('sarjan järjestys käyttää samaa yhteistulosta', () => {
  const ampujat = parsiTaulukkoAmpujat(RIVIT, 8);
  const sarjaA = laskeHenkilosijoitukset(ampujat, 'A', 3);
  assert.deepEqual(sarjaA.map((a) => a.nimi),
    ['Juha Kumpuvaara', 'Rasmus Kumpuvaara', 'Roope Hanni', 'Marko Sivonen', 'Antti Poutiainen']);
});

test('ilman FINAALI-saraketta finaali on null eikä tuloste saa saraketta', () => {
  const ampujat = parsiTaulukkoAmpujat([['NIMI', 'SARJA', '1', 'TULOS'], ['A', 'Y', '25', '25']], 1);
  assert.equal(ampujat[0].finaali, null);
  assert.equal(ampujat[0].kokonaistulos, '25');
  const [osio] = muodostaTulosteSarjat(ampujat);
  assert.equal(osio.sarakkeet.finaali, false);
  const finaaliOsio = muodostaTulosteSarjat(parsiTaulukkoAmpujat(RIVIT, 8))[0];
  assert.equal(finaaliOsio.sarakkeet.finaali, true);
});
