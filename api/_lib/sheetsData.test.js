import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows } from '../../src/utils/csv.js';
import {
  haeValilehdetCsv,
  kohdistaValilehdet,
  rivitCsvksi,
  tyhjennaValilehtiCache,
  valilehtiAlue
} from './sheetsData.js';

const SHEET = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

test('rivitCsvksi tuottaa saman jäsennyksen kuin CSV-vienti', () => {
  const rivit = [
    [],
    ['', 'SIJOITUS', 'NIMI', 'SARJA', 'TULOS'],
    ['', '1', 'Lindh, Oliver', 'Y', '158,39'],
    ['', '2', 'Sanoi "moi"', 'Y'],
    ['', '3', 'Rivi\nvaihto', ' välit ']
  ];
  const csv = rivitCsvksi(rivit);
  assert.deepEqual(parseCsvRows(csv), [
    ['', 'SIJOITUS', 'NIMI', 'SARJA', 'TULOS'],
    ['', '1', 'Lindh, Oliver', 'Y', '158,39'],
    ['', '2', 'Sanoi "moi"', 'Y', ''],
    ['', '3', 'Rivi\nvaihto', 'välit', '']
  ]);
  assert.equal(rivitCsvksi([]), '');
});

test('valilehtiAlue lainaa nimen ja tuplaa heittomerkit', () => {
  assert.equal(valilehtiAlue('Tulokset Y'), "'Tulokset Y'");
  assert.equal(valilehtiAlue("Rata 1'"), "'Rata 1'''");
});

test('kohdistaValilehdet ohittaa kirjainkoon ja reunavälit', () => {
  const { loydetyt, puuttuvat } = kohdistaValilehdet(['Tulokset Y', 'Aikataulu', 'NEW_Joukkue'], ['tulokset y ', 'NEW_Joukkue']);
  assert.deepEqual(loydetyt, [
    { pyydetty: 'Tulokset Y', todellinen: 'tulokset y ' },
    { pyydetty: 'NEW_Joukkue', todellinen: 'NEW_Joukkue' }
  ]);
  assert.deepEqual(puuttuvat, ['Aikataulu']);
});

function luoGoogle(valilehdet, data) {
  const kutsut = [];
  const request = async ({ url }) => {
    kutsut.push(url);
    if (url.includes('values:batchGet')) {
      const alueet = new URL(url).searchParams.getAll('ranges').map((r) => r.slice(1, -1).replace(/''/g, "'"));
      if (alueet.some((a) => !valilehdet.includes(a))) {
        const virhe = new Error('Unable to parse range');
        virhe.response = { status: 400 };
        throw virhe;
      }
      return { data: { valueRanges: alueet.map((a) => ({ values: data[a] })) } };
    }
    return { data: { sheets: valilehdet.map((title) => ({ properties: { title } })) } };
  };
  return { request, kutsut };
}

test('kaikki välilehdet löytyvät: yksi batchGet ja lista rinnalla', async () => {
  await tyhjennaValilehtiCache();
  const { request, kutsut } = luoGoogle(['Tulokset Y', 'KISANSPEKSIT'], { 'Tulokset Y': [['A', 'B']], KISANSPEKSIT: [['x']] });
  const tulos = await haeValilehdetCsv({ request, sheetId: `${SHEET}4`, nimet: ['Tulokset Y', 'KISANSPEKSIT'] });
  assert.deepEqual(tulos, { csvByName: { 'Tulokset Y': 'A,B', KISANSPEKSIT: 'x' }, notFound: [] });
  assert.equal(kutsut.filter((u) => u.includes('batchGet')).length, 1);
});

test('puuttuva välilehti: haetaan uudelleen löytyneillä nimillä', async () => {
  await tyhjennaValilehtiCache();
  const { request } = luoGoogle(['Tulokset Y ', 'Aikataulu La'], { 'Tulokset Y ': [['A']], 'Aikataulu La': [['L']] });
  const tulos = await haeValilehdetCsv({ request, sheetId: `${SHEET}5`, nimet: ['Tulokset Y', 'Aikataulu', 'Aikataulu La'] });
  assert.deepEqual(tulos, { csvByName: { 'Tulokset Y': 'A', 'Aikataulu La': 'L' }, notFound: ['Aikataulu'] });
});

test('välilehtilista muistissa: ei listahakua, vain yksi batchGet', async () => {
  await tyhjennaValilehtiCache();
  const { request, kutsut } = luoGoogle(['Tulokset Y'], { 'Tulokset Y': [['A']] });
  await haeValilehdetCsv({ request, sheetId: `${SHEET}6`, nimet: ['Tulokset Y', 'Aikataulu'] });
  kutsut.length = 0;
  const tulos = await haeValilehdetCsv({ request, sheetId: `${SHEET}6`, nimet: ['Tulokset Y', 'Aikataulu'] });
  assert.deepEqual(tulos.notFound, ['Aikataulu']);
  assert.equal(kutsut.length, 1);
});

test('muu kuin aluevirhe heitetään eteenpäin', async () => {
  await tyhjennaValilehtiCache();
  const request = async () => { const e = new Error('kielletty'); e.response = { status: 403 }; throw e; };
  await assert.rejects(haeValilehdetCsv({ request, sheetId: `${SHEET}7`, nimet: ['Tulokset Y'] }), /kielletty/);
});

test('iso joukko ilman listaa: ensin lista, sitten yksi batchGet', async () => {
  await tyhjennaValilehtiCache();
  const { request, kutsut } = luoGoogle(['Tulokset Y', 'Aikataulu La'], { 'Tulokset Y': [['A']], 'Aikataulu La': [['L']] });
  const nimet = ['Tulokset Y', 'NEW_Joukkue', 'Ryhmäjako', 'Ilmoittautuneet', 'Aikataulu La'];
  const tulos = await haeValilehdetCsv({ request, sheetId: `${SHEET}8`, nimet });
  assert.deepEqual(tulos.notFound, ['NEW_Joukkue', 'Ryhmäjako', 'Ilmoittautuneet']);
  assert.equal(kutsut.length, 2);
});
