import test from 'node:test';
import assert from 'node:assert/strict';

import { KAIKKI_SARJAT, laskeNaytettavatRatkoIdt } from './henkiloTulokset.js';
import { HIGH_GUN, haeHighGunSpekseista, sarjanRatkoSija, highGunVoittajat, laskeSarjanSijoitukset, laskentaSarja } from './highGun.js';
import { sarjaNakyma, sarjanNimi } from './openSarja.js';

// Beretta Gold Cup 2026 (Hyvinkää): High Gun -palkinto parhaalle, luokka A.
const ampuja = (id, sarja, tulos) => ({ id, nimi: id, sarja, tulos: String(tulos) });
const AMPUJAT = [
  ampuja('Kumpuvaara Rasmus', 'A', 191),
  ampuja('Ojansuu Oliver', 'A', 190),
  ampuja('Moilanen Juhani', 'A', 188),
  ampuja('Lindh Oliver', 'A', 185),
  ampuja('Raassina Miko', 'A', 185),
  ampuja('Selen Anton', 'A', 184),
  ampuja('Juht Emil', 'B', 183)
];
const HG1 = { paikat: 1, poisSarjoista: true };
const sijat = (lista) => lista.map((a) => [a.laskettuSija, a.id]);

test('asetukset: HIGH_GUN paikat ja HIGH_GUN_POIS_SARJOISTA, oletus pois sarjoista', () => {
  assert.deepEqual(haeHighGunSpekseista([['HIGH_GUN', '1']]), { paikat: 1, poisSarjoista: true });
  assert.deepEqual(haeHighGunSpekseista([['High gun', '3'], ['HIGH_GUN_POIS_SARJOISTA', 'FALSE']]), { paikat: 3, poisSarjoista: false });
  assert.deepEqual(haeHighGunSpekseista([['HIGH_GUN', '']]), { paikat: 0, poisSarjoista: true });
  assert.deepEqual(haeHighGunSpekseista([['HIGH_GUN', 'kolme']]), { paikat: 0, poisSarjoista: true });
  assert.deepEqual(haeHighGunSpekseista([]), { paikat: 0, poisSarjoista: true });
});

test('High Gun -näkymässä vain voittajat, sarjassa voittaja pois ja seuraava nousee', () => {
  assert.deepEqual([...highGunVoittajat(AMPUJAT, HG1, 3)], ['Kumpuvaara Rasmus']);
  assert.deepEqual(sijat(laskeSarjanSijoitukset(AMPUJAT, HIGH_GUN, 3, HG1)), [['1', 'Kumpuvaara Rasmus']]);

  const a = laskeSarjanSijoitukset(AMPUJAT, 'A', 3, HG1);
  assert.deepEqual(sijat(a).slice(0, 4), [
    ['1', 'Ojansuu Oliver'],
    ['2', 'Moilanen Juhani'],
    ['3', 'Lindh Oliver'],
    ['3', 'Raassina Miko']
  ]);
  // Kolmas sija on tasan ilman High Gun -voittajaa: ratko näkyy molemmille.
  assert.deepEqual([...laskeNaytettavatRatkoIdt(a, laskentaSarja('A'), 3)].sort(), ['Lindh Oliver', 'Raassina Miko']);

  // Yhteinen sarja pysyy ennallaan.
  assert.equal(laskeSarjanSijoitukset(AMPUJAT, KAIKKI_SARJAT, 3, HG1)[0].id, 'Kumpuvaara Rasmus');
});

test('ilman pois sarjoista -asetusta voittaja pysyy sarjassa', () => {
  const a = laskeSarjanSijoitukset(AMPUJAT, 'A', 3, { paikat: 1, poisSarjoista: false });
  assert.deepEqual(sijat(a)[0], ['1', 'Kumpuvaara Rasmus']);
});

test('High Gun -nappi yhteisen sarjan jälkeen, luokkakilpailussa viimeisenä', () => {
  assert.deepEqual(sarjaNakyma(['A', 'B'], 'open', HG1).napit, [KAIKKI_SARJAT, HIGH_GUN, 'A', 'B']);
  assert.deepEqual(sarjaNakyma(['A', 'B'], null, HG1).napit, ['A', 'B', HIGH_GUN]);
  assert.deepEqual(sarjaNakyma(['A', 'B'], null, { paikat: 0, poisSarjoista: true }).napit, ['A', 'B']);
  assert.equal(sarjanNimi(HIGH_GUN, 'y'), 'High Gun');
});

test('High Gun -paikkoja enemmän kuin RATKO_PALKINTO_SIJA: ratko lasketaan kaikille paikoille', () => {
  const hg4 = { paikat: 4, poisSarjoista: true };
  assert.equal(sarjanRatkoSija(HIGH_GUN, 3, hg4), 4);
  assert.equal(sarjanRatkoSija('A', 3, hg4), 3);
  // Neljäs paikka on tasan (Lindh ja Raassina 185): molemmat ovat voittajia, kunnes ratko on ammuttu.
  assert.deepEqual([...highGunVoittajat(AMPUJAT, hg4, 3)].sort(),
    ['Kumpuvaara Rasmus', 'Lindh Oliver', 'Moilanen Juhani', 'Ojansuu Oliver', 'Raassina Miko']);
  const hg = laskeSarjanSijoitukset(AMPUJAT, HIGH_GUN, 3, hg4);
  assert.deepEqual([...laskeNaytettavatRatkoIdt(hg, laskentaSarja(HIGH_GUN), sarjanRatkoSija(HIGH_GUN, 3, hg4))].sort(),
    ['Lindh Oliver', 'Raassina Miko']);
});
