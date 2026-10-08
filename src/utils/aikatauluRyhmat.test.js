import test from 'node:test';
import assert from 'node:assert/strict';

import {
  muodostaRyhmaJarjestysTaulukko,
  muodostaYhdistetytRyhmaKortit,
  onkoEnsimmainenPaivaOhitettu,
  parseAikatauluRyhmat,
  parseCompetitionDate,
  suodataNakyvatPaivaosiot,
  toSortValue
} from './aikatauluRyhmat.js';

const TX = { day: 'Päivä', group: 'Ryhmä' };
const csv = (rows) => rows.map((row) => row.join(',')).join('\n');

const RATARUUDUKKO = csv([
  ['Aikataulu | Kevätkisa'],
  ['Aika', 'RATA 1', '', 'Aika', 'RATA 2', ''],
  ['9:00', '1', 'Matti', '', '2', 'Liisa'],
  ['10:00', '6', 'Pekka', '10:00', '3', 'Kalle'],
  ['PÄIVÄ 2'],
  ['9:00', '4', 'Anna', '9:00', '5', 'Ville']
]);

const YHDISTETTY = csv([
  ['Eräluettelo | SM 2026'],
  ['Lauantai'],
  ['START', 'Rata 1', 'Rata 2'],
  ['9:00', '1', '2'],
  ['10:00', '2', '1'],
  ['Sunnuntai'],
  ['START', 'Rata 1', 'Rata 2'],
  ['9:00', '1', '2'],
  ['RYHMÄ', 'Nro', 'Nimi', 'Sarja', 'Seura'],
  ['1', '11', 'Matti Meikäläinen', 'Y', 'Seura A'],
  ['', '12', 'Liisa Virtanen', 'N', 'Seura B'],
  ['2', '21', 'Pekka Puupää', 'Y', '']
]);

test('toSortValue muuntaa kellonajan minuuteiksi', () => {
  assert.equal(toSortValue('9:05'), 545);
  assert.equal(toSortValue('klo 13.30'), 810);
  assert.equal(toSortValue(''), Number.MAX_SAFE_INTEGER);
});

test('parseCompetitionDate hyväksyy p.k.vvvv- ja ISO-muodot', () => {
  assert.deepEqual(parseCompetitionDate('6.6.2026'), new Date(2026, 5, 6));
  assert.deepEqual(parseCompetitionDate('2026-06-06'), new Date(2026, 5, 6));
  assert.equal(parseCompetitionDate('31.6.2026'), null);
  assert.equal(parseCompetitionDate('kesäkuu'), null);
});

test('onkoEnsimmainenPaivaOhitettu on tosi vasta ensimmäisen päivän jälkeen', () => {
  assert.equal(onkoEnsimmainenPaivaOhitettu('6.6.2026', new Date(2026, 5, 6, 23, 59).getTime()), false);
  assert.equal(onkoEnsimmainenPaivaOhitettu('6.6.2026', new Date(2026, 5, 7, 0, 0).getTime()), true);
  assert.equal(onkoEnsimmainenPaivaOhitettu('', new Date(2026, 5, 7).getTime()), false);
});

test('parseAikatauluRyhmat: ratanäkymä jakaa ampujat numeron mukaan ryhmiin päivittäin', () => {
  const parsed = parseAikatauluRyhmat(RATARUUDUKKO, 'group5', TX);

  assert.equal(parsed.mode, 'lane-grid');
  assert.equal(parsed.titleSuffix, 'Kevätkisa');
  assert.deepEqual(parsed.laneColumns, [{ label: '1', startIndex: 0 }, { label: '2', startIndex: 3 }]);
  assert.deepEqual(parsed.daySections.map((s) => [s.key, s.label, s.heats.length]), [
    ['day-1', 'Päivä 1', 3],
    ['day-2', 'PÄIVÄ 2', 1]
  ]);

  const [ekaEra, tokaEra, kolmasEra] = parsed.daySections[0].heats;
  assert.deepEqual([ekaEra.time, ekaEra.heatNumber, ekaEra.groupLabel], ['9:00', 1, 1]);
  assert.deepEqual(ekaEra.shooters, [
    { lane: '1', number: '1', shooter: 'Matti' },
    { lane: '2', number: '2', shooter: 'Liisa' }
  ]);
  assert.deepEqual([tokaEra.time, tokaEra.groupLabel, tokaEra.shooters.map((s) => s.shooter)], ['10:00', 1, ['Kalle']]);
  assert.deepEqual([kolmasEra.time, kolmasEra.groupLabel, kolmasEra.shooters.map((s) => s.shooter)], ['10:00', 2, ['Pekka']]);
});

test('parseAikatauluRyhmat: kuuden ryhmät vaihtavat ryhmäjaon', () => {
  const parsed = parseAikatauluRyhmat(RATARUUDUKKO, 'group6', TX);
  assert.deepEqual(parsed.daySections[0].heats.map((h) => h.groupLabel), [1, 1]);
});

test('parseAikatauluRyhmat: yhdistetty aikataulu lukee ryhmät ja päiväkohtaiset erät', () => {
  const parsed = parseAikatauluRyhmat(YHDISTETTY, 'group5', TX);

  assert.equal(parsed.mode, 'combined-schedule');
  assert.equal(parsed.titleSuffix, 'SM 2026');
  assert.deepEqual(parsed.daySections.map((s) => [s.key, s.label, s.dayNumber, s.heats.length]), [
    ['day-1', 'Lauantai', 1, 4],
    ['day-2', 'Sunnuntai', 2, 2]
  ]);

  const lauantai = parsed.daySections[0].heats;
  assert.deepEqual(lauantai.map((h) => [h.time, h.layoutLabel, h.groupLabel, h.heatNumber]), [
    ['9:00', 'Rata 1', 1, 1],
    ['9:00', 'Rata 2', 2, 2],
    ['10:00', 'Rata 1', 2, 3],
    ['10:00', 'Rata 2', 1, 4]
  ]);
  assert.deepEqual(lauantai[0].shooters, [
    { number: '11', shooter: 'Matti Meikäläinen', className: 'Y', club: 'Seura A', lane: 'Seura A' },
    { number: '12', shooter: 'Liisa Virtanen', className: 'N', club: 'Seura B', lane: 'Seura B' }
  ]);
  assert.equal(lauantai[1].shooters[0].lane, '-');
});

test('parseAikatauluRyhmat: pelkkä ryhmätaulukko ilman START-rivejä', () => {
  const parsed = parseAikatauluRyhmat(csv([
    ['RYHMÄ', 'Nro', 'Nimi', 'Sarja', 'Seura'],
    ['2', '21', 'Pekka', 'Y', ''],
    ['1', '11', 'Matti', 'Y', 'Seura A']
  ]), 'group5', TX);

  assert.equal(parsed.mode, 'group-sheet');
  assert.deepEqual(parsed.daySections.map((s) => s.label), ['Ryhmä']);
  assert.deepEqual(parsed.heats.map((h) => [h.groupLabel, h.shooters[0].shooter]), [[1, 'Matti'], [2, 'Pekka']]);
});

test('parseAikatauluRyhmat palauttaa tyhjän ratanäkymän tunnistamattomalle datalle', () => {
  const tyhja = { mode: 'lane-grid', titleSuffix: '', laneColumns: [], laneRows: [], heats: [], daySections: [] };
  assert.deepEqual(parseAikatauluRyhmat('', 'group5', TX), tyhja);
  assert.deepEqual(parseAikatauluRyhmat('a,b\nc,d', 'group5', TX), { ...tyhja, titleSuffix: 'b' });
});

test('suodataNakyvatPaivaosiot piilottaa ensimmäisen päivän sen päätyttyä', () => {
  const { daySections, mode } = parseAikatauluRyhmat(YHDISTETTY, 'group5', TX);
  const kisapaiva = new Date(2026, 5, 6, 12).getTime();
  const seuraavaPaiva = new Date(2026, 5, 7, 8).getTime();

  assert.equal(suodataNakyvatPaivaosiot(daySections, mode, '6.6.2026', kisapaiva).length, 2);
  assert.deepEqual(suodataNakyvatPaivaosiot(daySections, mode, '6.6.2026', seuraavaPaiva).map((s) => s.key), ['day-2']);
  assert.deepEqual(suodataNakyvatPaivaosiot(daySections.slice(0, 1), mode, '6.6.2026', seuraavaPaiva).map((s) => s.key), ['day-1']);
  assert.equal(suodataNakyvatPaivaosiot(daySections, 'group-sheet', '6.6.2026', seuraavaPaiva).length, 2);
  assert.deepEqual(suodataNakyvatPaivaosiot([], mode, '6.6.2026', seuraavaPaiva), []);
});

test('muodostaYhdistetytRyhmaKortit kokoaa ryhmän kaikki vuorot', () => {
  const { daySections, mode } = parseAikatauluRyhmat(YHDISTETTY, 'group5', TX);
  const kortit = muodostaYhdistetytRyhmaKortit(mode, daySections);

  assert.deepEqual(kortit.map((k) => [k.key, k.shooters.length]), [['group-1', 2], ['group-2', 1]]);
  assert.deepEqual(kortit[0].scheduleRows.map((r) => [r.dayLabel, r.time, r.layoutLabel]), [
    ['Lauantai', '9:00', 'Rata 1'],
    ['Lauantai', '10:00', 'Rata 2'],
    ['Sunnuntai', '9:00', 'Rata 1']
  ]);
  assert.deepEqual(muodostaYhdistetytRyhmaKortit('lane-grid', daySections), []);
});

test('muodostaRyhmaJarjestysTaulukko tekee päiväkohtaisen aika × rata -taulukon', () => {
  const { daySections, mode } = parseAikatauluRyhmat(YHDISTETTY, 'group5', TX);
  const { dayTables } = muodostaRyhmaJarjestysTaulukko(mode, daySections);

  assert.deepEqual(dayTables.map((t) => [t.key, t.layouts]), [
    ['day-1', ['Rata 1', 'Rata 2']],
    ['day-2', ['Rata 1', 'Rata 2']]
  ]);
  assert.deepEqual(dayTables[0].rows, [
    { time: '9:00', layouts: [{ layoutLabel: 'Rata 1', groups: [1] }, { layoutLabel: 'Rata 2', groups: [2] }] },
    { time: '10:00', layouts: [{ layoutLabel: 'Rata 1', groups: [2] }, { layoutLabel: 'Rata 2', groups: [1] }] }
  ]);
  assert.deepEqual(muodostaRyhmaJarjestysTaulukko('lane-grid', daySections), { dayTables: [] });
});
