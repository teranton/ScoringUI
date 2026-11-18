import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLETUSNAPIT, PITKA_PAINALLUS_MS, jasennaNapit, luoPainallukset, nappiTekstina, onOletus, opetaNappi, toimintoNappaimesta } from './napit.js';

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

test('pidetty näppäin on yksi painallus, vaikka keydown toistuisi ilman repeat-merkintää', () => {
  const p = luoPainallukset();
  assert.equal(p.alas('KeyX', 0), true);
  assert.equal(p.alas('KeyX', 500), false);
  assert.equal(p.alas('KeyX', 1500), false);
  assert.equal(p.alas('KeyO', 600), true);
  // Merkitsevä painallus ei odottanut, joten pitkäkään vapautus ei hyväksy.
  assert.equal(p.ylos('KeyX', 2000), false);
  assert.equal(p.alas('KeyX', 2100), true);
});

test('pitkä painallus vain, kun painallus odotti ja oli pohjassa riittävän kauan', () => {
  const p = luoPainallukset();
  p.alas('KeyX', 0);
  p.odota('KeyX');
  assert.equal(p.ylos('KeyX', PITKA_PAINALLUS_MS - 1), false);
  p.alas('KeyX', 0);
  p.odota('KeyX');
  p.alas('KeyX', 300);
  assert.equal(p.ylos('KeyX', PITKA_PAINALLUS_MS), true);
  assert.equal(p.ylos('KeyX', 5000), false);
  p.alas('KeyX', 0);
  p.odota('KeyX');
  p.tyhjenna();
  assert.equal(p.ylos('KeyX', 5000), false);
  assert.equal(p.alas('KeyX', 5000), true);
});
