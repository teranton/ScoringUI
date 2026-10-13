import test from 'node:test';
import assert from 'node:assert/strict';
import { datanVersio, kuvanPolku, lueKuva, onkoKuvatKaytossa } from './kisaKuva.js';

const SHEET = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

test('kuvan polku ei riipu välilehtien järjestyksestä tai kirjainkoosta', () => {
  assert.equal(kuvanPolku(SHEET, ['Tulokset Y', 'KISANSPEKSIT']), kuvanPolku(SHEET, ['kisanspeksit', 'Tulokset Y']));
  assert.notEqual(kuvanPolku(SHEET, ['Tulokset Y']), kuvanPolku(SHEET, ['Tulokset Y', 'KISANSPEKSIT']));
  assert.match(kuvanPolku(SHEET, ['Tulokset Y']), new RegExp(`^kisat/${SHEET}/[0-9a-f]{12}\\.json$`));
});

test('versio muuttuu vain datan muuttuessa', () => {
  assert.equal(datanVersio({ a: 'x' }), datanVersio({ a: 'x' }));
  assert.notEqual(datanVersio({ a: 'x' }), datanVersio({ a: 'y' }));
});

test('ilman Blob-tunnusta kuvat ovat pois käytöstä', async () => {
  const vanha = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  assert.equal(onkoKuvatKaytossa(), false);
  assert.equal(await lueKuva('kisat/x.json'), null);
  if (vanha !== undefined) process.env.BLOB_READ_WRITE_TOKEN = vanha;
});
