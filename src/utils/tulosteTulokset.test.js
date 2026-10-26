import test from 'node:test';
import assert from 'node:assert/strict';

import { muodostaTulosteSarjat } from './tulosteTulokset.js';
import { muodostaTulosteRatko, parsiTaulukkoAmpujat } from './henkiloTaulukko.js';

const OTSIKKO = ['Sija', 'Nimi', 'Sarja', 'Seura', 'Tulos', 'La', 'Su', '1', '2', '3', '4', 'Ratko'];
const RIVIT = [
  OTSIKKO,
  ['', 'Ampuja A', 'Y', 'SSG', '90', '46', '44', '23', '23', '22', '22', ''],
  ['', 'Ampuja B', 'N', 'KSA', '88', '45', '43', '22', '23', '21', '22', ''],
  ['', 'Ampuja C', 'Y', 'RAM', '95', '48', '47', '24', '24', '24', '23', ''],
  ['', 'Ampuja D', 'Y', 'OMAS', '0', '0', '0', '', '', '', '', 'DNS'],
  ['', 'Ampuja E', 'N', 'SA', '88', '44', '44', '22', '22', '22', '22', '24'],
  ['', 'Ampuja F', 'N', 'NU', '88', '46', '42', '23', '23', '21', '21', '21']
];
const ampujat = (rivit = RIVIT, radat = 4) => parsiTaulukkoAmpujat(rivit, radat);

test('ensin Y kaikkine ampujineen sijajärjestyksessä, sitten muut sarjat ilman erillistä Y-sarjaa', () => {
  const sarjat = muodostaTulosteSarjat(ampujat(), { ratkoSija: 3 });
  assert.deepEqual(sarjat.map((s) => s.sarja), ['OPEN (Y)', 'N']);
  assert.deepEqual(sarjat.map((s) => s.nimi), ['Y', 'N']);

  const open = sarjat[0];
  assert.equal(open.ampujat.length, 6);
  assert.deepEqual(open.ampujat.slice(0, 2).map((a) => [a.laskettuSija, a.nimi]), [['1', 'Ampuja C'], ['2', 'Ampuja A']]);
  // Ilman tulosta oleva viimeisenä ilman sijaa, status ratko-sarakkeessa.
  const d = open.ampujat.at(-1);
  assert.deepEqual([d.nimi, d.laskettuSija], ['Ampuja D', '']);
  assert.equal(muodostaTulosteRatko(d, open.ratkoIdt), 'DNS');
  assert.deepEqual(open.sarakkeet, { sarja: true, seura: true, la: true, su: true, ratko: true });
});

test('tasatulos ratkaistaan ratkolla ja ratko näytetään vain tasatuloksen ampujille', () => {
  const n = muodostaTulosteSarjat(ampujat(), { ratkoSija: 3 }).find((s) => s.sarja === 'N');
  assert.deepEqual(n.ampujat.map((a) => [a.laskettuSija, a.nimi]), [['1', 'Ampuja E'], ['2', 'Ampuja F'], ['3', 'Ampuja B']]);
  assert.ok(n.ratkoIdt.has(n.ampujat[0].id));
  assert.equal(n.sarakkeet.sarja, false);
  assert.equal(n.sarakkeet.ratko, true);
});

test('sarakkeet sarjan omista tiedoista: seuraton ja päivätön sarja ilman niitä', () => {
  const rivit = [
    ['Nimi', 'Sarja', 'Seura', 'Tulos'],
    ['A', 'Y ', 'S1', '90'],
    ['B', 'y', 'S2', '95'],
    ['C', 'N', '', '80'],
    ['D', '', 'S4', '70']
  ];
  const sarjat = muodostaTulosteSarjat(ampujat(rivit, 0));
  // Y-sarja ja kirjainkoko/välilyönnit vain OPEN (Y) -osiossa.
  assert.deepEqual(sarjat.map((s) => [s.sarja, s.ampujat.map((a) => a.nimi)]), [
    ['OPEN (Y)', ['B', 'A', 'C', 'D']],
    ['N', ['C']]
  ]);
  assert.deepEqual(sarjat[1].sarakkeet, { sarja: false, seura: false, la: false, su: false, ratko: false });
});

test('tyhjä Su-sarake ennen toista päivää ei tulostu', () => {
  const rivit = [
    ['Nimi', 'Sarja', 'Seura', 'Tulos', 'La', 'Su'],
    ['A', 'Y', 'S1', '45', '45', ''],
    ['B', 'N', 'S2', '44', '44', '']
  ];
  const sarjat = muodostaTulosteSarjat(ampujat(rivit, 0));
  assert.deepEqual(sarjat.map((s) => [s.sarakkeet.la, s.sarakkeet.su]), [[true, false], [true, false]]);
});

test('ei ampujia: ei sarjoja', () => {
  assert.deepEqual(muodostaTulosteSarjat([]), []);
});

test('OPEN_SARJA: avoin kisa tulostaa Y (OPEN), EI tulostaa vain sarjat', () => {
  const avoin = muodostaTulosteSarjat(ampujat(), { openSarja: 'open' });
  assert.deepEqual(avoin.map((s) => s.nimi), ['Y (OPEN)', 'N']);

  const ei = muodostaTulosteSarjat(ampujat(), { openSarja: 'ei' });
  assert.deepEqual(ei.map((s) => [s.nimi, s.ampujat.length]), [['N', 3], ['Y', 3]]);
  assert.equal(ei[0].sarakkeet.sarja, false);
});

test('luokkakilpailu ilman asetusta: ei yhteistä sarjaa', () => {
  const rivit = [
    ['Nimi', 'Sarja', 'Seura', 'Tulos'],
    ['A', 'B', 'S1', '90'],
    ['B', 'A', 'S2', '95'],
    ['C', 'a', 'S3', '80']
  ];
  assert.deepEqual(muodostaTulosteSarjat(ampujat(rivit, 0)).map((s) => [s.nimi, s.ampujat.map((a) => a.nimi)]), [
    ['A', ['B', 'C']],
    ['B', ['A']]
  ]);
});

test('High Gun: oma osio, ja voittaja pois sarjan tulosteesta', () => {
  const sarjat = muodostaTulosteSarjat(ampujat(), { highGun: { paikat: 1, poisSarjoista: true } });
  assert.deepEqual(sarjat.map((s) => s.nimi), ['Y', 'High Gun', 'N']);
  assert.deepEqual(sarjat[1].ampujat.map((a) => a.nimi), ['Ampuja C']);
  assert.equal(sarjat[1].sarakkeet.sarja, true);
});
