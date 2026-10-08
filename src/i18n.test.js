import test from 'node:test';
import assert from 'node:assert/strict';

import { haeTekstit } from './i18n.js';

const NAKYMAT = [
  'app', 'kisaStatus', 'aikataulu', 'aikatauluHaku', 'aikatauluMobiili', 'aikatauluTulostus',
  'aikatauluRyhma', 'henkiloTaulukko', 'henkiloTulokset', 'ilmoittautuneet', 'joukkueTulokset',
  'materiaalit', 'ryhmaJako'
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
