import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { luoSaaHaku, ENNUSTE_TUORE_MS } from './saaHaku.js';
import { luoValimuisti } from './valimuisti.js';

const NYT = new Date(2026, 9, 14, 12, 0).getTime();

const DAILY = {
  time: ['2026-10-14', '2026-10-15', '2026-10-16'],
  weather_code: [0, 3, 61],
  temperature_2m_max: [10.4, 8.2, 6.6],
  temperature_2m_min: [1.1, 2.4, 3.9],
  precipitation_probability_max: [0, 15, 90],
  wind_speed_10m_max: [3.1, 4.5, 8.0]
};

function luo({ vastaukset = {}, nyt = () => NYT } = {}) {
  const haut = [];
  const hae = async (url) => {
    haut.push(url);
    const isanta = new URL(url).hostname;
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

test('paikan nimi geokoodataan (suomalainen osuma) ja ennusteesta poimitaan kisapäivät', async () => {
  const { kisanSaa, haut } = luo({ vastaukset: { 'geocoding-api.open-meteo.com': GEO, 'api.open-meteo.com': { daily: DAILY } } });
  const tulos = await kisanSaa({ paikka: 'Pietarsaari', alkuPvm: '2026-10-15', loppuPvm: '2026-10-16' });
  assert.equal(tulos.paikka, 'Pietarsaari');
  assert.deepEqual(tulos.paivat.map((p) => [p.pvm, p.koodi, p.maks]), [['2026-10-15', 3, 8.2], ['2026-10-16', 61, 6.6]]);
  const ennusteUrl = new URL(haut[1]);
  assert.equal(ennusteUrl.searchParams.get('latitude'), '63.67');
  assert.equal(ennusteUrl.searchParams.get('wind_speed_unit'), 'ms');

  // Toinen haku tulee välimuistista.
  await kisanSaa({ paikka: 'pietarsaari ', alkuPvm: '2026-10-15', loppuPvm: '' });
  assert.equal(haut.length, 2);
});

test('koordinaatit käytetään suoraan, kaukainen tai puuttuva kisa ei hae mitään', async () => {
  const { kisanSaa, haut } = luo({ vastaukset: { 'api.open-meteo.com': { daily: DAILY } } });
  const tulos = await kisanSaa({ paikka: '64.1, 24.5', alkuPvm: '14.10.2026', loppuPvm: '' });
  assert.deepEqual(tulos.paivat.map((p) => p.pvm), ['2026-10-14']);
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
  const vastaukset = { 'api.open-meteo.com': { daily: DAILY } };
  const { kisanSaa } = luo({ vastaukset, nyt: () => aika });
  const kisa = { paikka: '64.1, 24.5', alkuPvm: '2026-10-15', loppuPvm: '' };
  await kisanSaa(kisa);

  vastaukset['api.open-meteo.com'] = new Error('verkko');
  aika = NYT + ENNUSTE_TUORE_MS + 1;
  assert.equal((await kisanSaa(kisa)).paivat.length, 1);

  const { kisanSaa: tyhjaHaku } = luo({ vastaukset });
  await assert.rejects(tyhjaHaku(kisa), /verkko/);
});

test('vastaus ilman päiväennustetta on virhe eikä korvaa vanhaa', async () => {
  let aika = NYT;
  const vastaukset = { 'api.open-meteo.com': { daily: DAILY } };
  const { kisanSaa } = luo({ vastaukset, nyt: () => aika });
  const kisa = { paikka: '64.1, 24.5', alkuPvm: '2026-10-15', loppuPvm: '' };
  await kisanSaa(kisa);

  vastaukset['api.open-meteo.com'] = { error: false };
  aika = NYT + ENNUSTE_TUORE_MS + 1;
  assert.equal((await kisanSaa(kisa)).paivat.length, 1);
});
