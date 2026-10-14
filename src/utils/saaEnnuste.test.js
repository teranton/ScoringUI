import test from 'node:test';
import assert from 'node:assert/strict';

import { ennustePaiva, naytetaankoSaa, paivaYhteenvedot, parsiKoordinaatit, saaTyyppi, suomenAika, tamaPaivaSuomessa } from './saaEnnuste.js';

// Ke 14.10.2026 klo 12 Suomen aikaa.
const NYT = new Date('2026-10-14T09:00:00Z');

test('koordinaatit desimaalipisteellä, muu teksti on paikan nimi', () => {
  assert.deepEqual(parsiKoordinaatit('63.67, 22.70'), { lat: 63.67, lon: 22.7 });
  assert.deepEqual(parsiKoordinaatit(' 61.48 21.79 '), { lat: 61.48, lon: 21.79 });
  assert.deepEqual(parsiKoordinaatit('-33.9;18.4'), { lat: -33.9, lon: 18.4 });
  assert.equal(parsiKoordinaatit('Pietarsaari'), null);
  assert.equal(parsiKoordinaatit('95.0, 20.0'), null);
  assert.equal(parsiKoordinaatit(''), null);
});

test('tuleva kisa: aloituspäivä, jos se on ennusteen sisällä (9 päivää)', () => {
  assert.equal(ennustePaiva('2026-10-17', '2026-10-18', NYT), '2026-10-17');
  assert.equal(ennustePaiva('17.10.2026', '', NYT), '2026-10-17');
  assert.equal(ennustePaiva('2026-10-22', '2026-10-23', NYT), '2026-10-22');
  assert.equal(ennustePaiva('2026-10-23', '', NYT), '');
  assert.equal(ennustePaiva('', '', NYT), '');
  assert.equal(ennustePaiva('2026-10-18', '2026-10-16', NYT), '');
});

test('käynnissä oleva kisa: seuraava kisapäivä, viimeisenä päivänä tämä päivä', () => {
  assert.equal(ennustePaiva('2026-10-13', '2026-10-15', NYT), '2026-10-15');
  assert.equal(ennustePaiva('2026-10-14', '2026-10-15', NYT), '2026-10-15');
  assert.equal(ennustePaiva('2026-10-13', '2026-10-14', NYT), '2026-10-14');
  assert.equal(ennustePaiva('2026-10-14', '', NYT), '2026-10-14');
  assert.equal(ennustePaiva('2026-10-12', '2026-10-13', NYT), '');
});

test('tämä päivä ja tunti lasketaan Suomen aikaa', () => {
  assert.equal(tamaPaivaSuomessa(new Date('2026-10-14T22:30:00Z')), '2026-10-15');
  assert.equal(tamaPaivaSuomessa(new Date('2026-10-14T20:30:00Z')), '2026-10-14');
  assert.deepEqual(suomenAika(new Date('2026-07-11T09:00:00Z')), { pvm: '2026-07-11', tunti: 12 });
  // Klo 01.30 Suomessa (22.30 UTC) kisan ensimmäinen päivä on jo alkanut.
  assert.equal(ennustePaiva('2026-10-15', '2026-10-16', new Date('2026-10-14T22:30:00Z')), '2026-10-16');
});

test('sää näytetään vain, kun paikka on annettu eikä kisa ole päättynyt', () => {
  const kisa = { paikka: 'Oulainen', alkuPvm: '17.10.2026', loppuPvm: '18.10.2026' };
  assert.equal(naytetaankoSaa(kisa, 'tulossa', NYT), true);
  assert.equal(naytetaankoSaa(kisa, 'paattynyt', NYT), false);
  assert.equal(naytetaankoSaa({ ...kisa, paikka: ' ' }, 'tulossa', NYT), false);
  assert.equal(naytetaankoSaa({ ...kisa, alkuPvm: '1.12.2026', loppuPvm: '' }, 'tulossa', NYT), false);
});

test('yr.no-symbolit tyypeiksi', () => {
  assert.equal(saaTyyppi('clearsky_day'), 'selkea');
  assert.equal(saaTyyppi('fair_night'), 'puolipilvinen');
  assert.equal(saaTyyppi('partlycloudy_polartwilight'), 'puolipilvinen');
  assert.equal(saaTyyppi('cloudy'), 'pilvinen');
  assert.equal(saaTyyppi('fog'), 'sumu');
  assert.equal(saaTyyppi('lightrainshowers_day'), 'tihku');
  assert.equal(saaTyyppi('heavyrain'), 'sade');
  assert.equal(saaTyyppi('sleetshowers_day'), 'ranta');
  assert.equal(saaTyyppi('lightsnow'), 'lumi');
  assert.equal(saaTyyppi('rainandthunder'), 'ukkonen');
  assert.equal(saaTyyppi(''), 'pilvinen');
});

const rivi = (time, lampo, { tuuli = 3, sade1, sade6, symboli1, symboli6, maks6, min6 } = {}) => ({
  time,
  data: {
    instant: { details: { air_temperature: lampo, wind_speed: tuuli } },
    ...(sade1 !== undefined || symboli1 ? { next_1_hours: { summary: { symbol_code: symboli1 }, details: { precipitation_amount: sade1 } } } : {}),
    ...(sade6 !== undefined || symboli6 ? { next_6_hours: { summary: { symbol_code: symboli6 }, details: { precipitation_amount: sade6, air_temperature_max: maks6, air_temperature_min: min6 } } } : {})
  }
});

test('päivän yhteenveto kisa-ajalta (klo 8–20 Suomen aikaa)', () => {
  const sarja = [
    rivi('2026-10-15T03:00:00Z', 1, { sade1: 5, symboli1: 'rain' }), // klo 6: ei mukana
    rivi('2026-10-15T06:00:00Z', 4, { sade1: 0.2, symboli1: 'cloudy', sade6: 1, symboli6: 'partlycloudy_day', tuuli: 2 }),
    rivi('2026-10-15T09:00:00Z', 9, { sade1: 0.3, symboli1: 'lightrain', sade6: 2, symboli6: 'rain', tuuli: 6.5 }),
    rivi('2026-10-15T17:00:00Z', 6, { sade1: 0, symboli1: 'cloudy' }),
    rivi('2026-10-15T18:00:00Z', 5, { sade1: 4, symboli1: 'rain' }), // klo 21: ei mukana
    // Kauempana 6 tunnin rivit.
    rivi('2026-10-20T06:00:00Z', 3, { sade6: 1.25, symboli6: 'cloudy', maks6: 7, min6: 2 }),
    rivi('2026-10-20T12:00:00Z', 6, { sade6: 0.5, symboli6: 'fair_day', maks6: 8, min6: 4 })
  ];
  assert.deepEqual(paivaYhteenvedot(sarja), [
    { pvm: '2026-10-15', symboli: 'partlycloudy_day', maks: 9, min: 4, sade: 0.5, tuuli: 6.5 },
    { pvm: '2026-10-20', symboli: 'cloudy', maks: 8, min: 2, sade: 1.8, tuuli: 3 }
  ]);
  assert.deepEqual(paivaYhteenvedot(null), []);
});
