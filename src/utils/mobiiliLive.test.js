import test from 'node:test';
import assert from 'node:assert/strict';
import { lueAika, lueRadanKortit, lueRadanLaitteet, radanLiveTila } from './mobiiliLive.js';

// Lane grid as on the dev sheet: two lanes, layout 2's queue is its own starters, then lane 1's.
const AIKATAULU = [
  ['AIKATAULU | 1.11.2026'],
  ['RATA1', '', '', 'RATA2'],
  [],
  ['09:00', '1', 'Aalto Antti', '09:00', '11', 'Kivi Kalle'],
  ['09:02', '2', 'Berg Bertta', '09:02', '12', 'Lahti Leena'],
  ['09:04', '3', 'Carlsson Cecilia', '09:04', '13', 'Mäki Matti']
];
const SPEKSIT = [['Radan nimi', 'RATA1_NIMI', 'Metsärata'], ['', 'RATA1_OHJELMA', 'SDD']];
const merkit = (n) => 'X'.repeat(n) + '-'.repeat(25 - n);

test('lueRadanKortit: merkit otsikon mukaan, nimet ja viimeisin aika', () => {
  const csv = [
    'NRO,NIMI,TULOS,PÄIVITETTY,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    '2,Berg Bertta,3,28.10.2026 klo 9.05.10,X,O,X,x,,,,,,,,,,,,,,,,,,,,,',
    '1,Aalto Antti,1,28.10.2026 klo 10.01.00,X,,,,,,,,,,,,,,,,,,,,,,,,'
  ].join('\n');
  const { kortit, nimet, viimeisin } = lueRadanKortit(csv);
  assert.equal(kortit[2].merkit, 'XOXX' + '-'.repeat(21));
  assert.equal(kortit[1].merkit, 'X' + '-'.repeat(24));
  assert.equal(nimet[2], 'Berg Bertta');
  assert.equal(viimeisin.kello, '10.01');
  assert.deepEqual(lueRadanKortit(''), { kortit: {}, nimet: {}, viimeisin: null });
});

test('lueAika: suomalainen aikaleima vertailtavaksi', () => {
  assert.ok(lueAika('29.10.2026 8.00') .arvo > lueAika('28.10.2026 klo 23.59.59').arvo);
  assert.equal(lueAika('ei aikaa'), null);
});

test('lueRadanLaitteet: linjan tila radoittain, virheellinen JSON ohitetaan', () => {
  const csv = [
    'RATA,LINJA,LINJA PÄIVITETTY',
    '1,"{""ohitetut"":[2,""x""],""keskeyttaneet"":[3],""ohjelma"":""SSSD""}",28.10.2026 klo 9.00.00',
    '',
    '3,{rikki,',
    '2,,'
  ].join('\n');
  const radat = lueRadanLaitteet(csv);
  assert.deepEqual(radat.map((r) => r.sarake), [1, 2, 3]);
  assert.deepEqual(radat[0].linja.ohitetut, [2]);
  assert.deepEqual(radat[0].linja.keskeyttaneet, [3]);
  assert.equal(radat[0].linja.ohjelma, 'SSSD');
  assert.equal(radat[1].linja, null);
  assert.equal(radat[2].linja, null);
  assert.deepEqual(lueRadanLaitteet('A,B\n1,2'), []);
});

test('radanLiveTila: linja, vuorossa oleva, seuraavat ja ampuneet korteista', () => {
  const aikataulut = [{ nimi: 'Aikataulu', rivit: AIKATAULU }];
  // Ohjelma SDD: 1 + 2 + 2. Ampuja 1 on ampunut asemansa 1 (5 kiekkoa), ampuja 2 ei vielä mitään.
  const alku = radanLiveTila({ speksitRivit: SPEKSIT, aikataulut, sarake: 1, kortit: { 1: { merkit: merkit(5) } } });
  assert.equal(alku.rataNimi, 'Metsärata');
  assert.equal(alku.ohjelma, 'SDD');
  assert.equal(alku.loytyi, true);
  assert.deepEqual(alku.linja, [{ nro: 2, asema: 0 }, { nro: 1, asema: 1 }]);
  // Kierroksella ammutaan asemajärjestyksessä: asemalla 1 oleva 2 aloittaa.
  assert.deepEqual(alku.tilanne.kohta, { nro: 2, i: 0 });
  assert.deepEqual(alku.tulevat.map((a) => a.nro), [2, 3, 11, 12, 13]);
  assert.equal(alku.nimet[2], 'Berg Bertta');
  assert.deepEqual(alku.valmiit, []);

  // Laitteen linja: 2 ohitettu, 1 valmis ja poistunut linjalta → 1 on ampuneissa, 3 asemalla 5.
  const linja = { ohitetut: [2], lisatyt: [], tauot: [], tauotPois: [], keskeyttaneet: [], ohjelma: 'SSSSS' };
  const kortit = { 1: { merkit: merkit(25) }, 3: { merkit: merkit(20) }, 11: { merkit: merkit(15) }, 12: { merkit: merkit(10) }, 13: { merkit: merkit(5) } };
  const myohemmin = radanLiveTila({ speksitRivit: SPEKSIT, aikataulut, sarake: 1, kortit, linja });
  assert.equal(myohemmin.ohjelma, 'SSSSS');
  assert.deepEqual(myohemmin.valmiit, [1]);
  assert.ok(!myohemmin.jono.some((a) => a.nro === 2));
  assert.deepEqual(myohemmin.linja.find((l) => l.nro === 3), { nro: 3, asema: 4 });
});

test('radanLiveTila: radalla ei aikataulua, ohjelma puuttuu', () => {
  const tila = radanLiveTila({ sarake: 4, kortit: { 7: { merkit: merkit(3) } }, korttiNimet: { 7: 'Laitteella lisätty' } });
  assert.equal(tila.loytyi, false);
  assert.equal(tila.ohjelma, '');
  assert.equal(tila.tilanne, null);
  assert.equal(tila.nimet[7], 'Laitteella lisätty');
});
