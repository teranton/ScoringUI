import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLETUSNAPIT, jasennaNapit, nappiTekstina, onOletus, opetaNappi, toimintoNappaimesta } from './napit.js';

const painallus = (code, lisat = {}) => ({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'BODY' }, ...lisat });

test('käsiohjaimen ja kaukosäätimen oletusnäppäimet', () => {
  assert.equal(toimintoNappaimesta(painallus('KeyX')), 'X');
  assert.equal(toimintoNappaimesta(painallus('KeyO')), 'O');
  assert.equal(toimintoNappaimesta(painallus('KeyP')), 'PERU');
  assert.equal(toimintoNappaimesta(painallus('PageDown')), 'X');
  assert.equal(toimintoNappaimesta(painallus('PageUp')), 'O');
  assert.equal(toimintoNappaimesta(painallus('KeyB')), 'PERU');
  assert.equal(toimintoNappaimesta(painallus('KeyA')), null);
});

test('pidetty näppäin, yhdistelmät ja tekstikenttä eivät merkitse', () => {
  assert.equal(toimintoNappaimesta(painallus('KeyX', { repeat: true })), null);
  assert.equal(toimintoNappaimesta(painallus('KeyX', { ctrlKey: true })), null);
  assert.equal(toimintoNappaimesta(painallus('KeyO', { metaKey: true })), null);
  assert.equal(toimintoNappaimesta(painallus('KeyO', { target: { tagName: 'INPUT' } })), null);
  assert.equal(toimintoNappaimesta(painallus('KeyO', { target: { tagName: 'DIV', isContentEditable: true } })), null);
});

test('opetettu näppäin lisätään toiminnolle ja poistuu muilta', () => {
  const napit = opetaNappi(OLETUSNAPIT, 'O', 'PageDown');
  assert.deepEqual(napit.O, ['KeyO', 'PageUp', 'PageDown']);
  assert.deepEqual(napit.X, ['KeyX']);
  assert.deepEqual(napit.PERU, OLETUSNAPIT.PERU);
  assert.equal(toimintoNappaimesta(painallus('PageDown'), napit), 'O');
  // Käsiohjaimen kirjain toimii edelleen.
  assert.equal(toimintoNappaimesta(painallus('KeyO'), napit), 'O');
});

test('tuntematonta näppäintä ei opeteta', () => {
  assert.equal(opetaNappi(OLETUSNAPIT, 'X', ''), null);
  assert.equal(opetaNappi(OLETUSNAPIT, 'X', 'Unidentified'), null);
});

test('oletukset tunnistetaan sisällöstä', () => {
  assert.equal(onOletus(OLETUSNAPIT), true);
  assert.equal(onOletus(JSON.parse(JSON.stringify(OLETUSNAPIT))), true);
  assert.equal(onOletus(opetaNappi(OLETUSNAPIT, 'X', 'Enter')), false);
});

test('tallennetut napit: puuttuva toiminto saa oletukset ilman jo käytettyjä', () => {
  assert.equal(jasennaNapit(null), OLETUSNAPIT);
  assert.equal(jasennaNapit('rikki'), OLETUSNAPIT);
  const napit = jasennaNapit({ X: ['KeyO', ''], PERU: ['KeyP'] });
  assert.deepEqual(napit, { X: ['KeyO'], O: ['PageUp'], PERU: ['KeyP'] });
  assert.equal(toimintoNappaimesta(painallus('KeyO'), napit), 'X');
});

test('näppäin luettavaksi', () => {
  assert.equal(nappiTekstina('KeyX'), 'X');
  assert.equal(nappiTekstina('Digit3'), '3');
  assert.equal(nappiTekstina('Period'), '.');
  assert.equal(nappiTekstina('PageDown'), 'PageDown');
});
