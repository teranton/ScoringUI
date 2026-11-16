import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asemaTulokset, kaavaSarakkeet, kompakTulos, muuttuvat, onSuoraan, paaSarakkeet, paaSolut, suoraTulos, tulosSolut
} from './kirjausTulokset.js';

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
  // Muotoiltu ja muotoilematon tunnus ovat sama asema.
  const numerot = { ...LAYOUT, asemat: [{ sarake: 3, id: 1, kohteita: 2 }, { sarake: 4, id: '2', kohteita: 3 }] };
  assert.deepEqual(asemaTulokset(numerot, { merkit: 'XOXXO', kuitatut: ['1,0', '2'] }), [{ sarake: 3, tulos: 1 }, { sarake: 4, tulos: 2 }]);
  assert.deepEqual(asemaTulokset(LAYOUT, null), [{ sarake: 3, tulos: null }, { sarake: 4, tulos: null }]);
  // FITASC-pisteet: puhelimen asemat eivät ole taulukon asemia, joten vain koko kortin hyväksyntä.
  const fitasc = { nro: 1, asemat: [{ sarake: 1, id: '1', kohteita: 3 }], kohteita: 3, ohjelma: [{ sinkut: 1, tuplat: 1 }] };
  assert.deepEqual(asemaTulokset(fitasc, { merkit: 'XXO', kuitatut: ['1'] }), [{ sarake: 1, tulos: null }]);
  assert.deepEqual(asemaTulokset(fitasc, { merkit: 'XXO', hyvaksytty: 'x' }), [{ sarake: 1, tulos: 2 }]);
});

test('tulossolut pääsivulta: NRO ja tulossarake otsikon mukaan', () => {
  assert.deepEqual(paaSarakkeet(['Ryhmä', 'Nro.', 'NIMI', '1', 2, 'TULOS YHT.', '1']), { nro: 1, nimi: 2, tulos: { 1: 3, 2: 4 } });
  const rivit = [['NRO', 'NIMI', 1, 2], [5, 'Aalto A', '', ''], [7, 'Berg B', '', '']];
  assert.deepEqual(tulosSolut(rivit, [{ nro: 7, sarake: 2, nimi: 'Bertta Berg' }, { nro: 8, sarake: 1 }, { nro: 5, sarake: 3 }, { nro: 5, sarake: 1, nimi: 'Ek E' }]), [
    { nro: 7, sarake: 2, nimi: 'Bertta Berg', rivi: 2, sarakeIndeksi: 3 },
    { nro: 8, sarake: 1, puuttuu: 'AMPUJAA EI OLE PÄÄSIVULLA' },
    { nro: 5, sarake: 3, puuttuu: 'TULOSSARAKETTA 3 EI OLE' },
    { nro: 5, sarake: 1, nimi: 'Ek E', puuttuu: 'NIMI EI TÄSMÄÄ PÄÄSIVUUN (Aalto A)' }
  ]);
});

const typed = (arvo) => ({ arvo, kaava: false, taytetty: false });

test('suora tulos: tyhjään, oma edellinen päivittyy tai poistuu, paperin ja kaavan tulos jää', () => {
  const kirjoitus = (arvo, huom) => ({ arvo, huom, estetty: `${huom} EPÄONNISTUI (PÄÄSIVU SUOJATTU)` });
  assert.deepEqual(suoraTulos({ solu: undefined, vanha: null, uusi: 20, sarake: 2 }), kirjoitus(20, 'TULOS 20 SARAKKEESEEN 2'));
  assert.deepEqual(suoraTulos({ solu: typed(' '), vanha: null, uusi: 0, sarake: 2 }), kirjoitus(0, 'TULOS 0 SARAKKEESEEN 2'));
  assert.deepEqual(suoraTulos({ solu: typed(''), vanha: null, uusi: null, sarake: 2 }), {});
  assert.deepEqual(suoraTulos({ solu: typed(20), vanha: 18, uusi: 20, sarake: 2 }), {});
  assert.deepEqual(suoraTulos({ solu: typed(20), vanha: 20, uusi: 21, sarake: 2 }), kirjoitus(21, 'TULOS 20 → 21 SARAKKEESEEN 2'));
  assert.deepEqual(suoraTulos({ solu: typed(20), vanha: 20, uusi: null, sarake: 2 }), kirjoitus('', 'TULOS 20 POISTETTU SARAKKEESTA 2 (KORTTI KESKEN)'));
  assert.deepEqual(suoraTulos({ solu: typed(19), vanha: 20, uusi: 21, sarake: 2 }), { huom: 'TULOS 21 EI KIRJOITETTU: SARAKKEESSA 2 ON 19' });
  assert.deepEqual(suoraTulos({ solu: typed(19), vanha: 20, uusi: null, sarake: 2 }), {});
  assert.deepEqual(suoraTulos({ solu: typed('DNS'), vanha: null, uusi: 21, sarake: 2 }), { huom: 'TULOS 21 EI KIRJOITETTU: SARAKKEESSA 2 ON DNS' });
  const kaava = { arvo: 21, kaava: true, taytetty: false };
  assert.deepEqual(suoraTulos({ solu: kaava, vanha: 21, uusi: 22, sarake: 2 }), { huom: 'TULOS 22 EI KIRJOITETTU: SARAKKEESSA 2 ON KAAVA' });
  assert.deepEqual(suoraTulos({ solu: { arvo: '', kaava: true }, vanha: null, uusi: 22, sarake: 2 }), { huom: 'TULOS 22 EI KIRJOITETTU: SARAKKEESSA 2 ON KAAVA' });
});

test('pääsivu soluina: kaava ja taulukkokaavan täyttämä sarake tunnistetaan', () => {
  const { rivit, tiedot } = paaSolut([
    { values: [{ userEnteredValue: { stringValue: 'NRO' }, effectiveValue: { stringValue: 'NRO' } }, { effectiveValue: { stringValue: '1' } }, {}] },
    { values: [{ userEnteredValue: { formulaValue: '=ROW()-1' }, effectiveValue: { numberValue: 1 } }, { effectiveValue: { numberValue: 20 } },
      { userEnteredValue: { formulaValue: '=ARRAYFORMULA(A2:A)' }, effectiveValue: { numberValue: 1 } }] },
    { values: [{ userEnteredValue: { numberValue: 2 }, effectiveValue: { numberValue: 2 } }, {}, {}] }
  ]);
  assert.deepEqual(rivit, [['NRO', '1', ''], [1, 20, 1], [2, '', '']]);
  assert.equal(tiedot[1][0].kaava, true);
  assert.equal(tiedot[1][1].taytetty, true);
  assert.deepEqual([...kaavaSarakkeet(tiedot, [0, 1, 2])], [1, 2]);
  // Yhden solun kaava, jonka sisällä on FILTER, ei lukitse saraketta; otsikkorivin taulukkokaava lukitsee.
  const kaava = (f) => ({ arvo: 1, kaava: true, kaavaTeksti: f, taytetty: false });
  assert.deepEqual([...kaavaSarakkeet([[kaava('={"1";ARRAYFORMULA(A2:A)}')], [kaava('=INDEX(FILTER(A:A;A:A>0);1)')]], [0])], [0]);
  assert.deepEqual([...kaavaSarakkeet([[{}], [kaava('=INDEX(FILTER(A:A;A:A>0);1)')]], [0])], []);
});

test('muuttuvat: vain kohteet, joiden valmis tulos muuttuu', () => {
  assert.deepEqual(muuttuvat([{ uusi: null, vanha: null }, { uusi: 3, vanha: null }, { uusi: null, vanha: 2 }, { uusi: 4, vanha: 4 }]),
    [{ uusi: 3, vanha: null }, { uusi: null, vanha: 2 }]);
});
