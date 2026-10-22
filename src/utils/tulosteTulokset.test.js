import test from 'node:test';
import assert from 'node:assert/strict';

import { muodostaTulosteSarjat } from './tulosteTulokset.js';
import { parsiTaulukkoAmpujat } from './henkiloTaulukko.js';

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

test('ensin OPEN (Y) kaikkine ampujineen sijajärjestyksessä, sitten muut sarjat ilman erillistä Y-sarjaa', () => {
  const sarjat = muodostaTulosteSarjat(ampujat(), { ratkoSija: 3 });
  assert.deepEqual(sarjat.map((s) => s.sarja), ['OPEN (Y)', 'N']);

  const open = sarjat[0];
  assert.equal(open.ampujat.length, 6);
  assert.deepEqual(open.ampujat.slice(0, 2).map((a) => [a.laskettuSija, a.nimi]), [['1', 'Ampuja C'], ['2', 'Ampuja A']]);
  // Ilman tulosta oleva viimeisenä.
  assert.equal(open.ampujat.at(-1).nimi, 'Ampuja D');
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
    ['C', 'N', '', '80']
  ];
  const sarjat = muodostaTulosteSarjat(ampujat(rivit, 0));
  // Y-sarja ja kirjainkoko/välilyönnit vain OPEN (Y) -osiossa.
  assert.deepEqual(sarjat.map((s) => [s.sarja, s.ampujat.map((a) => a.nimi)]), [
    ['OPEN (Y)', ['B', 'A', 'C']],
    ['N', ['C']]
  ]);
  assert.deepEqual(sarjat[1].sarakkeet, { sarja: false, seura: false, la: false, su: false, ratko: false });
});

test('ei ampujia: ei sarjoja', () => {
  assert.deepEqual(muodostaTulosteSarjat([]), []);
});
