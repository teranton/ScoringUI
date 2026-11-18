import test from 'node:test';
import assert from 'node:assert/strict';

import { haeTekstit, tayta } from './i18n.js';

const NAKYMAT = [
  'app', 'kisaStatus', 'aikataulu', 'aikatauluHaku', 'aikatauluMobiili', 'aikatauluTulostus',
  'aikatauluRyhma', 'henkiloTaulukko', 'henkiloTulokset', 'ilmoittautuminen', 'ilmoittautuneet', 'joukkueTulokset',
  'kirjausTapahtumat', 'liveRadat', 'materiaalit', 'rankingTulokset', 'ryhmaJako', 'saa', 'tulosteTulokset', 'tulosteAikataulu'
];

test('suomella ja englannilla on samat avaimet ja ei-tyhjät tekstit', () => {
  for (const nakyma of NAKYMAT) {
    const fi = haeTekstit(nakyma, 'fi');
    const en = haeTekstit(nakyma, 'en');
    assert.deepEqual(Object.keys(en).sort(), Object.keys(fi).sort(), nakyma);
    for (const [avain, arvo] of [...Object.entries(fi), ...Object.entries(en)]) {
      assert.ok(typeof arvo === 'string' && arvo.length > 0, `${nakyma}.${avain}`);
    }
  }
});

test('muu kuin en palauttaa suomen', () => {
  assert.equal(haeTekstit('app', 'sv'), haeTekstit('app', 'fi'));
  assert.equal(haeTekstit('app', undefined), haeTekstit('app', 'fi'));
});

test('tuntematon osio heittää virheen ja tekstit on jäädytetty', () => {
  assert.throws(() => haeTekstit('aikatauluu', 'fi'), /Tuntematon tekstiosio/);
  assert.ok(Object.isFrozen(haeTekstit('app', 'fi')));
});

test('tayta täyttää paikat ja jättää tuntemattomat', () => {
  assert.equal(tayta('Häiriö {n}/{raja}', { n: 1, raja: 2 }), 'Häiriö 1/2');
  assert.equal(tayta('{a} {b}', { a: 'x' }), 'x {b}');
});
