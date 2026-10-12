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

test('kaikki sarjat peräkkäin, sijoitus sarjan sisällä ja ilman tulosta olevat viimeisinä', () => {
  const { sarjat, eraNumerot, naytaPaivat } = muodostaTulosteSarjat(RIVIT, { ratojenMaara: 4, ratkoSija: 3 });

  assert.deepEqual(sarjat.map((s) => s.sarja), ['N', 'Y']);
  assert.deepEqual(eraNumerot, [1, 2, 3, 4]);
  assert.equal(naytaPaivat, true);

  const y = sarjat[1];
  assert.deepEqual(y.rivit.map((r) => [r.sija, r.nimi, r.tulos]), [['1', 'Ampuja C', '95'], ['2', 'Ampuja A', '90']]);
  assert.deepEqual(y.eiTulosta.map((a) => a.nimi), ['Ampuja D']);
  assert.equal(y.naytaRatko, false);
});

test('tasatulos ratkaistaan ratkolla ja ratko näytetään vain tasatuloksen ampujille', () => {
  const { sarjat } = muodostaTulosteSarjat(RIVIT, { ratojenMaara: 4, ratkoSija: 3 });
  const n = sarjat[0];
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

test('sarjan välilyönnit ja kirjainkoko eivät jaa sarjaa, sarjattomat omana ryhmänään', () => {
  const rivit = [
    ['Nimi', 'Sarja', 'Seura', 'Tulos'],
    ['A', 'Y ', 'S1', '90'],
    ['B', 'y', 'S2', '95'],
    ['C', '', 'S3', '80']
  ];
  const { sarjat } = muodostaTulosteSarjat(rivit, { ratojenMaara: 0 });
  assert.deepEqual(sarjat.map((s) => [s.sarja, s.rivit.map((r) => r.nimi)]), [
    ['Y', ['B', 'A']],
    ['', ['C']]
  ]);
});
