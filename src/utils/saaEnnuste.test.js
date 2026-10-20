import test from 'node:test';
import assert from 'node:assert/strict';

import { ennustePaiva, naytetaankoSaa, paivaYhteenvedot, parsiFmiVastaus, parsiKoordinaatit, saaTyyppi, suomenAika, tamaPaivaSuomessa } from './saaEnnuste.js';

// Ke 14.10.2026 klo 12 Suomen aikaa.
const NYT = new Date('2026-10-14T09:00:00Z');

test('koordinaatit desimaalipisteellä, muu teksti on paikan nimi', () => {
  assert.deepEqual(parsiKoordinaatit('63.67, 22.70'), { lat: 63.67, lon: 22.7 });
  assert.deepEqual(parsiKoordinaatit(' 61.48 21.79 '), { lat: 61.48, lon: 21.79 });
  assert.deepEqual(parsiKoordinaatit('-33.9;18.4'), { lat: -33.9, lon: 18.4 });
  assert.deepEqual(parsiKoordinaatit('64,27 24,81'), { lat: 64.27, lon: 24.81 });
  assert.deepEqual(parsiKoordinaatit('64,27; 24,81'), { lat: 64.27, lon: 24.81 });
  assert.equal(parsiKoordinaatit('64,27'), null);
  assert.equal(parsiKoordinaatit('64, 27'), null);
  assert.equal(parsiKoordinaatit('Pietarsaari'), null);
  assert.equal(parsiKoordinaatit('95.0, 20.0'), null);
  assert.equal(parsiKoordinaatit(''), null);
});

test('tuleva kisa: aloituspäivä, jos se on ennusteen sisällä (10 päivää)', () => {
  assert.equal(ennustePaiva('2026-10-17', '2026-10-18', NYT), '2026-10-17');
  assert.equal(ennustePaiva('17.10.2026', '', NYT), '2026-10-17');
  assert.equal(ennustePaiva('2026-10-22', '2026-10-23', NYT), '2026-10-22');
  assert.equal(ennustePaiva('2026-10-23', '', NYT), '2026-10-23');
  assert.equal(ennustePaiva('2026-10-24', '', NYT), '');
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

test('WeatherSymbol3-koodit tyypeiksi', () => {
  assert.equal(saaTyyppi(1), 'selkea');
  assert.equal(saaTyyppi(2), 'puolipilvinen');
  assert.equal(saaTyyppi(3), 'pilvinen');
  assert.equal(saaTyyppi(21), 'tihku');
  assert.equal(saaTyyppi(31), 'tihku');
  assert.equal(saaTyyppi(22), 'sade');
  assert.equal(saaTyyppi(33), 'sade');
  assert.equal(saaTyyppi(42), 'lumi');
  assert.equal(saaTyyppi(53), 'lumi');
  assert.equal(saaTyyppi(63), 'ukkonen');
  assert.equal(saaTyyppi(72), 'ranta');
  assert.equal(saaTyyppi(83), 'ranta');
  assert.equal(saaTyyppi(92), 'sumu');
  assert.equal(saaTyyppi(null), 'pilvinen');
});

const elementti = (aika, nimi, arvo) => `<wfs:member><BsWfs:BsWfsElement gml:id="BsWfsElement.1.1.1">
  <BsWfs:Location><gml:Point gml:id="BsWfsElementP.1.1.1" srsDimension="2" srsName="http://www.opengis.net/def/crs/EPSG/0/4258"><gml:pos>64.26 24.81 </gml:pos></gml:Point></BsWfs:Location>
  <BsWfs:Time>${aika}</BsWfs:Time>
  <BsWfs:ParameterName>${nimi}</BsWfs:ParameterName>
  <BsWfs:ParameterValue>${arvo}</BsWfs:ParameterValue>
</BsWfs:BsWfsElement></wfs:member>`;
const fmiXml = (rivit) => `<?xml version="1.0" encoding="UTF-8"?><wfs:FeatureCollection>${rivit.flatMap(([aika, lampo, tuuli, sade, symboli]) => [
  elementti(aika, 'Temperature', lampo), elementti(aika, 'WindSpeedMS', tuuli),
  elementti(aika, 'Precipitation1h', sade), elementti(aika, 'WeatherSymbol3', symboli)
]).join('')}</wfs:FeatureCollection>`;

test('WFS-vastaus tuntiriveiksi, NaN on null', () => {
  const rivit = parsiFmiVastaus(fmiXml([['2026-10-15T06:00:00Z', 4.2, 3.1, 0.2, 31], ['2026-10-15T05:00:00Z', 'NaN', 2, 0, 3]]));
  assert.deepEqual(rivit, [
    { aika: '2026-10-15T05:00:00Z', lampo: null, tuuli: 2, sade: 0, symboli: 3 },
    { aika: '2026-10-15T06:00:00Z', lampo: 4.2, tuuli: 3.1, sade: 0.2, symboli: 31 }
  ]);
  assert.deepEqual(parsiFmiVastaus(''), []);
});

const tunti = (aika, lampo, { tuuli = 3, sade = 0, symboli = 3 } = {}) => ({ aika, lampo, tuuli, sade, symboli });

test('päivän yhteenveto kisa-ajalta (klo 8–20 Suomen aikaa)', () => {
  // Lokakuussa UTC+3: 05Z = klo 8, 17Z = klo 20.
  const rivit = [
    tunti('2026-10-15T04:00:00Z', -2, { sade: 5, symboli: 32, tuuli: 9 }), // klo 7: ei mukana
    tunti('2026-10-15T05:00:00Z', 4, { sade: 3, symboli: 2, tuuli: 2 }), // klo 8: sade on klo 7–8, ei mukana
    tunti('2026-10-15T06:00:00Z', 6, { sade: 0.2 }),
    tunti('2026-10-15T09:00:00Z', 9, { sade: 0.3, symboli: 31, tuuli: 6.5 }), // klo 12
    tunti('2026-10-15T17:00:00Z', 5, { sade: 1 }), // klo 20: sade klo 19–20 mukana
    tunti('2026-10-15T18:00:00Z', 1, { sade: 4 }), // klo 21: ei mukana
    // Ennusteen viimeinen, vajaa päivä jätetään pois.
    tunti('2026-10-24T05:00:00Z', 3)
  ];
  assert.deepEqual(paivaYhteenvedot(rivit), [
    { pvm: '2026-10-15', symboli: 31, maks: 9, min: 4, sade: 1.5, tuuli: 6.5 }
  ]);
  assert.deepEqual(paivaYhteenvedot(null), []);
});
