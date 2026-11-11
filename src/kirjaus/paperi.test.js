import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPERI_SEURANTA_MS, kysyPaperitulokset, paperiVastauksesta, paperinKello } from './paperi.js';

test('paperiVastauksesta: toimiston muutos tilaan, vanhentunut vastaus ja odottava oma siirto eivät kumoa', () => {
  assert.deepEqual(paperiVastauksesta({ paperilla: '' }, '9.11.2026 klo 10.05.07', false), { paperilla: '9.11.2026 klo 10.05.07' });
  assert.deepEqual(paperiVastauksesta({ paperilla: 'x' }, '', true), {});
  assert.deepEqual(paperiVastauksesta({ paperilla: 'x', paperiPaikallinen: true }, '', false), {});
  assert.deepEqual(paperiVastauksesta({ paperilla: 'x' }, 'x', false), {});
  assert.deepEqual(paperiVastauksesta({ paperilla: '' }, undefined, false), {});
  const palasi = paperiVastauksesta({ paperilla: 'x' }, '', false);
  assert.equal(palasi.paperilla, '');
  assert.ok(palasi.paperiPalattu > 0);
});

test('kysyPaperitulokset: paperilla, PIN-otto tai äskettäin palannut', () => {
  assert.equal(kysyPaperitulokset({}), false);
  assert.equal(kysyPaperitulokset({ paperilla: 'x' }), true);
  assert.equal(kysyPaperitulokset({ tarkistaLinja: true }), true);
  assert.equal(kysyPaperitulokset({ paperiPalattu: 1000 }, 1000 + PAPERI_SEURANTA_MS - 1), true);
  assert.equal(kysyPaperitulokset({ paperiPalattu: 1000 }, 1000 + PAPERI_SEURANTA_MS), false);
});

test('paperinKello', () => {
  assert.equal(paperinKello('9.11.2026 klo 10.05.07'), '10.05');
  assert.equal(paperinKello(''), '');
});
