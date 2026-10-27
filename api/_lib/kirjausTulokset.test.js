import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asemaTulokset, kompakTulos, muuttuvat, onSuoraan, paaSarakkeet, soluA1, suoraTulos, tulosSolut } from './kirjausTulokset.js';

test('MOBIILI_TULOKSET: vain SUORAAN kirjoittaa', () => {
  assert.equal(onSuoraan([['MOBIILI_TULOKSET', 'suoraan']]), true);
  assert.equal(onSuoraan([['MOBIILI_TULOKSET', 'TOIMISTO']]), false);
  assert.equal(onSuoraan([]), false);
});

test('Compak-kortin tulos vain kun kaikki 25 kiekkoa on merkitty', () => {
  assert.equal(kompakTulos('XXXXO'.repeat(5)), 20);
  assert.equal(kompakTulos('XXXXO'.repeat(4) + '----X'), null);
  assert.equal(kompakTulos(undefined), null);
});

const LAYOUT = { nro: 1, asemat: [{ sarake: 3, id: 'C', kohteita: 2 }, { sarake: 4, id: 'D', kohteita: 3 }], kohteita: 5 };

test('ryhmäkortin asemat: valmis ja kuitattu asema, koko kortin hyväksyntä kuittaa kaikki', () => {
  assert.deepEqual(asemaTulokset(LAYOUT, { merkit: 'XOXX-', kuitatut: ['C', 'D'] }), [{ sarake: 3, tulos: 1 }, { sarake: 4, tulos: null }]);
  assert.deepEqual(asemaTulokset(LAYOUT, { merkit: 'XOXXO', kuitatut: [] }), [{ sarake: 3, tulos: null }, { sarake: 4, tulos: null }]);
  assert.deepEqual(asemaTulokset(LAYOUT, { merkit: 'XOXXO', hyvaksytty: '27.10.2026' }), [{ sarake: 3, tulos: 1 }, { sarake: 4, tulos: 2 }]);
  assert.deepEqual(asemaTulokset(LAYOUT, null), [{ sarake: 3, tulos: null }, { sarake: 4, tulos: null }]);
  // FITASC-pisteet: puhelimen asemat eivät ole taulukon asemia, joten vain koko kortin hyväksyntä.
  const fitasc = { nro: 1, asemat: [{ sarake: 1, id: '1', kohteita: 3 }], kohteita: 3, ohjelma: [{ sinkut: 1, tuplat: 1 }] };
  assert.deepEqual(asemaTulokset(fitasc, { merkit: 'XXO', kuitatut: ['1'] }), [{ sarake: 1, tulos: null }]);
  assert.deepEqual(asemaTulokset(fitasc, { merkit: 'XXO', hyvaksytty: 'x' }), [{ sarake: 1, tulos: 2 }]);
});

test('tulossolut pääsivulta: NRO ja tulossarake otsikon mukaan', () => {
  assert.deepEqual(paaSarakkeet(['Ryhmä', 'NRO', 'NIMI', '1', 2, 'TULOS YHT.', '1']), { nro: 1, tulos: { 1: 3, 2: 4 } });
  const rivit = [['NRO', 'NIMI', 1, 2], [5, 'A', '', ''], [7, 'B', '', '']];
  assert.deepEqual(tulosSolut(rivit, [{ nro: 7, sarake: 2 }, { nro: 8, sarake: 1 }, { nro: 5, sarake: 3 }]), [
    { nro: 7, sarake: 2, rivi: 2, sarakeIndeksi: 3 },
    { nro: 8, sarake: 1, puuttuu: 'AMPUJAA EI OLE PÄÄSIVULLA' },
    { nro: 5, sarake: 3, puuttuu: 'TULOSSARAKETTA 3 EI OLE' }
  ]);
  assert.equal(soluA1(2, 27), 'AB3');
});

test('suora tulos: tyhjään, oma edellinen päivittyy tai poistuu, paperin ja kaavan tulos jää', () => {
  assert.deepEqual(suoraTulos({ solu: undefined, vanha: null, uusi: 20, sarake: 2 }), { arvo: 20, huom: 'TULOS 20 SARAKKEESEEN 2' });
  assert.deepEqual(suoraTulos({ solu: ' ', vanha: null, uusi: 0, sarake: 2 }), { arvo: 0, huom: 'TULOS 0 SARAKKEESEEN 2' });
  assert.deepEqual(suoraTulos({ solu: undefined, vanha: null, uusi: null, sarake: 2 }), {});
  assert.deepEqual(suoraTulos({ solu: 20, vanha: 18, uusi: 20, sarake: 2 }), {});
  assert.deepEqual(suoraTulos({ solu: 20, vanha: 20, uusi: 21, sarake: 2 }), { arvo: 21, huom: 'TULOS 20 → 21 SARAKKEESEEN 2' });
  assert.deepEqual(suoraTulos({ solu: 20, vanha: 20, uusi: null, sarake: 2 }), { arvo: '', huom: 'TULOS 20 POISTETTU SARAKKEESTA 2 (KORTTI KESKEN)' });
  assert.deepEqual(suoraTulos({ solu: 19, vanha: 20, uusi: 21, sarake: 2 }), { huom: 'TULOS 21 EI KIRJOITETTU: SARAKKEESSA 2 ON 19' });
  assert.deepEqual(suoraTulos({ solu: 19, vanha: 20, uusi: null, sarake: 2 }), {});
  assert.deepEqual(suoraTulos({ solu: '=A1', vanha: null, uusi: 21, sarake: 2 }), { huom: 'TULOS 21 EI KIRJOITETTU: SARAKKEESSA 2 ON KAAVA' });
  assert.deepEqual(suoraTulos({ solu: 'DNS', vanha: null, uusi: 21, sarake: 2 }), { huom: 'TULOS 21 EI KIRJOITETTU: SARAKKEESSA 2 ON DNS' });
});

test('muuttuvat: vain kohteet, joiden kortti on tai oli valmis', () => {
  assert.deepEqual(muuttuvat([{ uusi: null, vanha: null }, { uusi: 3, vanha: null }, { uusi: null, vanha: 2 }]), [{ uusi: 3, vanha: null }, { uusi: null, vanha: 2 }]);
});
