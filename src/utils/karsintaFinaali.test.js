import test from 'node:test';
import assert from 'node:assert/strict';

import { erotaFinaali, etsiFinaaliSarake, ratko2Sarake, ratkoSarake, rivinTulos } from './karsintaFinaali.js';
import { parsiTaulukkoAmpujat } from './henkiloTaulukko.js';
import { laskeHenkilosijoitukset, laskeNaytettavatRatkoIdt } from './henkiloTulokset.js';
import { laskeSarjanSijoitukset, HIGH_GUN } from './highGun.js';
import { muodostaTulosteSarjat } from './tulosteTulokset.js';

// Eley Compak 150k 2024, Tulokset Y(OPEN): top-6-finaali karsinnasta alkaa nollasta, TULOS = karsinta, RATKO ratkaisee
// finaalin tasatuloksen. Finaalin voittaja sai High Gunin, sarjapalkinnot jaettiin karsinnan mukaan.
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

test('erotaFinaali pitää tuloksena karsinnan ja antaa finaalin erikseen', () => {
  assert.deepEqual(erotaFinaali('143', '23', ['24', '24', '25', '25', '21', '24']), { tulos: '143', finaali: '23' });
  assert.deepEqual(erotaFinaali('140', '', ['24']), { tulos: '140', finaali: '' });
  assert.deepEqual(erotaFinaali('140', 'DNS', []), { tulos: '140', finaali: '' });
  // Kaavan 0 tai - finaalia ampumattomille: tulos ei muutu eikä finaalia näytetä.
  assert.deepEqual(erotaFinaali('100', '0', ['50', '50']), { tulos: '100', finaali: '' });
  assert.deepEqual(erotaFinaali('100', '-', ['50', '50']), { tulos: '100', finaali: '' });
});

test('erotaFinaali vähentää finaalin, jos TULOS sisältää sen', () => {
  assert.deepEqual(erotaFinaali('166', '23', ['24', '24', '25', '25', '21', '24']), { tulos: '143', finaali: '23' });
  // Tyhjä, merkitty tai DNF-asema lasketaan kuten kaava (alkava luku tai 0), joten finaalia ei lisätä kahdesti.
  assert.deepEqual(erotaFinaali('142', '23', ['24', '24*', '', 'DNF', '71']), { tulos: '119', finaali: '23' });
  // Karsinnan TULOS on asemien summa: sellaisenaan.
  assert.deepEqual(erotaFinaali('143', '23', ['24', '-', '119']), { tulos: '143', finaali: '23' });
});

test('rivinTulos lukee asemat numero-otsikoista ja ilman FINAALI-saraketta palauttaa TULOKSEN', () => {
  const otsikot = ['NIMI', '1', '2', 'TULOS', 'FINAALI'];
  assert.deepEqual(rivinTulos(['A', '24', '25', '49', '20'], otsikot, 3, 4), { tulos: '49', finaali: '20' });
  assert.deepEqual(rivinTulos(['A', '24', '25', '69', '20'], otsikot, 3, 4), { tulos: '49', finaali: '20' });
  assert.deepEqual(rivinTulos(['A', '24', '25', '', ''], otsikot, 3, -1), { tulos: '0', finaali: null });
  // Asemiksi vain 1:stä alkava numero-otsikoiden jakso: vuosiluku-otsikko ei kuulu summaan.
  const vuodella = ['NIMI', '2024', '1', '2', 'TULOS', 'FINAALI'];
  assert.deepEqual(rivinTulos(['A', '5', '24', '25', '69', '20'], vuodella, 4, 5), { tulos: '49', finaali: '20' });
});

test('RATKO ja toinen ratko eivät lue FINAALI-saraketta', () => {
  assert.equal(ratkoSarake(14, 14), -1);
  assert.equal(ratkoSarake(15, 14), 15);
  assert.equal(ratko2Sarake(13, 14), -1);
  assert.equal(ratko2Sarake(15, 14), 16);
  assert.equal(ratko2Sarake(-1, 14), -1);
  const ampujat = parsiTaulukkoAmpujat([
    ['NIMI', 'SARJA', '1', 'TULOS', 'RATKO', 'FINAALI'],
    ['A', 'Y', '25', '25', '20', '23']
  ], 1);
  assert.equal(ampujat[0].ratko2, '');
  assert.equal(ampujat[0].finaali, '23');
});

test('2024 top-6-finaali: kaikkien näkymässä finaali nollasta (tasatulos RATKOlla), sitten karsinta', () => {
  const ampujat = parsiTaulukkoAmpujat(RIVIT, 8);
  const sijoitetut = laskeHenkilosijoitukset(ampujat, 'OPEN (Y)', 3);
  assert.deepEqual(sijoitetut.map((a) => [a.nimi, a.finaali, a.kokonaistulos, a.laskettuSija]), [
    ['Tero Rantonen', '23', '142', '1'],
    ['Juha Kumpuvaara', '23', '143', '2'],
    ['Rasmus Kumpuvaara', '22', '141', '3'],
    ['Roope Hanni', '22', '141', '4'],
    ['Pauli Moilanen', '22', '141', '5'],
    ['Marko Sivonen', '21', '141', '6'],
    ['Antti Poutiainen', '', '140', '7']
  ]);
  const ratkot = laskeNaytettavatRatkoIdt(sijoitetut, 'OPEN (Y)', 3);
  assert.deepEqual(sijoitetut.filter((a) => ratkot.has(a.id)).map((a) => a.nimi),
    ['Tero Rantonen', 'Juha Kumpuvaara', 'Rasmus Kumpuvaara', 'Roope Hanni', 'Pauli Moilanen']);
});

test('2024 top-6-finaali: High Gun on finaalin voittaja, sarjat karsinnan mukaan', () => {
  const ampujat = parsiTaulukkoAmpujat(RIVIT, 8);
  const highGun = { paikat: 1, poisSarjoista: true };
  assert.deepEqual(laskeSarjanSijoitukset(ampujat, HIGH_GUN, 3, highGun).map((a) => a.nimi), ['Tero Rantonen']);
  const sarjaA = laskeSarjanSijoitukset(ampujat, 'A', 3, highGun);
  assert.deepEqual(sarjaA.map((a) => [a.nimi, a.kokonaistulos, a.laskettuSija]), [
    ['Juha Kumpuvaara', '143', '1'],
    ['Rasmus Kumpuvaara', '141', '2'],
    ['Roope Hanni', '141', '3'],
    ['Marko Sivonen', '141', '4'],
    ['Antti Poutiainen', '140', '5']
  ]);
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
