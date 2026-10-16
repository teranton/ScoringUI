import test from 'node:test';
import assert from 'node:assert/strict';
import { luoSheetAllowlist, normalisoiSheetId, parseRekisterinKisat, parseRekisterinSheetIdt } from './sheetAllowlist.js';
import { rivitCsvksi } from './sheetsData.js';

const ID_A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ID_B = '1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const ID_C = '1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const rekisteri = (...ids) => [
  'ID,Nimi,Alku,Loppu,Sheet,Joukkue,Piilotettu',
  ...ids.map((id, i) => `${i + 1},Kisa ${i + 1},2026-01-01,2026-01-02,${id},,`)
].join('\n');

test('normalisoiSheetId hyväksyy vain pelkän id:n', () => {
  assert.equal(normalisoiSheetId(ID_A), ID_A);
  assert.equal(normalisoiSheetId(`https://docs.google.com/spreadsheets/d/${ID_A}/edit#gid=0`), '');
  assert.equal(normalisoiSheetId('../etc'), '');
  assert.equal(normalisoiSheetId(''), '');
});

test('parseRekisterinSheetIdt lukee sarakkeen E ja ohittaa otsikkorivin', () => {
  const ids = parseRekisterinSheetIdt(rekisteri(ID_A, ID_B, ''));
  assert.deepEqual([...ids].sort(), [ID_A, ID_B]);
});

test('vain rekisterissä oleva id on sallittu', async () => {
  const onSallittu = luoSheetAllowlist({ haeRekisteriCsv: async () => rekisteri(ID_A) });
  assert.equal(await onSallittu(ID_A), true);
  assert.equal(await onSallittu(ID_C), false);
  assert.equal(await onSallittu(undefined), false);
  assert.equal(await onSallittu([ID_A, ID_C]), false);
});

test('rekisterin hakuvirhe estää pyynnön (fail closed)', async () => {
  const onSallittu = luoSheetAllowlist({ haeRekisteriCsv: async () => { throw new Error('Google alhaalla'); } });
  await assert.rejects(onSallittu(ID_A));
});

test('uusi kisa näkyy rekisterin uudelleenhaun jälkeen, mutta hakuja rajoitetaan', async () => {
  let aika = 0;
  let haut = 0;
  let csv = rekisteri(ID_A);
  const onSallittu = luoSheetAllowlist({
    haeRekisteriCsv: async () => { haut++; return csv; },
    now: () => aika
  });

  assert.equal(await onSallittu(ID_A), true);
  csv = rekisteri(ID_A, ID_B);
  assert.equal(await onSallittu(ID_B), false);
  assert.equal(haut, 1);

  aika = 31 * 1000;
  assert.equal(await onSallittu(ID_B), true);
  assert.equal(haut, 2);
});

test('epäonnistunut päivitys pitää edellisen listan voimassa', async () => {
  let aika = 0;
  let rikki = false;
  const onSallittu = luoSheetAllowlist({
    haeRekisteriCsv: async () => { if (rikki) throw new Error('503'); return rekisteri(ID_A); },
    now: () => aika
  });

  assert.equal(await onSallittu(ID_A), true);
  rikki = true;
  aika = 6 * 60 * 1000; // lista vanhentunut, päivitys taustalla epäonnistuu
  assert.equal(await onSallittu(ID_A), true);
  assert.equal(await onSallittu(ID_C), false);
  await new Promise((r) => setImmediate(r));
  assert.equal(await onSallittu(ID_A), true);
});

test('rekisterin kisarivi ja latauksen tila ovat luettavissa', async () => {
  const onSallittu = luoSheetAllowlist({ haeRekisteriCsv: async () => rekisteri(ID_A) });
  assert.equal(onSallittu.onLadattu(), false);
  assert.equal(onSallittu.kisa(ID_A), null);
  await onSallittu(ID_A);
  assert.equal(onSallittu.onLadattu(), true);
  assert.deepEqual(onSallittu.kisa(ID_A), { alkuPvm: '2026-01-01', loppuPvm: '2026-01-02', ranking: false, testi: false });
  assert.equal(onSallittu.kisa(ID_C), null);
});

test('Sheets API:n lyhyet rekisteririvit jäsentyvät kuten CSV-vienti', () => {
  // Sheets API jättää rivin lopun tyhjät solut pois (F/G-liput puuttuvat).
  const csv = rivitCsvksi([
    ['Kisa-ID', 'Kisan nimi', 'Alkupvm', 'Loppupvm', 'Sheet ID', 'Joukkue', 'Piilotettu'],
    ['1', 'A', '2026-01-01', '', ID_A],
    ['2', 'B', '2026-02-01', '2026-02-02', ID_B, '1', '1', 'Testi'],
    ['3', 'Ranking', '2026-03-01', '', ID_C, '', '', 'Ranking']
  ]);
  const kisat = parseRekisterinKisat(csv);
  assert.deepEqual([...kisat.keys()], [ID_A, ID_B, ID_C]);
  assert.deepEqual(kisat.get(ID_A), { alkuPvm: '2026-01-01', loppuPvm: '', ranking: false, testi: false });
  assert.equal(kisat.get(ID_C).ranking, true);
  assert.equal(kisat.get(ID_B).testi, true);
  assert.equal(rivitCsvksi([]), '');
});
