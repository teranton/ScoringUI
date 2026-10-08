import test from 'node:test';
import assert from 'node:assert/strict';

import {
  arvioiJoukkuekisaNimesta,
  haeKisanVuosi,
  parsiKilpailurekisteri,
  ryhmitteleKisatVuosittain
} from './kilpailurekisteri.js';

test('parsiKilpailurekisteri ohittaa otsikkorivin ja muuntaa ISO-päivät suomalaisiksi', () => {
  const kisat = parsiKilpailurekisteri([
    ['ID', 'Nimi', 'Alku', 'Loppu', 'SheetId', 'Joukkue', 'Piilotettu'],
    ['k1', 'Kevätkisa', '2026-04-05', '2026-04-05', 'sheet-1', 'true', ''],
    ['k2', 'SM 2026', '2026-06-06', '2026-06-07', 'sheet-2', '', '1'],
    ['', '', '', '', '', '', '']
  ]);

  assert.deepEqual(kisat, [
    {
      id: 'k2',
      nimi: 'SM 2026',
      alkuPvm: '6.6.2026',
      loppuPvm: '7.6.2026',
      apiUrl: 'sheet-2',
      joukkueKisaAsetus: null,
      piilotettu: true
    },
    {
      id: 'k1',
      nimi: 'Kevätkisa',
      alkuPvm: '5.4.2026',
      loppuPvm: '5.4.2026',
      apiUrl: 'sheet-1',
      joukkueKisaAsetus: true,
      piilotettu: false
    }
  ]);
});

test('parsiKilpailurekisteri: kisat ilman päivämäärää jäävät loppuun nimen mukaan laskevasti', () => {
  const kisat = parsiKilpailurekisteri([
    ['a', 'Aamukisa', '', '', '', 'no', ''],
    ['b', 'Bonuskisa', '', '', '', '', ''],
    ['c', 'Cupin osa', '1.3.2025', '', '', '', ''],
    ['', 'Nimellinen ilman id:tä', '', '', '', '', '']
  ]);

  assert.deepEqual(kisat.map((k) => k.id), ['c', '3', 'b', 'a']);
  assert.equal(kisat.find((k) => k.id === 'a').joukkueKisaAsetus, false);
});

test('haeKisanVuosi käyttää alku- tai loppupäivää tai vuosilukua tekstistä', () => {
  assert.equal(haeKisanVuosi({ alkuPvm: '6.6.2026' }), 2026);
  assert.equal(haeKisanVuosi({ alkuPvm: '', loppuPvm: '1.1.2027' }), 2027);
  assert.equal(haeKisanVuosi({ alkuPvm: 'syksy 2025' }), 2025);
  assert.equal(haeKisanVuosi({}), null);
});

test('ryhmitteleKisatVuosittain jakaa kisat kuluvan vuoden mukaan', () => {
  const kisat = [
    { id: '1', alkuPvm: '1.1.2024' },
    { id: '2', alkuPvm: '1.1.2026' },
    { id: '3', alkuPvm: '1.1.2027' },
    { id: '4', alkuPvm: '' },
    { id: '5', alkuPvm: '2.2.2026' }
  ];

  const ryhmat = ryhmitteleKisatVuosittain(kisat, 2026);
  assert.deepEqual(ryhmat.aktiiviset.map((r) => [r.vuosi, r.kisat.map((k) => k.id)]), [[2027, ['3']], [2026, ['2', '5']]]);
  assert.deepEqual(ryhmat.vanhat.map((r) => [r.vuosi, r.kisat.map((k) => k.id)]), [[2024, ['1']]]);
  assert.deepEqual(ryhmat.ilmanVuotta.map((k) => k.id), ['4']);
});

test('arvioiJoukkuekisaNimesta pitää SM-kisoja joukkuekisoina', () => {
  assert.equal(arvioiJoukkuekisaNimesta('SM 2026'), true);
  assert.equal(arvioiJoukkuekisaNimesta('Kevätkisa'), false);
  assert.equal(arvioiJoukkuekisaNimesta(null), false);
});
