import test from 'node:test';
import assert from 'node:assert/strict';

import { muodostaTulosteSarjat } from './tulosteTulokset.js';

const OTSIKKO = ['Sija', 'Nimi', 'Sarja', 'Seura', 'Tulos', 'La', 'Su', '1', '2', '3', '4', 'Ratko'];
const RIVIT = [
  OTSIKKO,
  ['', 'Ampuja A', 'Y', 'SSG', '90', '46', '44', '23', '23', '22', '22', ''],
  ['', 'Ampuja B', 'N', 'KSA', '88', '45', '43', '22', '23', '21', '22', ''],
  ['', 'Ampuja C', 'Y', 'RAM', '95', '48', '47', '24', '24', '24', '23', ''],
  ['', 'Ampuja D', 'Y', 'OMAS', '0', '0', '0', '', '', '', '', ''],
  ['', 'Ampuja E', 'N', 'SA', '88', '44', '44', '22', '22', '22', '22', '24'],
  ['', 'Ampuja F', 'N', 'NU', '88', '46', '42', '23', '23', '21', '21', '21']
];

test('ensin Y kaikkine ampujineen, sitten muut sarjat ilman erillistä Y-sarjaa', () => {
  const { sarjat, eraNumerot, naytaPaivat } = muodostaTulosteSarjat(RIVIT, { ratojenMaara: 4, ratkoSija: 3 });

  assert.deepEqual(sarjat.map((s) => s.sarja), ['OPEN (Y)', 'N']);
  assert.deepEqual(sarjat.map((s) => s.nimi), ['Y', 'N']);
  assert.deepEqual(eraNumerot, [1, 2, 3, 4]);
  assert.equal(naytaPaivat, true);

  const open = sarjat[0];
  assert.deepEqual(open.rivit.slice(0, 2).map((r) => [r.sija, r.nimi, r.sarja, r.tulos]), [
    ['1', 'Ampuja C', 'Y', '95'],
    ['2', 'Ampuja A', 'Y', '90']
  ]);
  assert.deepEqual(open.rivit.map((r) => r.nimi).slice(2).sort(), ['Ampuja B', 'Ampuja E', 'Ampuja F']);
  assert.deepEqual(open.eiTulosta.map((a) => [a.nimi, a.sarja]), [['Ampuja D', 'Y']]);
});

test('tasatulos ratkaistaan ratkolla ja ratko näytetään vain tasatuloksen ampujille', () => {
  const { sarjat } = muodostaTulosteSarjat(RIVIT, { ratojenMaara: 4, ratkoSija: 3 });
  const n = sarjat.find((s) => s.sarja === 'N');
  assert.deepEqual(n.rivit.map((r) => [r.sija, r.nimi, r.ratko]), [
    ['1', 'Ampuja E', '24'],
    ['2', 'Ampuja F', '21'],
    ['3', 'Ampuja B', '']
  ]);
  assert.equal(n.naytaRatko, true);
});

test('vähintään 10 kierrosta: kierroksia ei tulosteta', () => {
  const otsikko = ['Nimi', 'Sarja', 'Seura', 'Tulos', ...Array.from({ length: 10 }, (_, i) => String(i + 1))];
  const rivi = ['Ampuja A', 'Y', 'SSG', '200', ...Array(10).fill('20')];
  const { eraNumerot, naytaPaivat, sarjat } = muodostaTulosteSarjat([otsikko, rivi], { ratojenMaara: 10 });
  assert.deepEqual(eraNumerot, []);
  assert.equal(naytaPaivat, false);
  assert.deepEqual(sarjat[0].rivit[0].erat, []);
});

test('Y-sarja ja sarjattomat vain OPEN (Y) -osiossa kirjainkoosta ja välilyönneistä riippumatta', () => {
  const rivit = [
    ['Nimi', 'Sarja', 'Seura', 'Tulos'],
    ['A', 'Y ', 'S1', '90'],
    ['B', 'y', 'S2', '95'],
    ['C', '', 'S3', '80']
  ];
  const { sarjat } = muodostaTulosteSarjat(rivit, { ratojenMaara: 0 });
  assert.deepEqual(sarjat.map((s) => [s.sarja, s.rivit.map((r) => r.nimi)]), [
    ['OPEN (Y)', ['B', 'A', 'C']]
  ]);
});

test('ilman tulosta olevalle tulostetaan statuskoodi ratko-sarakkeesta', () => {
  const rivit = [
    ['Nimi', 'Sarja', 'Seura', 'Tulos', 'Ratko'],
    ['A', 'Y', 'S1', '90', ''],
    ['B', 'Y', 'S2', '0', 'DNS'],
    ['C', 'Y', 'S3', '0', '']
  ];
  const { sarjat } = muodostaTulosteSarjat(rivit, { ratojenMaara: 0 });
  assert.deepEqual(sarjat[0].eiTulosta.map((a) => [a.nimi, a.status]), [['B', 'DNS'], ['C', '']]);
});

test('OPEN_SARJA: avoin kisa tulostaa Y (OPEN), EI tulostaa vain sarjat', () => {
  const avoin = muodostaTulosteSarjat(RIVIT, { ratojenMaara: 4, openSarja: 'open' });
  assert.deepEqual(avoin.sarjat.map((s) => s.nimi), ['Y (OPEN)', 'N']);

  const ei = muodostaTulosteSarjat(RIVIT, { ratojenMaara: 4, openSarja: 'ei' });
  assert.deepEqual(ei.sarjat.map((s) => [s.nimi, s.rivit.length]), [['N', 3], ['Y', 2]]);
});

test('luokkakilpailu ilman asetusta: ei yhteistä sarjaa', () => {
  const rivit = [
    ['Nimi', 'Sarja', 'Seura', 'Tulos'],
    ['A', 'B', 'S1', '90'],
    ['B', 'A', 'S2', '95'],
    ['C', 'a', 'S3', '80']
  ];
  const { sarjat } = muodostaTulosteSarjat(rivit, { ratojenMaara: 0 });
  assert.deepEqual(sarjat.map((s) => [s.nimi, s.rivit.map((r) => r.nimi)]), [
    ['A', ['B', 'C']],
    ['B', ['A']]
  ]);
});
