import test from 'node:test';
import assert from 'node:assert/strict';

import {
  jarjestaAmpujat,
  laskeRataTilastot,
  onkoAliTulosPuuttuu,
  parsiTaulukkoAmpujat,
  tunnistaPaivaSarakeNimet
} from './henkiloTaulukko.js';

const HENKILOT = [
  ['Sija', 'Nimi', 'Sarja', 'Seura', 'La', 'Su', 'Tulos', '1', '2', '3', 'Ratko', ''],
  ['1', 'Matti Meikäläinen', 'Y', 'Seura A', '50', '48', '98', '25', '24', '24', '', ''],
  ['2', 'Liisa Virtanen', 'N', 'Seura B', '49', '', '49', '25', '-', '', 'DNF', ''],
  ['', '', '', '', '', '', '', '', '', '', '', '']
];

test('parsiTaulukkoAmpujat lukee sarakkeet otsikoiden perusteella', () => {
  const ampujat = parsiTaulukkoAmpujat(HENKILOT, 3);

  assert.equal(ampujat.length, 2);
  assert.deepEqual(ampujat[0], {
    id: 'Matti Meikäläinen|1',
    nimi: 'Matti Meikäläinen',
    sarja: 'Y',
    seura: 'Seura A',
    la: '50',
    su: '48',
    tulos: '98',
    kokonaistulos: '98',
    ratko: '',
    ratko2: '',
    ratkoNaytto: { statusEtiketit: [], teksti: '' },
    erat: { 1: '25', 2: '24', 3: '24' }
  });
  assert.deepEqual(ampujat[1].erat, { 1: '25', 2: '-', 3: '' });
  assert.equal(ampujat[1].su, '');
  assert.deepEqual(ampujat[1].ratkoNaytto.statusEtiketit, ['DNF']);
});

test('parsiTaulukkoAmpujat: ilman päiväsarakkeita la/su ovat null', () => {
  const ampujat = parsiTaulukkoAmpujat([
    ['Nimi', 'Sarja', 'Seura', 'Tulos', '1', '2'],
    ['Pekka', 'Y', 'Seura C', '47', '23', '24']
  ], 2);

  assert.equal(ampujat[0].la, null);
  assert.equal(ampujat[0].su, null);
  assert.equal(ampujat[0].tulos, '47');
  assert.deepEqual(ampujat[0].erat, { 1: '23', 2: '24' });
});

test('parsiTaulukkoAmpujat palauttaa tyhjän listan ilman datarivejä', () => {
  assert.deepEqual(parsiTaulukkoAmpujat([HENKILOT[0]], 3), []);
  assert.deepEqual(parsiTaulukkoAmpujat(null, 3), []);
});

test('tunnistaPaivaSarakeNimet käyttää AP/IP-otsikoita kun ne löytyvät', () => {
  assert.deepEqual(tunnistaPaivaSarakeNimet(HENKILOT, 'fi'), { laLabel: 'La', suLabel: 'Su' });
  assert.deepEqual(tunnistaPaivaSarakeNimet(HENKILOT, 'en'), { laLabel: 'Sat', suLabel: 'Sun' });
  assert.deepEqual(tunnistaPaivaSarakeNimet([['Nimi', 'AP', 'IP']], 'fi'), { laLabel: 'AP', suLabel: 'IP' });
  assert.deepEqual(tunnistaPaivaSarakeNimet([['Nimi', 'Aamupäivä', 'Iltapäivä']], 'en'), { laLabel: 'AP', suLabel: 'IP' });
  assert.deepEqual(tunnistaPaivaSarakeNimet(null, 'fi'), { laLabel: 'La', suLabel: 'Su' });
});

test('jarjestaAmpujat järjestää numerot numeroina ja tekstit suomeksi', () => {
  const ampujat = [
    { nimi: 'Öljynen', laskettuSija: 2, tulos: '90', erat: { 1: '20' } },
    { nimi: 'Aalto', laskettuSija: 1, tulos: '95', erat: { 1: '-' } },
    { nimi: 'Ärjä', laskettuSija: '', tulos: '80', erat: { 1: '25' } }
  ];

  assert.deepEqual(jarjestaAmpujat(ampujat, 'sija', 'asc').map((a) => a.nimi), ['Ärjä', 'Aalto', 'Öljynen']);
  assert.deepEqual(jarjestaAmpujat(ampujat, 'tulos', 'desc').map((a) => a.nimi), ['Aalto', 'Öljynen', 'Ärjä']);
  assert.deepEqual(jarjestaAmpujat(ampujat, 'nimi', 'asc').map((a) => a.nimi), ['Aalto', 'Ärjä', 'Öljynen']);
  assert.deepEqual(jarjestaAmpujat(ampujat, 'era-1', 'desc').map((a) => a.nimi), ['Ärjä', 'Öljynen', 'Aalto']);
  assert.equal(ampujat[0].nimi, 'Öljynen');
});

test('laskeRataTilastot laskee keskiarvon, mediaanin ja maksimiosuuden', () => {
  const ampujat = [
    { erat: { 1: '25', 2: '20' } },
    { erat: { 1: '24', 2: '-' } },
    { erat: { 1: '25', 2: '22' } },
    { erat: { 1: 'N/A', 2: '' } }
  ];

  const [rata1, rata2] = laskeRataTilastot(ampujat, [1, 2], { 1: 25, 2: 25 });
  assert.deepEqual(rata1, { rataNumero: 1, count: 3, avg: 74 / 3, median: 25, maxPct: (2 / 3) * 100 });
  assert.deepEqual(rata2, { rataNumero: 2, count: 2, avg: 21, median: 21, maxPct: 0 });

  const [tyhja] = laskeRataTilastot([], [1], {});
  assert.deepEqual(tyhja, { rataNumero: 1, count: 0, avg: null, median: null, maxPct: null });
});

test('onkoAliTulosPuuttuu tunnistaa tyhjät ja viivat', () => {
  for (const arvo of ['', ' ', '-', '—', 'n/a', null, undefined]) {
    assert.equal(onkoAliTulosPuuttuu(arvo), true, String(arvo));
  }
  assert.equal(onkoAliTulosPuuttuu('0'), false);
  assert.equal(onkoAliTulosPuuttuu(24), false);
});
