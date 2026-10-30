import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCsvRows } from '../../src/utils/csv.js';

// Testit käyttävät omaa välimuistihakemistoaan, eivät `vercel dev` -ajon hakemistoa.
process.env.SCORINGUI_VALIMUISTI_HAKEMISTO = await mkdtemp(path.join(tmpdir(), 'scoringui-testi-'));
const {
  haeValilehdetCsv,
  kanoninenValilehti,
  julkisetSarakkeet,
  kohdistaValilehdet,
  onSallittuValilehti,
  rivitCsvksi,
  tyhjennaValilehtiCache,
  valilehtiAlue
} = await import('./sheetsData.js');

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

test('kesken kisan luotu MOBIILI-välilehti: vanha lista haetaan uudelleen minuutin jälkeen', async () => {
  await tyhjennaValilehtiCache();
  const valilehdet = ['Tulokset Y'];
  const { request } = luoGoogle(valilehdet, { 'Tulokset Y': [['A']], MOBIILI_LAITTEET: [['RATA'], ['1']] });
  const nimet = ['Tulokset Y', 'MOBIILI_LAITTEET'];
  const alku = Date.now();
  await haeValilehdetCsv({ request, sheetId: `${SHEET}9`, nimet, nyt: alku });
  valilehdet.push('MOBIILI_LAITTEET');
  const heti = await haeValilehdetCsv({ request, sheetId: `${SHEET}9`, nimet, nyt: alku + 30 * 1000 });
  assert.deepEqual(heti.notFound, ['MOBIILI_LAITTEET']);
  const myohemmin = await haeValilehdetCsv({ request, sheetId: `${SHEET}9`, nimet, nyt: alku + 61 * 1000 });
  assert.deepEqual(myohemmin, { csvByName: { 'Tulokset Y': 'A', MOBIILI_LAITTEET: 'RATA\n1' }, notFound: [] });
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

test('onSallittuValilehti sallii kisan välilehdet ja kauden rankingin, ei muita', () => {
  assert.equal(onSallittuValilehti('Tulokset Y'), true);
  assert.equal(onSallittuValilehti(' kisanspeksit '), true);
  assert.equal(onSallittuValilehti('RANKING_2026'), true);
  assert.equal(onSallittuValilehti('ranking_2027'), true);
  assert.equal(onSallittuValilehti('KISAT'), true);
  assert.equal(onSallittuValilehti('RANKING'), false);
  assert.equal(onSallittuValilehti('RANKING_2026_vanha'), false);
  assert.equal(onSallittuValilehti('LASKENTA'), false);
  assert.equal(onSallittuValilehti('KITI_DATA'), false);
});

test('kanoninenValilehti antaa frontendin kirjoitusasun tai tyhjän', () => {
  assert.equal(kanoninenValilehti(' tulokset y '), 'Tulokset Y');
  assert.equal(kanoninenValilehti('RYHMÄJAKO'), 'Ryhmäjako');
  assert.equal(kanoninenValilehti('ranking_2027'), 'RANKING_2027');
  assert.equal(kanoninenValilehti('kisat'), 'KISAT');
  assert.equal(kanoninenValilehti('Ryhmäjako'.normalize('NFD')), 'Ryhmäjako');
  assert.equal(kanoninenValilehti('KITI_DATA'), '');
  assert.equal(kanoninenValilehti('mobiili rata 03'), 'MOBIILI Rata 3');
  assert.equal(kanoninenValilehti('mobiili_laitteet'), 'MOBIILI_LAITTEET');
  assert.equal(kanoninenValilehti('MOBIILI_LOKI'), '');
});

test('mobiilikirjauksen välilehdet: kortit, laitteet ja ryhmät, ei lokia', () => {
  assert.equal(onSallittuValilehti('MOBIILI Rata 3'), true);
  assert.equal(onSallittuValilehti('mobiili rata 12'), true);
  assert.equal(onSallittuValilehti('MOBIILI_LAITTEET'), true);
  assert.equal(onSallittuValilehti('MOBIILI_LOKI'), false);
  assert.equal(onSallittuValilehti('MOBIILI_RYHMAT'), true);
  assert.equal(onSallittuValilehti('MOBIILI Layout 1'), true);
  assert.equal(onSallittuValilehti('MOBIILI Layout'), false);
  assert.equal(onSallittuValilehti('MOBIILI Rata'), false);
});

test('ilmoittautumisten lähteistä vain nimi, sarja, seura ja siirtomerkintä', () => {
  assert.equal(kanoninenValilehti('suomisport import'), 'Suomisport Import');
  assert.equal(kanoninenValilehti('ilmoittautumiset'), 'ILMOITTAUTUMISET');
  assert.equal(kanoninenValilehti('Lomakevastaukset 1'), 'Lomakevastaukset 1');
  assert.equal(kanoninenValilehti('form responses 2'), 'Form Responses 2');
  assert.equal(kanoninenValilehti('Lomakevastaukset'), '');
  const tuonti = [
    ['Sportti-ID', 'NIMI', 'SARJA', 'SEURA', 'HUOM', 'TUOMARIKORTTI', 'SIIRRETTY'],
    ['40374311', 'Saastamoinen Juho', 'Y', 'KajA', 'Tarkista maksu', 'Tuomari: I', '']
  ];
  assert.deepEqual(julkisetSarakkeet('Suomisport Import', tuonti), [
    ['NIMI', 'SARJA', 'SEURA', 'SIIRRETTY'],
    ['Saastamoinen Juho', 'Y', 'KajA', '']
  ]);
  const lomake = [
    ['Aikaleima', 'Sukunimi', 'Etunimi', 'Sarja', 'Seura', 'Sähköpostiosoite', 'Puhelinnumero'],
    ['1.11.2026', 'Rantonen', 'Tero', 'Y', 'OMAS', 't@x.fi', '040']
  ];
  assert.deepEqual(julkisetSarakkeet('Lomakevastaukset 1', lomake), [
    ['Sukunimi', 'Etunimi', 'Sarja', 'Seura'],
    ['Rantonen', 'Tero', 'Y', 'OMAS']
  ]);
  const oma = [['AIKALEIMA', 'SUKUNIMI', 'ETUNIMI', 'NIMI', 'SARJA', 'SEURA', 'SÄHKÖPOSTI', 'PUHELIN', 'LISÄTIETOJA', 'SIIRRETTY']];
  assert.deepEqual(julkisetSarakkeet('ILMOITTAUTUMISET', oma), [['SUKUNIMI', 'ETUNIMI', 'NIMI', 'SARJA', 'SEURA', 'SIIRRETTY']]);
});

test('julkisetSarakkeet jättää laitteen tunnukset, PIN-virheet ja täydennykset pois', () => {
  const kortit = [
    ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', 'LAITE', 'VERSIO', '1', '2'],
    [],
    [2, 'Matti', 1, '28.10.2026 10.00', 'laite-abc', 1761638400000, 'X', 'O']
  ];
  assert.deepEqual(julkisetSarakkeet('MOBIILI Rata 1', kortit), [
    ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', '1', '2'],
    ['', '', '', '', '', ''],
    [2, 'Matti', 1, '28.10.2026 10.00', 'X', 'O']
  ]);
  const laitteet = [
    ['RATA', 'SUKUPOLVI', 'LAITE', 'LAITTEEN NIMI', 'OTETTU', 'TAPA', 'PIN-VIRHEET', 'LINJA', 'LINJA PÄIVITETTY', 'TÄYDENNYKSET'],
    [1, 3, 'laite-abc', 'Android Chrome …1234', '28.10.2026', 'PIN', 2, '{"ohitetut":[4]}', '28.10.2026 10.01', '{"5":"XX"}']
  ];
  assert.deepEqual(julkisetSarakkeet('MOBIILI_LAITTEET', laitteet), [
    ['RATA', 'LINJA', 'LINJA PÄIVITETTY'],
    [1, '{"ohitetut":[4]}', '28.10.2026 10.01']
  ]);
  const ryhmaKortit = [
    ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', 'LAITE', 'VERSIO', 'RYHMÄ', 'HYVÄKSYTTY', 'ASEMA 3', '3/1', '3/2', 'KUITATUT'],
    [5, 'Matti', 1, 'x', 'laite-abc', 7, 2, '', 1, 'X', 'O', '3']
  ];
  assert.deepEqual(julkisetSarakkeet('MOBIILI Layout 2', ryhmaKortit), [['NRO', 'NIMI', 'ASEMA 3', '3/1', '3/2'], [5, 'Matti', 1, 'X', 'O']]);
  assert.deepEqual(julkisetSarakkeet('MOBIILI_RYHMAT', [['RYHMÄ', 'SUKUPOLVI', 'LAITE'], [1, 2, 'salainen']]), [['RYHMÄ'], [1]]);
  const muu = [['a', 'b']];
  assert.equal(julkisetSarakkeet('Tulokset Y', muu), muu);
});

test('haeValilehdetCsv antaa mobiilivälilehdet rajattuina', async () => {
  const request = async ({ url }) => {
    if (!url.includes('batchGet')) return { data: { sheets: [{ properties: { title: 'MOBIILI_LAITTEET' } }] } };
    return { data: { valueRanges: [{ values: [['RATA', 'LAITE', 'LINJA'], [1, 'salainen', '{}']] }] } };
  };
  const tulos = await haeValilehdetCsv({ request, sheetId: `${SHEET}M`, nimet: ['MOBIILI_LAITTEET'] });
  assert.equal(tulos.csvByName.MOBIILI_LAITTEET, 'RATA,LINJA\n1,{}');
});
