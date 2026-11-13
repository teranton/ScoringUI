import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avautuvanPaatos, toisaallaTeksti } from './sovellus.js';

const selain = { id: 'a', sovellus: false };
const sovellus = { id: 'b', sovellus: true };

test('avautuvanPaatos: sovellus ottaa aina, selain kysyy vain sovellukselta', () => {
  // "Vaihda sovellukseen": sovellus ottaa kirjauksen selaimelta.
  assert.equal(avautuvanPaatos(sovellus, selain), 'ota');
  assert.equal(avautuvanPaatos(sovellus, { ...sovellus, id: 'c' }), 'ota');
  assert.equal(avautuvanPaatos(sovellus, null), 'ota');
  // Vanha välilehti latautuu uudelleen: kysyy ensin, onko sovellus auki.
  assert.equal(avautuvanPaatos(selain, sovellus), 'kysy');
  // Toinen välilehti tai ei omistajaa: uusin ottaa.
  assert.equal(avautuvanPaatos(selain, { ...selain, id: 'c' }), 'ota');
  assert.equal(avautuvanPaatos(selain, null), 'ota');
  assert.equal(avautuvanPaatos(selain, { ...selain }), 'ota');
});

test('toisaallaTeksti: missä kirjaus jatkuu', () => {
  assert.equal(toisaallaTeksti(false, true), 'asennetussa sovelluksessa');
  assert.equal(toisaallaTeksti(true, false), 'selaimessa');
  assert.equal(toisaallaTeksti(false, false), 'toisessa välilehdessä');
  assert.equal(toisaallaTeksti(true, true), 'toisessa sovellusikkunassa');
});
