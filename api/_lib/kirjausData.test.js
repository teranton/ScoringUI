import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIIMEINEN_SARAKE, jasennaRataruudukko, korttiRivi, lueKorttiRivi, radanJono, sarakeKirjain, solu, speksiArvo, taydenna, tarkistaTallennus
} from './kirjausData.js';

const MERKIT = 'XXXXO' + 'XOXXX' + '-'.repeat(15);

// Kehitystaulukon lauantai: otsikko nimisarakkeen päällä.
const LAUANTAI = [
  [],
  ['', '', 'Rata 1', '', '', 'Rata 2'],
  [],
  ['9.00', '1', 'Saastamoinen Juho', '9.00', '36', 'Kuusisaari Robin'],
  ['9.04', '2', 'Luukkonen Juha', '9.04', '37', '37'],
  ['9.08', '3', 'Koivunen Raimo​', '9.08', '', 'TAUKO'],
  ['9.12', '4', 'Tölli Jukka', '9.12', '39', 'Landers Victor']
];
// Sunnuntai: otsikko aikasarakkeen päällä, RATA1 = tulossarake 3 (LAYOUT/PÄIVÄ 2).
const SUNNUNTAI = [
  ['AIKATAULU | 12.07.2026'],
  ['RATA1', '', '', 'RATA2'],
  [],
  ['09:00', '19', 'Kyntäjä Timo', '09:00', '55', 'Määttänen Ville'],
  ['09:02', '20', 'Kyntäjä Linda', '09:02', '56', 'Lindroos Elvin']
];
// Kaksi kierrosta samoissa sarakkeissa.
const KIERROKSET = [
  ['AIKATAULU | 1.8.2026'],
  ['RATA1 / RATA3', '', '', 'RATA2 / RATA4'],
  ['09:00', '1', 'A', '09:00', '3', 'C'],
  ['09:04', '2', 'B', '09:04', '4', 'D'],
  ['10:00', '', 'RATOJEN VAIHTO', '10:00', '', 'RATOJEN VAIHTO'],
  ['10:10', '5', 'E', '10:10', '7', 'G'],
  ['10:14', '6', 'F', '10:14', '8', 'H']
];

test('sarakekirjaimet', () => {
  assert.equal(sarakeKirjain(0), 'A');
  assert.equal(sarakeKirjain(25), 'Z');
  assert.equal(sarakeKirjain(26), 'AA');
  assert.equal(VIIMEINEN_SARAKE, 'AE');
});

test('rata-ruudukko: otsikko nimen yllä, tyhjät paikat ja tauot ohitetaan, tuomarimerkki pois', () => {
  const kaistat = jasennaRataruudukko(LAUANTAI);
  assert.deepEqual(kaistat.map((k) => k.radat), [[1], [2]]);
  assert.deepEqual(kaistat[0].kierrokset[0].map((a) => a.nimi), ['Saastamoinen Juho', 'Luukkonen Juha', 'Koivunen Raimo', 'Tölli Jukka']);
  assert.deepEqual(kaistat[1].kierrokset[0].map((a) => a.nro), [36, 39]);
  // TAUKO-rivi merkitään seuraavalle ampujalle (linja tyhjennetään ennen häntä).
  assert.deepEqual(kaistat[1].kierrokset[0].map((a) => Boolean(a.taukoEnnen)), [false, true]);
  assert.ok(kaistat[0].kierrokset[0].every((a) => !a.taukoEnnen));
  assert.equal(kaistat[0].kierrokset[0][0].aika, '9.00');
});

test('radan jono: omat aloittajat ensin, sitten edellisen radan', () => {
  const r = radanJono({ aikataulut: [{ nimi: 'Aikataulu La', rivit: LAUANTAI }], sarake: 2, ratojaPaivassa: 0 });
  assert.equal(r.aikataulu, 'Aikataulu La');
  assert.equal(r.kaista, 2);
  assert.deepEqual(r.jono.map((a) => a.nro), [36, 39, 1, 2, 3, 4]);
  assert.equal(r.jono[2].lahtoRata, 1);
  assert.equal(r.nimet[19], undefined);
});

test('radan jono: LAYOUT/PÄIVÄ vie sarakkeet seuraavalle päivälle', () => {
  const aikataulut = [{ nimi: 'Aikataulu La', rivit: LAUANTAI }, { nimi: 'Aikataulu Su', rivit: SUNNUNTAI }];
  const eka = radanJono({ aikataulut, sarake: 1, ratojaPaivassa: 2 });
  assert.equal(eka.aikataulu, 'Aikataulu La');
  const r = radanJono({ aikataulut, sarake: 3, ratojaPaivassa: 2 });
  assert.equal(r.aikataulu, 'Aikataulu Su');
  assert.deepEqual(r.jono.map((a) => a.nro), [19, 20, 55, 56]);
  assert.equal(r.nimet[1], 'Saastamoinen Juho');
  assert.equal(radanJono({ aikataulut, sarake: 9, ratojaPaivassa: 2 }).jono.length, 0);
  // Lauantain välilehti ilman ruudukkoa: sunnuntai pysyy toisena päivänä.
  const tyhjaLa = [{ nimi: 'Aikataulu La', rivit: [['AIKATAULU']] }, { nimi: 'Aikataulu Su', rivit: SUNNUNTAI }];
  assert.equal(radanJono({ aikataulut: tyhjaLa, sarake: 1, ratojaPaivassa: 2 }).jono.length, 0);
  assert.deepEqual(radanJono({ aikataulut: tyhjaLa, sarake: 3, ratojaPaivassa: 2 }).jono.map((a) => a.nro), [19, 20, 55, 56]);
  // Master-pohjan ohjeteksti-välilehti Aikataulu päivien välilehtien rinnalla ei ole päivä.
  const ohjeella = [{ nimi: 'Aikataulu', rivit: [['Aikataulu tehdään arvonnan jälkeen.']] }, ...aikataulut];
  assert.equal(radanJono({ aikataulut: ohjeella, sarake: 1, ratojaPaivassa: 2 }).aikataulu, 'Aikataulu La');
  assert.equal(radanJono({ aikataulut: ohjeella, sarake: 3, ratojaPaivassa: 2 }).aikataulu, 'Aikataulu Su');
  assert.equal(radanJono({ aikataulut: ohjeella, sarake: 3, ratojaPaivassa: 0 }).aikataulu, 'Aikataulu Su');
});

test('solu: luku, teksti ja tyhjä', () => {
  assert.deepEqual(solu(5), { userEnteredValue: { numberValue: 5 } });
  assert.deepEqual(solu('=A1'), { userEnteredValue: { stringValue: '=A1' } });
  assert.deepEqual(solu(''), {});
});

test('radan jono: toinen kierros otsikosta RATA1 / RATA3', () => {
  const r = radanJono({ aikataulut: [{ nimi: 'Aikataulu', rivit: KIERROKSET }], sarake: 3, ratojaPaivassa: 0 });
  assert.equal(r.kierros, 1);
  assert.deepEqual(r.jono.map((a) => a.nro), [5, 6, 7, 8]);
  const nelja = radanJono({ aikataulut: [{ nimi: 'Aikataulu', rivit: KIERROKSET }], sarake: 4, ratojaPaivassa: 0 });
  assert.deepEqual(nelja.jono.map((a) => a.nro), [7, 8, 5, 6]);
});

test('speksiArvo lukee vain avaimen oikean naapurin (kuten ScoringLibin Speksit)', () => {
  const rivit = [['Selite', 'LAYOUT/PÄIVÄ', '4', 'Ohje'], ['RATA3_NIMI', 'Kolmonen'], ['', 'RATA2_NIMI', '', '2. radan nimi']];
  assert.equal(speksiArvo(rivit, 'LAYOUT/PÄIVÄ'), '4');
  assert.equal(speksiArvo(rivit, 'RATA3_NIMI'), 'Kolmonen');
  assert.equal(speksiArvo(rivit, 'RATA2_NIMI'), '', 'tyhjän arvon viereinen ohje ei ole arvo');
  assert.equal(speksiArvo(rivit, 'RATA4_NIMI'), '');
});

test('korttirivi menee ja tulee samana', () => {
  const rivi = korttiRivi({ nro: 12, nimi: 'A', merkit: MERKIT, versio: 5, laite: 'abcd', aika: 'nyt' });
  assert.equal(rivi.length, 31);
  assert.equal(rivi[2], 8);
  assert.equal(rivi[6 + 24], '');
  assert.deepEqual(lueKorttiRivi(rivi.map(String)), { nro: 12, merkit: MERKIT, versio: 5, laite: 'abcd', aika: String(rivi[3]) });
  // Muotoilemattomat arvot (UNFORMATTED_VALUE): numerot lukuina.
  assert.equal(lueKorttiRivi([12, 'A', 8, 'nyt', 'abcd', 1760012345678, 'X']).versio, 1760012345678);
  assert.equal(lueKorttiRivi(['NRO', 'NIMI']), null);
  assert.equal(lueKorttiRivi([]), null);
});

test('tallennuksen tarkistus', () => {
  const ok = { laite: 'laite-1234', kortit: [{ nro: 1, merkit: MERKIT, versio: 1, ylim: 1 }] };
  assert.deepEqual(tarkistaTallennus(ok), { laite: 'laite-1234', haltija: '', kortit: [{ nro: 1, nimi: '', merkit: MERKIT, versio: 1 }], linja: undefined });
  // Pelkkä linjan tila käy ilman kortteja.
  assert.deepEqual(tarkistaTallennus({ laite: 'laite-1234', haltija: 'h1.1.x', linja: {} }).kortit, []);
  const nimella = tarkistaTallennus({ ...ok, kortit: [{ ...ok.kortit[0], nimi: ' Aho\u0007 Antti ' }] });
  assert.equal(nimella.kortit[0].nimi, 'Aho Antti');
  assert.ok(tarkistaTallennus({ ...ok, kortit: [{ ...ok.kortit[0], nimi: 5 }] }).virhe);
  assert.ok(tarkistaTallennus({ ...ok, laite: 'x' }).virhe);
  assert.deepEqual(tarkistaTallennus({ ...ok, kortit: [] }).kortit, [], 'tyhjä lista on haltijan tarkistus');
  assert.ok(tarkistaTallennus({ ...ok, kortit: {} }).virhe);
  assert.ok(tarkistaTallennus({ ...ok, kortit: [{ nro: 0, merkit: MERKIT, versio: 1 }] }).virhe);
  assert.ok(tarkistaTallennus({ ...ok, kortit: [{ nro: 1, merkit: 'XX', versio: 1 }] }).virhe);
  assert.ok(tarkistaTallennus({ ...ok, kortit: [{ nro: 1, merkit: MERKIT, versio: 0 }] }).virhe);
  assert.ok(tarkistaTallennus({ ...ok, kortit: [ok.kortit[0], ok.kortit[0]] }).virhe);
  assert.ok(tarkistaTallennus(null).virhe);
});

test('täydennys: vain ampumattomat kohteet, eri merkinnät lasketaan', () => {
  assert.deepEqual(taydenna('XO---', 'XXOO-'), { merkit: 'XOOO-', taytetty: 2, eri: 1 });
  assert.deepEqual(taydenna('XO', 'XO'), { merkit: 'XO', taytetty: 0, eri: 0 });
});
