import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laitteenNimi, linjaTilasta, lueSiirto, otaLinja, siirtoLinkki, yhdistaSiirto } from './haltija.js';

const MERKIT = 'XXOXX' + 'XO' + '-'.repeat(18);

test('siirtolinkki ja sen luku: kortit, haltija-avain ja linja', () => {
  const linja = { lisatyt: [{ nro: 9, nimi: 'Äijälä Åke' }], ohitetut: [4], tauot: [], tauotPois: [], keskeyttaneet: [1], ohjelma: 'SDD' };
  const linkki = siirtoLinkki({
    perus: 'https://x.example/kirjaus.html?_vercel_share=abc',
    koodi: 'v1.payload.sig',
    haltija: 'h1.3.Ab-_c',
    kortit: [{ nro: 12, versio: 1761558000123, merkit: MERKIT }, { nro: 3, versio: 5, merkit: '-'.repeat(25) }],
    linja
  });
  assert.ok(linkki.startsWith('https://x.example/kirjaus.html?_vercel_share=abc#k=v1.payload.sig&h=h1.3.Ab-_c&c=12.'));
  assert.ok(linkki.length < 400);
  const { koodi, siirto } = lueSiirto(linkki.slice(linkki.indexOf('#')));
  assert.equal(koodi, 'v1.payload.sig');
  assert.equal(siirto.haltija, 'h1.3.Ab-_c');
  assert.deepEqual(siirto.kortit, [{ nro: 12, versio: 1761558000123, merkit: MERKIT }, { nro: 3, versio: 5, merkit: '-'.repeat(25) }]);
  assert.deepEqual(siirto.linja, linja);
});

test('tavallinen ratalinkki ei ole siirto; rikkinäiset osat ohitetaan', () => {
  assert.deepEqual(lueSiirto('#k=v1.a.b'), { koodi: 'v1.a.b', siirto: null });
  const { siirto } = lueSiirto('#k=v1.a.b&h=h1.1.x&c=0.5.X_2.zz.XQ_4.5.X&t=%%%');
  assert.deepEqual(siirto.kortit, [{ nro: 4, versio: 5, merkit: 'X'.padEnd(25, '-') }]);
  assert.equal(siirto.linja, null);
});

test('siirron yhdistäminen: uudempi versio voittaa, siirretyt lähetetään, linja tulee mukaan', () => {
  const tila = { kortit: { 3: { merkit: MERKIT, versio: 10, lahetetty: true }, 4: { merkit: MERKIT, versio: 10, lahetetty: true } }, ohitetut: [], luovutettu: true };
  const uusi = yhdistaSiirto(tila, {
    haltija: 'h1.2.x',
    kortit: [{ nro: 3, versio: 11, merkit: 'X'.repeat(25) }, { nro: 4, versio: 9, merkit: 'O'.repeat(25) }],
    linja: { ohitetut: [7], ohjelma: 'SSSD' }
  });
  assert.deepEqual(uusi.kortit[3], { merkit: 'X'.repeat(25), versio: 11, lahetetty: false });
  assert.equal(uusi.kortit[4].versio, 10);
  assert.deepEqual(uusi.ohitetut, [7]);
  assert.equal(uusi.ohjelma, 'SSSD');
  assert.equal(uusi.siirtoAvain, 'h1.2.x');
  assert.equal(uusi.luovutettu, false);
});

test('linjan tila ja laitteen nimi', () => {
  assert.deepEqual(linjaTilasta({ ohitetut: [2], kortit: {} }), { lisatyt: [], ohitetut: [2], tauot: [], tauotPois: [], keskeyttaneet: [], ohjelma: null });
  assert.deepEqual(otaLinja({ ohjelma: 'SDD', tauot: [1] }, { tauot: [] }), { ohjelma: null, tauot: [] });
  assert.equal(laitteenNimi('abcd-1234', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/130 Mobile Safari'), 'Android Chrome …1234');
  assert.equal(laitteenNimi('abcd-9f9f', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile/15E148 Safari/604.1'), 'iPhone Safari …9f9f');
});
