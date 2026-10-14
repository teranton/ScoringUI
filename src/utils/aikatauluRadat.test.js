import test from 'node:test';
import assert from 'node:assert/strict';

import { muodostaTulosteAikataulu, tunnistaRataSarakkeet } from './aikatauluRadat.js';

const ZWSP = '​';

// ScoringLibin Compak-aikataulun muoto (Compak SM 2026, Aikataulu Su, lyhennetty).
const RIVIT = [
  ['AIKATAULU | 12.07.2026'],
  ['', 'RATA 5 TRIABYGG', '', '', 'RATA 6 NCE', '', '', 'RATA 7 JNT', '', '', 'RATA 8 SEAMFIX'],
  [],
  ['09:00', '98', 'Lindh Oliver', '09:00', '136', '136', '09:00', '21', 'Mattsson Matti', '09:00', '60', 'Sivonen Marko'],
  ['09:02', '99', 'Sundström Hans', '09:02', '137', 'Mäki-Hokkonen Jussi', '09:02', '22', `Kuuminainen Juho${ZWSP}`, '09:02', '61', '61'],
  ['09:05', '', 'TAUKO', '09:05', '', 'TAUKO', '09:05', '', 'TAUKO', '09:05', '', 'TAUKO'],
  ['', '', '', '', '', '', '', '', '', '', '', '']
];

test('radat tunnistetaan otsikkoriviltä, aika on nimen vasemmalla puolella', () => {
  assert.deepEqual(tunnistaRataSarakkeet(RIVIT), [
    { label: '5 TRIABYGG', startIndex: 0 },
    { label: '6 NCE', startIndex: 3 },
    { label: '7 JNT', startIndex: 6 },
    { label: '8 SEAMFIX', startIndex: 9 }
  ]);
});

test('neljä rataa yhdellä sivulla, yhteinen aika, tyhjä paikka, tuomari ja tauko', () => {
  const { otsikko, osat } = muodostaTulosteAikataulu(RIVIT);
  assert.equal(otsikko, '12.07.2026');
  assert.equal(osat.length, 1);
  const [osa] = osat;
  assert.deepEqual(osa.radat, ['5 TRIABYGG', '6 NCE', '7 JNT', '8 SEAMFIX']);
  assert.equal(osa.yhteinenAika, true);
  assert.deepEqual(osa.rivit.map((r) => r.aika), ['09:00', '09:02', '09:05']);

  const [eka, toka, tauko] = osa.rivit;
  assert.deepEqual(eka.ruudut[1], { aika: '09:00', nro: '136', nimi: '', tuomari: false, tauko: false });
  assert.deepEqual(toka.ruudut[2], { aika: '09:02', nro: '22', nimi: 'Kuuminainen Juho', tuomari: true, tauko: false });
  assert.deepEqual(toka.ruudut[3].nimi, '');
  assert.ok(tauko.ruudut.every((r) => r.tauko));
});

test('radoilla eri ajat: aika tulostetaan jokaiselle radalle', () => {
  const rivit = [
    ['AIKATAULU | 1.8.2026'],
    ['', 'RATA 1', '', '', 'RATA 2'],
    ['10:00', '1', 'A', '14:30', '5', 'E'],
    ['10:04', '2', 'B', '', '', '']
  ];
  const [osa] = muodostaTulosteAikataulu(rivit).osat;
  assert.equal(osa.yhteinenAika, false);
  assert.deepEqual(osa.rivit[0].ruudut.map((r) => r.aika), ['10:00', '14:30']);
  assert.deepEqual(osa.rivit[1].ruudut[1], { aika: '', nro: '', nimi: '', tuomari: false, tauko: false });
});

test('yli neljä rataa jaetaan sivuille tasan', () => {
  const otsikkorivi = [];
  const rivi = [];
  for (let i = 1; i <= 6; i++) {
    otsikkorivi.push('', `RATA ${i}`, '');
    rivi.push('09:00', String(i), `Ampuja ${i}`);
  }
  const { osat } = muodostaTulosteAikataulu([['AIKATAULU'], otsikkorivi, rivi]);
  assert.deepEqual(osat.map((o) => o.radat), [['1', '2', '3'], ['4', '5', '6']]);
  assert.deepEqual(osat[1].rivit[0].ruudut.map((r) => r.nimi), ['Ampuja 4', 'Ampuja 5', 'Ampuja 6']);
});

test('ei rata-ruudukkoa: null', () => {
  assert.equal(muodostaTulosteAikataulu([['Aika', 'Tapahtuma'], ['9:00', 'Avajaiset']]), null);
  assert.equal(muodostaTulosteAikataulu([]), null);
});
