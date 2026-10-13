import test from 'node:test';
import assert from 'node:assert/strict';
import { MAKS_KISOJA, lueKisat, lueRekisteri, tallennaKisa, tallennaRekisteri } from './paikallinenValimuisti.js';

function luoTallennus({ kiintio = Infinity } = {}) {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const koko = [...map.entries()].filter(([a]) => a !== k).reduce((s, [, b]) => s + b.length, 0) + v.length;
      if (koko > kiintio) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    map
  };
}

test('rekisteri ja kisat tallentuvat ja luetaan takaisin', () => {
  const t = luoTallennus();
  assert.equal(lueRekisteri(t), null);
  tallennaRekisteri('a,b', t, 5);
  assert.deepEqual(lueRekisteri(t), { csv: 'a,b', tallennettu: 5 });
  tallennaKisa('id1', { henkilotCsvRaw: 'x', haettu: 1 }, t, 1);
  assert.deepEqual(lueKisat(t), { id1: { henkilotCsvRaw: 'x', haettu: 1 } });
});

test('vanhimmat kisat poistetaan, kun raja ylittyy', () => {
  const t = luoTallennus();
  for (let i = 0; i < MAKS_KISOJA + 3; i++) tallennaKisa(`id${i}`, { i }, t, i);
  const kisat = lueKisat(t);
  assert.equal(Object.keys(kisat).length, MAKS_KISOJA);
  assert.equal(kisat.id0, undefined);
  assert.deepEqual(kisat[`id${MAKS_KISOJA + 2}`], { i: MAKS_KISOJA + 2 });
});

test('täysi kiintiö vapauttaa tilaa ja yrittää uudelleen', () => {
  const t = luoTallennus({ kiintio: 2000 });
  const iso = 'x'.repeat(150);
  for (let i = 0; i < 10; i++) tallennaKisa(`id${i}`, { iso }, t, i);
  tallennaKisa('uusi', { iso }, t, 100);
  assert.ok(lueKisat(t).uusi);
});

test('rikkinäinen tai puuttuva tallennus ei kaada', () => {
  const t = luoTallennus();
  t.map.set('scoringui:v1:kisa:rikki', '{ei jsonia');
  assert.deepEqual(lueKisat(t), {});
  assert.deepEqual(lueKisat(null), {});
  assert.equal(lueRekisteri(null), null);
  tallennaKisa('id', {}, null);
  const heittava = { get length() { throw new Error('estetty'); }, getItem() { throw new Error('estetty'); }, setItem() { throw new Error('estetty'); } };
  assert.deepEqual(lueKisat(heittava), {});
  tallennaKisa('id', {}, heittava);
});

test('karsinta käyttää indeksiä eikä jäsennä kisojen dataa', () => {
  const t = luoTallennus();
  for (let i = 0; i < MAKS_KISOJA; i++) tallennaKisa(`id${i}`, { i }, t, i);
  const alkuperainen = JSON.parse;
  let jasennykset = 0;
  JSON.parse = (...args) => { jasennykset++; return alkuperainen(...args); };
  try {
    tallennaKisa('uusi', { i: 99 }, t, 100);
  } finally {
    JSON.parse = alkuperainen;
  }
  assert.equal(jasennykset, 1);
  assert.equal(Object.keys(lueKisat(t)).length, MAKS_KISOJA);
  assert.equal(lueKisat(t).id0, undefined);
});
