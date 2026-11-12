import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLETUSNAPIT, lueNapit, nappiTekstina, opetaNappi, tallennaNapit, toimintoNappaimesta } from './napit.js';

const painallus = (code, lisat = {}) => ({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'BODY' }, ...lisat });

function muistiVarasto() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

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

test('opetettu näppäin korvaa toiminnon näppäimet ja poistuu muilta', () => {
  const napit = opetaNappi(OLETUSNAPIT, 'O', 'PageDown');
  assert.deepEqual(napit.O, ['PageDown']);
  assert.deepEqual(napit.X, ['KeyX']);
  assert.deepEqual(napit.PERU, OLETUSNAPIT.PERU);
  assert.equal(toimintoNappaimesta(painallus('PageDown'), napit), 'O');
  assert.equal(toimintoNappaimesta(painallus('KeyO'), napit), null);
});

test('napit tallentuvat laitteelle ja oletukset palautuvat', () => {
  const varasto = muistiVarasto();
  assert.equal(lueNapit(varasto), OLETUSNAPIT);
  const napit = opetaNappi(OLETUSNAPIT, 'X', 'Enter');
  tallennaNapit(napit, varasto);
  assert.deepEqual(lueNapit(varasto), napit);
  tallennaNapit(OLETUSNAPIT, varasto);
  assert.equal(lueNapit(varasto), OLETUSNAPIT);
});

test('rikkinäinen tallennus ei estä kirjausta', () => {
  const varasto = muistiVarasto();
  varasto.setItem('kirjaus-napit', '{rikki');
  assert.equal(lueNapit(varasto), OLETUSNAPIT);
  varasto.setItem('kirjaus-napit', JSON.stringify({ X: ['KeyZ'] }));
  assert.deepEqual(lueNapit(varasto), { X: ['KeyZ'], O: OLETUSNAPIT.O, PERU: OLETUSNAPIT.PERU });
  assert.equal(lueNapit({ getItem: () => { throw new Error('estetty'); } }), OLETUSNAPIT);
});

test('näppäin luettavaksi', () => {
  assert.equal(nappiTekstina('KeyX'), 'X');
  assert.equal(nappiTekstina('Digit3'), '3');
  assert.equal(nappiTekstina('Period'), '.');
  assert.equal(nappiTekstina('PageDown'), 'PageDown');
});
