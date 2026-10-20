import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { luoSaaHaku, ENNUSTE_TUORE_MS } from './saaHaku.js';
import { luoValimuisti } from './valimuisti.js';

// Ke 14.10.2026 klo 12 Suomen aikaa.
const NYT = new Date('2026-10-14T09:00:00Z').getTime();

const elementti = (aika, nimi, arvo) => `<wfs:member><BsWfs:BsWfsElement gml:id="x"><BsWfs:Time>${aika}</BsWfs:Time>`
  + `<BsWfs:ParameterName>${nimi}</BsWfs:ParameterName><BsWfs:ParameterValue>${arvo}</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>`;
// Päivän tunnit klo 8–20 Suomen aikaa (UTC+3) samalla säällä.
function paivaXml(pvm, lampo, symboli) {
  const osat = [];
  for (let h = 5; h <= 17; h++) {
    const aika = `${pvm}T${String(h).padStart(2, '0')}:00:00Z`;
    osat.push(elementti(aika, 'Temperature', lampo + (h === 11 ? 2 : 0)), elementti(aika, 'WindSpeedMS', 4),
      elementti(aika, 'Precipitation1h', 0.1), elementti(aika, 'WeatherSymbol3', symboli));
  }
  return `<wfs:FeatureCollection>${osat.join('')}</wfs:FeatureCollection>`;
}
const EI_PAIKKAA = '<ExceptionReport><Exception><ExceptionText>No locations found for the place with the requested language!</ExceptionText></Exception></ExceptionReport>';

function luo({ vastaa, nyt = () => NYT } = {}) {
  const haut = [];
  const hae = async (url) => {
    haut.push(new URL(url));
    const tulos = await vastaa(new URL(url));
    if (tulos instanceof Error) throw tulos;
    const [status, body] = typeof tulos === 'string' ? [200, tulos] : tulos;
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  const valimuisti = luoValimuisti('saa', { hakemisto: mkdtempSync(path.join(tmpdir(), 'saa-test-')) });
  return { kisanSaa: luoSaaHaku({ hae, nyt, valimuisti }), haut };
}

test('paikan nimellä haetaan näytettävän päivän ennuste, toinen haku välimuistista', async () => {
  const { kisanSaa, haut } = luo({ vastaa: (url) => paivaXml(url.searchParams.get('starttime').slice(0, 10), 8, 31) });
  const tulos = await kisanSaa({ paikka: 'Pietarsaari', alkuPvm: '2026-10-15', loppuPvm: '2026-10-16' });
  assert.deepEqual(tulos, { paikka: 'Pietarsaari', paivat: [{ pvm: '2026-10-15', symboli: 31, maks: 10, min: 8, sade: 1.2, tuuli: 4 }] });

  const url = haut[0];
  assert.equal(url.origin + url.pathname, 'https://opendata.fmi.fi/wfs');
  assert.equal(url.searchParams.get('storedquery_id'), 'fmi::forecast::edited::weather::scandinavia::point::simple');
  assert.equal(url.searchParams.get('place'), 'Pietarsaari');
  assert.equal(url.searchParams.get('starttime'), '2026-10-15T00:00:00Z');
  assert.equal(url.searchParams.get('endtime'), '2026-10-15T23:00:00Z');

  await kisanSaa({ paikka: 'pietarsaari', alkuPvm: '2026-10-15', loppuPvm: '' });
  assert.equal(haut.length, 1);
});

test('koordinaatit latlon-parametrina; käynnissä olevasta kisasta seuraava päivä; kaukainen kisa ei hae', async () => {
  const { kisanSaa, haut } = luo({ vastaa: (url) => paivaXml(url.searchParams.get('starttime').slice(0, 10), 5, 1) });
  const tulos = await kisanSaa({ paikka: '64,1 24,5', alkuPvm: '13.10.2026', loppuPvm: '16.10.2026' });
  assert.deepEqual(tulos.paivat.map((p) => p.pvm), ['2026-10-15']);
  assert.equal(haut[0].searchParams.get('latlon'), '64.1,24.5');
  assert.equal(haut[0].searchParams.has('place'), false);

  assert.deepEqual(await kisanSaa({ paikka: 'Oulainen', alkuPvm: '2026-12-01', loppuPvm: '' }), { paikka: '', paivat: [] });
  assert.deepEqual(await kisanSaa({ paikka: '', alkuPvm: '2026-10-15', loppuPvm: '' }), { paikka: '', paivat: [] });
  assert.equal(haut.length, 1);
});

test('tuntematon paikka palauttaa tyhjän ja muistetaan', async () => {
  const { kisanSaa, haut } = luo({ vastaa: () => [400, EI_PAIKKAA] });
  const kisa = { paikka: 'Eioleolemassa', alkuPvm: '2026-10-15', loppuPvm: '' };
  assert.deepEqual(await kisanSaa(kisa), { paikka: '', paivat: [] });
  await kisanSaa(kisa);
  assert.equal(haut.length, 1);
});

test('hakuvirheessä tai tyhjässä vastauksessa käytetään vanhaa ennustetta, ilman sitä virhe heitetään', async () => {
  let aika = NYT;
  let vastaus = paivaXml('2026-10-15', 8, 1);
  const { kisanSaa } = luo({ vastaa: () => vastaus, nyt: () => aika });
  const kisa = { paikka: 'Oulainen', alkuPvm: '2026-10-15', loppuPvm: '' };
  await kisanSaa(kisa);

  aika = NYT + ENNUSTE_TUORE_MS + 1;
  vastaus = new Error('verkko');
  assert.equal((await kisanSaa(kisa)).paivat.length, 1);
  vastaus = '<wfs:FeatureCollection></wfs:FeatureCollection>';
  assert.equal((await kisanSaa(kisa)).paivat.length, 1);
  vastaus = [503, 'Service Unavailable'];
  assert.equal((await kisanSaa(kisa)).paivat.length, 1);

  const { kisanSaa: tyhjaHaku } = luo({ vastaa: () => new Error('verkko') });
  await assert.rejects(tyhjaHaku(kisa), /verkko/);
});
