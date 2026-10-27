import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// public/kirjaus-sw.js on tavallinen skripti; ajetaan se eristetyssä kontekstissa ja testataan puhtaat apufunktiot.
function lataaSw() {
  const self = { addEventListener() {}, location: { origin: 'https://esim.fi' } };
  vm.runInNewContext(readFileSync(new URL('../../public/kirjaus-sw.js', import.meta.url), 'utf8'), { self, URL });
  return self.kirjausSw;
}

const sw = lataaSw();
const { sivunTiedostot } = sw;
// Toisen kontekstin oliot tämän kontekstin olioiksi, jotta deepEqual vertaa vain sisältöä.
const lahetettavat = (rivi) => JSON.parse(JSON.stringify(sw.lahetettavat(rivi)));

test('sivunTiedostot: omat skriptit, tyylit ja kuvakkeet, ei ulkoisia', () => {
  const html = `<link rel="icon" href="/favicon.png"><link rel="manifest" href="/kirjaus.webmanifest" />
    <script type="module" crossorigin src="/assets/kirjaus-AbC123.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/client-x1.js">
    <link rel="stylesheet" crossorigin href="/assets/index-y2.css">
    <a href="https://muu.fi/x.js"></a><link href="//cdn.fi/y.css">`;
  assert.deepEqual([...sivunTiedostot(html)].sort(), [
    '/assets/client-x1.js', '/assets/index-y2.css', '/assets/kirjaus-AbC123.js', '/favicon.png', '/kirjaus.webmanifest'
  ]);
});

const rivi = (tila) => ({ koodi: 'v1.a.b', laite: 'laite-1', tila: { haltija: 'h1.1.x', ...tila } });

test('lahetettavat: vain lähettämättömät kortit nimineen', () => {
  const kortit = {
    3: { merkit: 'X'.repeat(25), versio: 5, lahetetty: false },
    7: { merkit: 'O'.repeat(25), versio: 2, lahetetty: true }
  };
  assert.deepEqual(lahetettavat(rivi({ kortit, avaus: { nimet: { 3: 'Matti' } } })), [
    { nro: 3, merkit: 'X'.repeat(25), versio: 5, nimi: 'Matti' }
  ]);
});

test('lahetettavat: sivun tallentamat nimet (myös laitteella lisätyt) ennen avauksen nimiä', () => {
  const kortit = { 12: { merkit: '-'.repeat(25), versio: 1, lahetetty: false } };
  assert.equal(lahetettavat({ ...rivi({ kortit, avaus: { nimet: {} } }), nimet: { 12: 'Lisätty Liisa' } })[0].nimi, 'Lisätty Liisa');
});

test('lahetettavat: ei mitään ilman koodia tai haltija-avainta, eikä korvatulta tai luovuttaneelta laitteelta', () => {
  const kortit = { 3: { merkit: '-'.repeat(25), versio: 1, lahetetty: false } };
  assert.equal(lahetettavat(rivi({ kortit })).length, 1);
  assert.deepEqual(lahetettavat({ ...rivi({ kortit }), koodi: '' }), []);
  assert.deepEqual(lahetettavat(rivi({ kortit, haltija: null })), []);
  assert.deepEqual(lahetettavat(rivi({ kortit, korvattu: { nimi: 'x' } })), []);
  assert.deepEqual(lahetettavat(rivi({ kortit, luovutettu: true })), []);
});
