import test from 'node:test';
import assert from 'node:assert/strict';

import { haeTekstit } from '../i18n.js';
import { lueLahtoajat, ryhmanLahtoajat as lahtoajatAvaimin } from './ryhmaLahtoajat.js';

const ryhmanLahtoajat = (...a) => lahtoajatAvaimin(...a).map(({ paiva, aika }) => ({ paiva, aika }));

const TX = haeTekstit('aikatauluRyhma', 'fi');
const csv = (rows) => rows.map((row) => row.join(',')).join('\n');

const YHDISTETTY = csv([
  ['Eräluettelo | SM 2026'],
  ['Lauantai'],
  ['START', 'Rata 1', 'Rata 2'],
  ['9:00', '1', '2'],
  ['10:00', '2', '1'],
  ['Sunnuntai'],
  ['START', 'Rata 1', 'Rata 2'],
  ['13:00', '1', '2'],
  ['RYHMÄ', 'Nro', 'Nimi', 'Sarja', 'Seura'],
  ['1', '1', 'Matti', 'Y', 'A'],
  ['2', '6', 'Pekka', 'Y', '']
]);

const RATARUUDUKKO = csv([
  ['Aikataulu | Kevätkisa'],
  ['Aika', 'RATA 1', '', 'Aika', 'RATA 2', ''],
  ['10:00', '1', 'Matti', '', '2', 'Liisa'],
  ['9:00', '6', 'Pekka', '9:00', '3', '3'],
  ['11:00', '2', 'Liisa', '11:00', '1', 'Matti']
]);

test('ryhmäaikataulusta ryhmän ensimmäinen aika kunakin päivänä', () => {
  const ajat = lueLahtoajat([{ key: 'aikataulu-main', raw: YHDISTETTY, label: 'SM 2026' }], 'group6', TX);
  assert.deepEqual(ryhmanLahtoajat(ajat, { numero: 1, paikat: [] }), [{ paiva: 'Lauantai', aika: '9:00' }, { paiva: 'Sunnuntai', aika: '13:00' }]);
  assert.deepEqual(ryhmanLahtoajat(ajat, { numero: 2, paikat: [] }), [{ paiva: 'Lauantai', aika: '9:00' }, { paiva: 'Sunnuntai', aika: '13:00' }]);
  assert.deepEqual(ryhmanLahtoajat(ajat, { numero: 3, paikat: [] }), []);
});

test('Compak-ruudukosta ryhmän paikkojen aikaisin aika, myös vapaan paikan numerolla', () => {
  const ajat = lueLahtoajat([{ key: 'aikataulu-main', raw: RATARUUDUKKO, label: 'Kevätkisa' }], 'inline', TX);
  const ryhma = { numero: 1, paikat: [{ nro: '1' }, { nro: '2' }, { nro: '3' }] };
  // Yksi päivä: päivän nimeä ei näytetä.
  assert.deepEqual(ryhmanLahtoajat(ajat, ryhma), [{ paiva: '', aika: '9:00' }]);
  assert.deepEqual(ryhmanLahtoajat(ajat, { numero: 2, paikat: [{ nro: '7' }] }), []);
});

test('eri välilehdet ovat eri päiviä', () => {
  const ajat = lueLahtoajat([
    { key: 'aikataulu-la', raw: RATARUUDUKKO, label: 'La 6.6.' },
    { key: 'aikataulu-su', raw: RATARUUDUKKO.replace('9:00', '8:30'), label: 'Su 7.6.' }
  ], 'inline', TX);
  assert.deepEqual(ryhmanLahtoajat(ajat, { numero: 1, paikat: [{ nro: '1' }] }), [{ paiva: 'La 6.6.', aika: '10:00' }, { paiva: 'Su 7.6.', aika: '10:00' }]);
  assert.deepEqual(ryhmanLahtoajat(ajat, { numero: 2, paikat: [{ nro: '6' }] }), [{ paiva: 'La 6.6.', aika: '9:00' }, { paiva: 'Su 7.6.', aika: '8:30' }]);
  assert.deepEqual(ryhmanLahtoajat(null, { numero: 1, paikat: [] }), []);
});

test('samannimiset välilehdet pysyvät eri päivinä', () => {
  const ajat = lueLahtoajat([
    { key: 'aikataulu-la', raw: RATARUUDUKKO, label: 'SM 2026' },
    { key: 'aikataulu-su', raw: RATARUUDUKKO.replace('9:00', '8:30'), label: 'SM 2026' }
  ], 'inline', TX);
  assert.deepEqual(ryhmanLahtoajat(ajat, { numero: 2, paikat: [{ nro: '6' }] }), [{ paiva: 'SM 2026', aika: '9:00' }, { paiva: 'SM 2026', aika: '8:30' }]);
});

test('päivät ja avaimet aikataulun järjestyksessä', () => {
  const ajat = lueLahtoajat([{ key: 'aikataulu-main', raw: YHDISTETTY, label: 'SM 2026' }], 'group6', TX);
  assert.deepEqual(ajat.paivat.map((p) => p.nimi), ['Lauantai', 'Sunnuntai']);
  assert.deepEqual(lahtoajatAvaimin(ajat, { numero: 1, paikat: [] }).map((l) => l.avain), ajat.paivat.map((p) => p.avain));
});

test('ryhmälista ilman aikoja ei ole päivä', () => {
  const ryhmalista = csv([
    ['Ryhmät | SM 2026'],
    ['RYHMÄ', 'Nro', 'Nimi', 'Sarja', 'Seura'],
    ['1', '1', 'Matti', 'Y', 'A']
  ]);
  assert.deepEqual(lueLahtoajat([{ key: 'aikataulu-ryhmat', raw: ryhmalista, label: 'Ryhmät' }], 'group6', TX).paivat, []);
  const molemmat = lueLahtoajat([
    { key: 'aikataulu-ryhmat', raw: ryhmalista, label: 'Ryhmät' },
    { key: 'aikataulu-main', raw: YHDISTETTY, label: 'SM 2026' }
  ], 'group6', TX);
  assert.deepEqual(molemmat.paivat.map((p) => p.avain.split(':')[0]), ['aikataulu-main', 'aikataulu-main']);
});
