import test from 'node:test';
import assert from 'node:assert/strict';

import { ennustePaivat, naytetaankoSaa, parsiKoordinaatit, poimiPaivat, saaTyyppi, tamaPaivaSuomessa } from './saaEnnuste.js';

const NYT = new Date(2026, 9, 14, 12, 0);

test('koordinaatit desimaalipisteellä, muu teksti on paikan nimi', () => {
  assert.deepEqual(parsiKoordinaatit('63.67, 22.70'), { lat: 63.67, lon: 22.7 });
  assert.deepEqual(parsiKoordinaatit(' 61.48 21.79 '), { lat: 61.48, lon: 21.79 });
  assert.deepEqual(parsiKoordinaatit('-33.9;18.4'), { lat: -33.9, lon: 18.4 });
  assert.equal(parsiKoordinaatit('Pietarsaari'), null);
  assert.equal(parsiKoordinaatit('95.0, 20.0'), null);
  assert.equal(parsiKoordinaatit(''), null);
});

test('ennustepäivät: kisan päivät tästä päivästä 16 päivän päähän, enintään 4', () => {
  assert.deepEqual(ennustePaivat('2026-10-17', '2026-10-18', NYT), ['2026-10-17', '2026-10-18']);
  assert.deepEqual(ennustePaivat('17.10.2026', '', NYT), ['2026-10-17']);
  // Käynnissä oleva kisa: menneitä päiviä ei näytetä.
  assert.deepEqual(ennustePaivat('2026-10-13', '2026-10-15', NYT), ['2026-10-14', '2026-10-15']);
  // Viimeinen ennustepäivä on 29.10.
  assert.deepEqual(ennustePaivat('2026-10-29', '2026-10-30', NYT), ['2026-10-29']);
  assert.deepEqual(ennustePaivat('2026-10-30', '2026-10-31', NYT), []);
  assert.deepEqual(ennustePaivat('2026-10-12', '2026-10-13', NYT), []);
  assert.equal(ennustePaivat('2026-10-14', '2026-10-24', NYT).length, 4);
  assert.deepEqual(ennustePaivat('', '', NYT), []);
  assert.deepEqual(ennustePaivat('2026-10-18', '2026-10-16', NYT), []);
});

test('sää näytetään vain, kun paikka on annettu eikä kisa ole päättynyt', () => {
  const kisa = { paikka: 'Oulainen', alkuPvm: '17.10.2026', loppuPvm: '18.10.2026' };
  assert.equal(naytetaankoSaa(kisa, 'tulossa', NYT), true);
  assert.equal(naytetaankoSaa(kisa, 'paattynyt', NYT), false);
  assert.equal(naytetaankoSaa({ ...kisa, paikka: ' ' }, 'tulossa', NYT), false);
  assert.equal(naytetaankoSaa({ ...kisa, alkuPvm: '1.12.2026', loppuPvm: '' }, 'tulossa', NYT), false);
});

test('WMO-koodit tyypeiksi', () => {
  assert.equal(saaTyyppi(0), 'selkea');
  assert.equal(saaTyyppi(2), 'puolipilvinen');
  assert.equal(saaTyyppi(45), 'sumu');
  assert.equal(saaTyyppi(53), 'tihku');
  assert.equal(saaTyyppi(81), 'sade');
  assert.equal(saaTyyppi(73), 'lumi');
  assert.equal(saaTyyppi(95), 'ukkonen');
  assert.equal(saaTyyppi(null), 'pilvinen');
});

test('päiväennusteesta poimitaan pyydetyt päivät', () => {
  const daily = {
    time: ['2026-10-14', '2026-10-15'],
    weather_code: [3, 61],
    temperature_2m_max: [9.4, 7.1],
    temperature_2m_min: [2.2, null],
    precipitation_probability_max: [10, 80],
    wind_speed_10m_max: [4.2, 6.8]
  };
  assert.deepEqual(poimiPaivat(daily, ['2026-10-15', '2026-10-16']), [
    { pvm: '2026-10-15', koodi: 61, maks: 7.1, min: null, sade: 80, tuuli: 6.8 }
  ]);
  assert.deepEqual(poimiPaivat(null, ['2026-10-15']), []);
});

test('tämä päivä lasketaan Suomen aikaa', () => {
  assert.equal(tamaPaivaSuomessa(new Date('2026-10-14T22:30:00Z')), '2026-10-15');
  assert.equal(tamaPaivaSuomessa(new Date('2026-10-14T20:30:00Z')), '2026-10-14');
  // Klo 01.30 Suomessa (22.30 UTC) ennusteikkuna alkaa jo seuraavasta päivästä.
  assert.deepEqual(ennustePaivat('2026-10-14', '2026-10-15', new Date('2026-10-14T22:30:00Z')), ['2026-10-15']);
});
