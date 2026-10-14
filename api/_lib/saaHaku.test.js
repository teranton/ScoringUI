import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { luoSaaHaku, ENNUSTE_TUORE_MS } from './saaHaku.js';
import { luoValimuisti } from './valimuisti.js';

// Ke 14.10.2026 klo 12 Suomen aikaa.
const NYT = new Date('2026-10-14T09:00:00Z').getTime();

const rivi = (time, lampo, symboli) => ({
  time,
  data: {
    instant: { details: { air_temperature: lampo, wind_speed: 4 } },
    next_6_hours: { summary: { symbol_code: symboli }, details: { precipitation_amount: 0.4 } }
  }
});
const YR = { properties: { timeseries: [
  rivi('2026-10-14T09:00:00Z', 10, 'clearsky_day'),
  rivi('2026-10-15T09:00:00Z', 8, 'cloudy'),
  rivi('2026-10-16T09:00:00Z', 6, 'rain')
] } };

function luo({ vastaukset = {}, nyt = () => NYT } = {}) {
  const haut = [];
  const hae = async (url, opts) => {
    haut.push(url);
    const isanta = new URL(url).hostname;
    assert.match(opts?.headers?.['User-Agent'] || '', /tulospalvelu/i);
    const vastaus = vastaukset[isanta];
    if (vastaus instanceof Error) throw vastaus;
    return { ok: true, status: 200, json: async () => vastaus };
  };
  const valimuisti = luoValimuisti('saa', { hakemisto: mkdtempSync(path.join(tmpdir(), 'saa-test-')) });
  return { kisanSaa: luoSaaHaku({ hae, nyt, valimuisti }), haut };
}

const GEO = { results: [
  { name: 'Jakobstad', latitude: 63.0, longitude: 10.0, country_code: 'SE' },
  { name: 'Pietarsaari', latitude: 63.67, longitude: 22.7, country_code: 'FI' }
] };

test('paikan nimi geokoodataan (suomalainen osuma) ja tulevasta kisasta näytetään aloituspäivä', async () => {
  const { kisanSaa, haut } = luo({ vastaukset: { 'geocoding-api.open-meteo.com': GEO, 'api.met.no': YR } });
  const tulos = await kisanSaa({ paikka: 'Pietarsaari', alkuPvm: '2026-10-15', loppuPvm: '2026-10-16' });
  assert.equal(tulos.paikka, 'Pietarsaari');
  assert.deepEqual(tulos.paivat, [{ pvm: '2026-10-15', symboli: 'cloudy', maks: 8, min: 8, sade: 0.4, tuuli: 4 }]);
  const ennusteUrl = new URL(haut[1]);
  assert.equal(ennusteUrl.pathname, '/weatherapi/locationforecast/2.0/compact');
  assert.equal(ennusteUrl.searchParams.get('lat'), '63.67');
  assert.equal(ennusteUrl.searchParams.get('lon'), '22.70');

  // Toinen haku tulee välimuistista.
  await kisanSaa({ paikka: 'pietarsaari ', alkuPvm: '2026-10-15', loppuPvm: '' });
  assert.equal(haut.length, 2);
});

test('koordinaatit käytetään suoraan, kaukainen tai puuttuva kisa ei hae mitään', async () => {
  const { kisanSaa, haut } = luo({ vastaukset: { 'api.met.no': YR } });
  // Käynnissä olevasta kisasta seuraava kisapäivä.
  const tulos = await kisanSaa({ paikka: '64.1, 24.5', alkuPvm: '13.10.2026', loppuPvm: '16.10.2026' });
  assert.deepEqual(tulos.paivat.map((p) => p.pvm), ['2026-10-15']);
  assert.equal(haut.length, 1);

  assert.deepEqual(await kisanSaa({ paikka: '64.1, 24.5', alkuPvm: '2026-12-01', loppuPvm: '' }), { paikka: '', paivat: [] });
  assert.deepEqual(await kisanSaa({ paikka: '', alkuPvm: '2026-10-15', loppuPvm: '' }), { paikka: '', paivat: [] });
  assert.equal(haut.length, 1);
});

test('tuntematon paikka palauttaa tyhjän ja muistetaan', async () => {
  const { kisanSaa, haut } = luo({ vastaukset: { 'geocoding-api.open-meteo.com': {} } });
  assert.deepEqual(await kisanSaa({ paikka: 'Eioleolemassa', alkuPvm: '2026-10-15', loppuPvm: '' }), { paikka: '', paivat: [] });
  await kisanSaa({ paikka: 'Eioleolemassa', alkuPvm: '2026-10-15', loppuPvm: '' });
  assert.equal(haut.length, 1);
});

test('hakuvirheessä käytetään vanhaa ennustetta, ilman sitä virhe heitetään', async () => {
  let aika = NYT;
  const vastaukset = { 'api.met.no': YR };
  const { kisanSaa } = luo({ vastaukset, nyt: () => aika });
  const kisa = { paikka: '64.1, 24.5', alkuPvm: '2026-10-15', loppuPvm: '' };
  await kisanSaa(kisa);

  vastaukset['api.met.no'] = new Error('verkko');
  aika = NYT + ENNUSTE_TUORE_MS + 1;
  assert.equal((await kisanSaa(kisa)).paivat.length, 1);

  const { kisanSaa: tyhjaHaku } = luo({ vastaukset });
  await assert.rejects(tyhjaHaku(kisa), /verkko/);
});

test('vastaus ilman aikasarjaa on virhe eikä korvaa vanhaa', async () => {
  let aika = NYT;
  const vastaukset = { 'api.met.no': YR };
  const { kisanSaa } = luo({ vastaukset, nyt: () => aika });
  const kisa = { paikka: '64.1, 24.5', alkuPvm: '2026-10-15', loppuPvm: '' };
  await kisanSaa(kisa);

  vastaukset['api.met.no'] = { properties: {} };
  aika = NYT + ENNUSTE_TUORE_MS + 1;
  assert.equal((await kisanSaa(kisa)).paivat.length, 1);
});
