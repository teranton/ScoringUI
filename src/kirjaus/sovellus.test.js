import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ikkunanVastaus } from './sovellus.js';

const selain = { id: 'a', kohde: 's:3', sovellus: false };
const sovellus = { id: 'b', kohde: 's:3', sovellus: true };

test('ikkunanVastaus: oma viesti ja toinen rata ohitetaan', () => {
  assert.equal(ikkunanVastaus(selain, { ...selain }), 'ohita');
  assert.equal(ikkunanVastaus(selain, { ...sovellus, kohde: 's:4' }), 'ohita');
  assert.equal(ikkunanVastaus(selain, null), 'ohita');
});

test('ikkunanVastaus: sovellus voittaa selaimen, ellei selainta valittu', () => {
  // Sovellus aukeaa ("Vaihda sovellukseen"): selaimen välilehti pysähtyy.
  assert.equal(ikkunanVastaus(selain, sovellus), 'pysahdy');
  // Vanha välilehti latautuu uudelleen sovelluksen ollessa auki: sovellus vastaa, ja välilehti pysähtyy.
  assert.equal(ikkunanVastaus(sovellus, selain), 'vastaa');
  // Käyttäjä valitsi välilehdellä "Jatka tässä selaimessa".
  assert.equal(ikkunanVastaus(sovellus, { ...selain, pakota: true }), 'pysahdy');
});

test('ikkunanVastaus: samanlaisista ikkunoista uusin voittaa', () => {
  assert.equal(ikkunanVastaus(selain, { ...selain, id: 'c' }), 'pysahdy');
  assert.equal(ikkunanVastaus(sovellus, { ...sovellus, id: 'c' }), 'pysahdy');
});
