import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asemaRivit, asemienTulokset, fitascOhjelma, lueLayoutit, lueRyhmaKorttiRivi, onkoRyhmaMerkit, ryhmaKoko, ryhmaKorttiOtsikko,
  ryhmaKorttiRivi, ryhmanAmpujat, ryhmanVuorot, tarkistaRyhmaTallennus
} from './kirjausRyhma.js';

const SPEKSIT = [
  ['RATA1_NIMI', 'Metsä'],
  ['RATA2_NIMI', 'Järvi'],
  ['LAYOUT/KISA', '4'],
  ['AIKATAULURYHMAKOKO', '3'],
  ['', '', '', 'Asema', 'Maks'],
  ['', '', '', '1', '10'],
  ['', '', '', '2', '15'],
  ['', '', '', '3', '12'],
  ['', '', '', '4', '13']
];

test('asemataulukko otsikon alta, ilman otsikkoa J3:K28', () => {
  assert.deepEqual(asemaRivit(SPEKSIT).slice(0, 5), [['1', '10'], ['2', '15'], ['3', '12'], ['4', '13'], ['', '']]);
  const vanha = [[], [], ['', '', '', '', '', '', '', 'A', '', '1', '25']];
  assert.deepEqual(asemaRivit(vanha)[0], ['1', '25']);
});

test('layoutit: asemat jaetaan tasan nimetyille layouteille, tulossarake juoksee', () => {
  const { layoutit } = lueLayoutit(SPEKSIT);
  assert.deepEqual(layoutit, [
    { nro: 1, nimi: 'Metsä', asemat: [{ sarake: 1, id: '1', kohteita: 10 }, { sarake: 2, id: '2', kohteita: 15 }], kohteita: 25 },
    { nro: 2, nimi: 'Järvi', asemat: [{ sarake: 3, id: '3', kohteita: 12 }, { sarake: 4, id: '4', kohteita: 13 }], kohteita: 25 }
  ]);
  assert.match(lueLayoutit([['LAYOUT/KISA', '4']]).virhe, /nimet/);
  assert.match(lueLayoutit([...SPEKSIT.slice(0, 2), ['LAYOUT/KISA', '3'], ...SPEKSIT.slice(3)]).virhe, /tasan/);
  // Ilman LAYOUT/KISA-arvoa asemat, joilla on maksimi.
  assert.equal(lueLayoutit([SPEKSIT[0], ...SPEKSIT.slice(4)]).layoutit[0].asemat.length, 4);
});

test('FITASC-ohjelma: pisteet pilkuilla, sinkut ja tuplat; layoutille vain kun kiekot täsmäävät', () => {
  assert.deepEqual(fitascOhjelma('4S+2D, 4s+1d; 5S'), [{ sinkut: 4, tuplat: 2 }, { sinkut: 4, tuplat: 1 }, { sinkut: 5, tuplat: 0 }]);
  assert.deepEqual(fitascOhjelma('2D'), [{ sinkut: 0, tuplat: 2 }]);
  for (const huono of ['', 'SSSD', '4X', '0S+0D', null]) assert.equal(fitascOhjelma(huono), null);
  const fitasc = [
    ['RATA1_NIMI', 'A'], ['RATA2_NIMI', 'B'], ['LAYOUT/KISA', '2'],
    ['RATA1_OHJELMA', '4S+2D, 4S+1D, 5S+1D, 2S+1D'], ['RATA2_OHJELMA', '4S+2D'],
    ['', '', '', 'Asema', 'Maks'], ['', '', '', '1', '25'], ['', '', '', '2', '25']
  ];
  const { layoutit } = lueLayoutit(fitasc);
  assert.equal(layoutit[0].ohjelma.length, 4);
  // 4S+2D = 8 kiekkoa, ei 25: ohjelmaa ei käytetä.
  assert.equal(layoutit[1].ohjelma, undefined);
  // Monen aseman layoutille (Sporting) ohjelmaa ei lueta.
  assert.equal(lueLayoutit([...SPEKSIT, ['RATA1_OHJELMA', '5S+5D']]).layoutit[0].ohjelma, undefined);
});

test('ryhmän ampujat: Ryhmä-sarake, muuten numero / ryhmäkoko; vapaa paikka ohitetaan', () => {
  const rivit = [
    ['NRO', 'Ryhmä', 'NIMI'],
    ['1', '1', 'Aalto A'], ['2', '1', 'Berg B'], ['4', '2', 'Dahl D'], ['3', '2', 'Ek E'], ['5', '2', '5'], ['6', '', 'Fors F']
  ];
  // Nro 6 ilman ryhmää: 6 / 3 → ryhmä 2.
  assert.deepEqual(ryhmanAmpujat(rivit, 2, 3), [{ nro: 3, nimi: 'Ek E' }, { nro: 4, nimi: 'Dahl D' }, { nro: 6, nimi: 'Fors F' }]);
  assert.deepEqual(ryhmanAmpujat([['NRO', 'X', 'NIMI'], ['4', '', 'Dahl D'], ['7', '', 'Gran G']], 2, 3), [{ nro: 4, nimi: 'Dahl D' }]);
  // Muotoiltu ("Ryhmä 2") ja muotoilematon (2) Ryhmä antavat saman ryhmän.
  const muotoiltu = [['NRO', 'Ryhmä', 'NIMI'], ['1', 'Ryhmä 2', 'Aalto A'], [2, 2, 'Berg B'], ['3', '2,00', 'Ek E']];
  assert.deepEqual(ryhmanAmpujat(muotoiltu, 2, 3).map((a) => a.nro), [1, 2, 3]);
  assert.equal(ryhmaKoko(SPEKSIT), 3);
  assert.equal(ryhmaKoko([]), 6);
});

test('ryhmän vuorot ryhmäaikataulusta: kierros, aika ja päivä', () => {
  const { layoutit } = lueLayoutit(SPEKSIT);
  const aikataulut = [
    { nimi: 'Aikataulu', rivit: [['Lauantai'], ['Start', 'Järvi', 'Metsä'], ['09:00', 'Ryhmä 1', 'Ryhmä 2'], ['09:30', 'Ryhmä 2', 'Ryhmä 1'], ['Tauko']] }
  ];
  assert.deepEqual(ryhmanVuorot(aikataulut, layoutit, 2), {
    2: { kierros: 1, aika: '09:30', paiva: 'Aikataulu' },
    1: { kierros: 0, aika: '09:00', paiva: 'Aikataulu' }
  });
  assert.deepEqual(ryhmanVuorot(aikataulut, layoutit, 9), {});
  // Asemalähtö: ryhmä on solun ensimmäinen luku, lähtöasema sanan "asema" jälkeen.
  const asemilta = [{ nimi: 'Aikataulu', rivit: [['Start', 'Metsä', 'Järvi'], ['8.30', 'Ryhmä 12 · asema 2', 'Ryhmä 2 · asema 4']] }];
  assert.deepEqual(ryhmanVuorot(asemilta, layoutit, 2), { 2: { kierros: 0, aika: '8.30', paiva: 'Aikataulu', alkuasema: '4' } });
  assert.deepEqual(ryhmanVuorot(asemilta, layoutit, 12)[1].alkuasema, '2');
  const valilla = [{ nimi: 'Aikataulu', rivit: [['Start', 'Metsä'], ['8.30', 'Ryhmä 1 · asema P 3 ']] }];
  assert.equal(ryhmanVuorot(valilla, layoutit, 1)[1].alkuasema, 'P 3', 'aseman tunnus sellaisenaan');
  assert.deepEqual(ryhmanVuorot([], layoutit, 1), {});
});

test('korttirivi: asemien tulokset, kiekot ja luku takaisin', () => {
  const layout = lueLayoutit(SPEKSIT).layoutit[0];
  const otsikko = ryhmaKorttiOtsikko(layout);
  assert.deepEqual(otsikko.slice(0, 11), ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', 'LAITE', 'VERSIO', 'RYHMÄ', 'HYVÄKSYTTY', 'ASEMA 1', 'ASEMA 2', '1/1']);
  assert.equal(otsikko.length, 8 + 2 + 25 + 1);
  assert.equal(otsikko[35], 'KUITATUT');
  assert.equal(otsikko[20], '2/1');
  const merkit = 'XXOXXXXXXO' + 'XO' + '-'.repeat(13);
  assert.deepEqual(asemienTulokset(layout, merkit), [8, 1]);
  const rivi = ryhmaKorttiRivi(layout, { nro: 4, nimi: 'Dahl D', merkit, versio: 5, laite: 'l', aika: 'nyt', ryhma: 2, hyvaksytty: '', kuitatut: ['1'] });
  assert.equal(rivi[35], '1');
  // Ennen KUITATUT-saraketta kirjoitettu rivi luetaan ilman asemahyväksyntöjä.
  assert.deepEqual(lueRyhmaKorttiRivi(rivi.slice(0, 35), layout).kuitatut, []);
  assert.deepEqual(rivi.slice(0, 11), [4, 'Dahl D', 9, 'nyt', 'l', 5, 2, '', 8, 1, 'X']);
  assert.deepEqual(lueRyhmaKorttiRivi(rivi, layout), { nro: 4, merkit, versio: 5, laite: 'l', aika: 'nyt', hyvaksytty: '', kuitatut: ['1'] });
  assert.equal(lueRyhmaKorttiRivi(['', 'x'], layout), null);
  assert.ok(onkoRyhmaMerkit(merkit, 25));
  assert.ok(!onkoRyhmaMerkit(merkit, 24));
});

test('tallennuksen tarkistus', () => {
  const laite = (l) => /^[a-z0-9-]{4,}$/.test(l);
  const kortti = { layout: 1, nro: 4, merkit: 'XO-', versio: 10 };
  assert.deepEqual(tarkistaRyhmaTallennus({ laite: 'laite-1', haltija: 'h', kortit: [kortti] }, laite),
    { laite: 'laite-1', haltija: 'h', kortit: [{ ...kortti, hyvaksytty: null, kuitatut: [] }] });
  assert.deepEqual(tarkistaRyhmaTallennus({ laite: 'laite-1', kortit: [{ ...kortti, kuitatut: ['1', 'P 3', '1'] }] }, laite).kortit[0].kuitatut, ['1', 'P 3']);
  for (const huono of ['1', [1], ['a,b'], ['']]) assert.ok(tarkistaRyhmaTallennus({ laite: 'laite-1', kortit: [{ ...kortti, kuitatut: huono }] }, laite).virhe);
  assert.ok(tarkistaRyhmaTallennus({ laite: 'x', kortit: [] }, laite).virhe);
  assert.ok(tarkistaRyhmaTallennus({ laite: 'laite-1', kortit: [kortti, kortti] }, laite).virhe);
  assert.ok(tarkistaRyhmaTallennus({ laite: 'laite-1', kortit: [{ ...kortti, layout: 0 }] }, laite).virhe);
  assert.ok(tarkistaRyhmaTallennus({ laite: 'laite-1', kortit: [{ ...kortti, merkit: 'XA' }] }, laite).virhe);
  assert.ok(tarkistaRyhmaTallennus({ laite: 'laite-1', kortit: [{ ...kortti, hyvaksytty: 5 }] }, laite).virhe);
  assert.equal(tarkistaRyhmaTallennus({ laite: 'laite-1', kortit: [{ ...kortti, hyvaksytty: 1800000000000 }] }, laite).kortit[0].hyvaksytty, 1800000000000);
});
