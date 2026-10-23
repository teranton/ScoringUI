import test from 'node:test';
import assert from 'node:assert/strict';

import { KAIKKI_SARJAT } from './henkiloTulokset.js';
import {
  aktiivinenSarja,
  haeOpenSarjaSpekseista,
  onkoLuokkakisa,
  paatteleOpenSarja,
  sarjaNakyma,
  sarjaValinnat,
  sarjanNimi
} from './openSarja.js';

test('OPEN_SARJA luetaan avaimen oikealta puolelta', () => {
  assert.equal(haeOpenSarjaSpekseista([['', 'OPEN_SARJA', 'Y']]), 'y');
  assert.equal(haeOpenSarjaSpekseista([['Open sarja', '', 'Y (OPEN)']]), 'open');
  assert.equal(haeOpenSarjaSpekseista('OPEN_SARJA,open\n'), 'open');
  assert.equal(haeOpenSarjaSpekseista([['OPEN_SARJA', 'Ei']]), 'ei');
  assert.equal(haeOpenSarjaSpekseista([['OPEN_SARJA', 'jotain']]), null);
  assert.equal(haeOpenSarjaSpekseista([['LAYOUT/KISA', '8']]), null);
});

test('luokkakilpailu päätellään, kun asetusta ei ole', () => {
  assert.equal(onkoLuokkakisa(['A', 'B', 'c', ' ']), true);
  assert.equal(onkoLuokkakisa(['A', 'N']), false);
  assert.equal(onkoLuokkakisa([]), false);
  assert.equal(paatteleOpenSarja(null, ['A', 'B']), 'ei');
  assert.equal(paatteleOpenSarja(null, ['Y', 'N', 'Y56']), 'y');
  assert.equal(paatteleOpenSarja('open', ['A', 'B']), 'open');
});

test('luokat A (Y), B (Y56, Y20), C (N, Y66, Y17) ja D (metsästäjä): ei yhteistä sarjaa, avautuu luokkaan A', () => {
  const { yhteinenSarja, napit } = sarjaNakyma(['D', 'B', 'A', 'C'], null);
  assert.equal(yhteinenSarja, 'ei');
  assert.deepEqual(napit, ['A', 'B', 'C', 'D']);
  assert.equal(aktiivinenSarja(KAIKKI_SARJAT, napit), 'A');
});

test('luokan nimessä voi olla alaryhmät: luokkakirjain alussa riittää', () => {
  assert.equal(onkoLuokkakisa(['A (Y)', 'B (Y56, Y20)', 'C N/Y66/Y17', 'D-metsästäjä', 'E1']), true);
  assert.equal(onkoLuokkakisa(['A (Y)', 'Y56']), false);
  assert.equal(onkoLuokkakisa(['A', 'Ase']), false);
  assert.equal(onkoLuokkakisa(['N', 'Y', 'Y17']), false);
});

test('sarjavalinnat ja nimet', () => {
  assert.deepEqual(sarjaValinnat(new Set(['N', 'Y', 'Y56']), 'y'), [KAIKKI_SARJAT, 'N', 'Y56']);
  assert.deepEqual(sarjaValinnat(['B', 'A', 'Y'], 'ei'), ['A', 'B', 'Y']);
  assert.equal(sarjanNimi(KAIKKI_SARJAT, 'y'), 'Y');
  assert.equal(sarjanNimi(KAIKKI_SARJAT, 'open'), 'Y (OPEN)');
  assert.equal(sarjanNimi('N', 'open'), 'N');
  assert.equal(aktiivinenSarja(KAIKKI_SARJAT, ['A', 'B']), 'A');
  assert.equal(aktiivinenSarja('B', ['A', 'B']), 'B');
  assert.equal(aktiivinenSarja(KAIKKI_SARJAT, []), KAIKKI_SARJAT);
});
