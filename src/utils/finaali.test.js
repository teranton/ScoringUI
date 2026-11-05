import test from 'node:test';
import assert from 'node:assert/strict';
import { parsiFinaalit } from './finaali.js';

const RIVIT = [
  [],
  ['SARJA', 'KIERROS', 'SIJA A', 'AMPUJA A', 'TULOS A', 'SIJA B', 'AMPUJA B', 'TULOS B', 'VOITTAJA'],
  ['A', 'Puolivälierä', '1', 'Heikki Pulkkinen', '11', '8', 'Juho Saastamoinen', '12', ''],
  ['A', 'Puolivälierä', '4', 'Tero Rantonen', '16', '5', 'Tuomas Mattila', '15', ''],
  ['A', 'Välierä', '4', 'Tero Rantonen', '', '8', 'Juho Saastamoinen', '', 'A'],
  ['A', 'Pronssiottelu', '8', 'Juho Saastamoinen', '', '7', 'Janne Rantanen', '', 'Juho Saastamoinen'],
  ['A', 'Finaali', '3', 'Roger Sundström', '', '4', 'Tero Rantonen', '', 'B'],
  ['', '', '', '', '', '', '', '', '']
];

test('parsiFinaalit: kierrokset järjestyksessä, pronssi erikseen, voittaja tuloksesta tai sarakkeesta', () => {
  const [kaavio] = parsiFinaalit(RIVIT);
  assert.equal(kaavio.sarja, 'A');
  assert.deepEqual(kaavio.kierrokset.map((k) => k.nimi), ['Puolivälierä', 'Välierä', 'Finaali']);
  const [pv1, pv4] = kaavio.kierrokset[0].ottelut;
  assert.equal(pv1.voittaja, 'B');
  assert.equal(pv1.a.tulos, 11);
  assert.equal(pv4.voittaja, 'A');
  assert.equal(kaavio.kierrokset[1].ottelut[0].voittaja, 'A');
  assert.equal(kaavio.kierrokset[2].ottelut[0].voittaja, 'B');
  assert.equal(kaavio.pronssi.voittaja, 'A');
  assert.equal(kaavio.pronssi.a.tulos, null);
});

test('parsiFinaalit: tasatulos ilman voittajaa on ratkeamaton, ei otsikkoa → tyhjä', () => {
  const [kaavio] = parsiFinaalit([['KIERROS', 'AMPUJA A', 'TULOS A', 'AMPUJA B', 'TULOS B'], ['Finaali', 'X', '10', 'Y', '10']]);
  assert.equal(kaavio.sarja, '');
  assert.equal(kaavio.kierrokset[0].ottelut[0].voittaja, null);
  assert.deepEqual(parsiFinaalit([['NIMI', 'TULOS'], ['X', '1']]), []);
});
