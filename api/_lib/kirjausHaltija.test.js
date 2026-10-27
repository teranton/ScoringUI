import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haltijaAvain, julkinenHaltija, lisaaTaydennys, lueLaiteRivi, onHaltija, tarkistaLinja, vaihtoPin } from './kirjausHaltija.js';

const SALAISUUS = 'testisalaisuus-joka-on-pitka';
const ID = '1rs_ZwCclYUxrDueBIc65M-49ZAh4XpxSFGOPNqEU3iU';

test('vaihto-PIN: 4 numeroa, sama kuin ScoringLibin Mobiilikirjaus.vaihtoPin, vaihtuu sukupolven mukana', () => {
  // Sama arvo on ScoringLibin testissä (tests/mobiilikirjaus.test.js).
  assert.equal(vaihtoPin({ sheetId: ID, sarake: 2, sukupolvi: 1 }, SALAISUUS), '9689');
  const pinit = new Set([1, 2, 3, 4, 5].map((sukupolvi) => vaihtoPin({ sheetId: ID, sarake: 2, sukupolvi }, SALAISUUS)));
  assert.ok(pinit.size > 1);
  for (const pin of pinit) assert.match(pin, /^\d{4}$/);
});

test('haltija-avain kelpaa vain samalle laitteelle ja sukupolvelle', () => {
  const avain = haltijaAvain({ sheetId: ID, sarake: 2, sukupolvi: 3, laite: 'laite-1' }, SALAISUUS);
  const rivi = lueLaiteRivi([2, 3, 'laite-1', 'Android', '', '', 0]);
  const kohde = { sheetId: ID, sarake: 2, laite: 'laite-1' };
  assert.equal(onHaltija(avain, rivi, kohde, SALAISUUS), true);
  assert.equal(onHaltija(avain, { ...rivi, sukupolvi: 4 }, kohde, SALAISUUS), false);
  assert.equal(onHaltija(avain, rivi, { ...kohde, laite: 'laite-2' }, SALAISUUS), false);
  assert.equal(onHaltija(avain, rivi, { ...kohde, sarake: 3 }, SALAISUUS), false);
  assert.equal(onHaltija(avain, rivi, kohde, `${SALAISUUS}x`), false);
  assert.equal(onHaltija('', rivi, kohde, SALAISUUS), false);
  assert.equal(onHaltija(avain, lueLaiteRivi(undefined), kohde, SALAISUUS), false);
});

test('laiterivi: puuttuva on vapaa, linja luetaan siistittynä', () => {
  assert.deepEqual(julkinenHaltija(lueLaiteRivi([]), 'x'), { vapaa: true, oma: false, tamaLaite: false, nimi: '', otettu: '', tapa: '', lukittu: false });
  const rivi = lueLaiteRivi([2, 1, 'a', 'Android', 'aika', 'vapaa rata', 10, '{"ohitetut":[3,3,"x"],"ohjelma":"SDD"}']);
  assert.equal(julkinenHaltija(rivi, 'a').oma, true);
  assert.equal(julkinenHaltija(rivi, 'a').lukittu, true);
  assert.deepEqual(rivi.linja.ohitetut, [3]);
  assert.equal(lueLaiteRivi([2, 1, 'a', '', '', '', 0, '{rikki']).linja, null);
});

test('linjan tila: vain tunnetut kentät', () => {
  assert.ok(tarkistaLinja(null).virhe);
  assert.ok(tarkistaLinja([]).virhe);
  const { linja } = tarkistaLinja({
    lisatyt: [{ nro: 5, nimi: 'Uusi\u0007 Ampuja', jalkeen: null, kierroksesta: 2, x: 1 }, { nro: 'a' }, 7],
    ohitetut: [1, 1000, 2], keskeyttaneet: 'x', ohjelma: 'SSSD<script>'
  });
  assert.deepEqual(linja, {
    lisatyt: [{ nro: 5, nimi: 'Uusi Ampuja', jalkeen: null, kierroksesta: 2 }],
    ohitetut: [1, 2], tauot: [], tauotPois: [], keskeyttaneet: [], ohjelma: null
  });
});

test('täydennykset: luku hylkää virheelliset, lisäys yhdistää uusimman merkinnät', () => {
  const tyhja = '-'.repeat(25);
  const rivi = lueLaiteRivi(['2', 1, 'l', '', '', '', 0, '', '', JSON.stringify({ 3: 'X'.repeat(25), 0: tyhja, x: tyhja, 4: 'XO' })]);
  assert.deepEqual(rivi.taydennykset, { 3: 'X'.repeat(25) });
  assert.deepEqual(lueLaiteRivi(['2', 1, 'l', '', '', '', 0, '', '', '{rikki']).taydennykset, {});
  const t = lisaaTaydennys({ 3: 'XX' + '-'.repeat(23) }, 3, 'O-O' + '-'.repeat(22));
  assert.equal(t[3], 'OXO' + '-'.repeat(22));
  assert.equal(lisaaTaydennys({}, 5, 'X' + '-'.repeat(24))[5], 'X' + '-'.repeat(24));
});
