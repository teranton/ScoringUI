import test from 'node:test';
import assert from 'node:assert/strict';
import { luoSheetAllowlist, normalisoiSheetId, parseRekisterinSheetIdt } from './sheetAllowlist.js';

const ID_A = '1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ID_B = '1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const ID_C = '1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const rekisteri = (...ids) => [
  'ID,Nimi,Alku,Loppu,Sheet,Joukkue,Piilotettu',
  ...ids.map((id, i) => `${i + 1},Kisa ${i + 1},2026-01-01,2026-01-02,${id},,`)
].join('\n');

test('normalisoiSheetId hyväksyy id:n ja Google Sheets -osoitteen', () => {
  assert.equal(normalisoiSheetId(ID_A), ID_A);
  assert.equal(normalisoiSheetId(`https://docs.google.com/spreadsheets/d/${ID_A}/edit#gid=0`), ID_A);
  assert.equal(normalisoiSheetId('../etc'), '');
  assert.equal(normalisoiSheetId(''), '');
});

test('parseRekisterinSheetIdt lukee sarakkeen E ja ohittaa otsikkorivin', () => {
  const ids = parseRekisterinSheetIdt(rekisteri(ID_A, `https://docs.google.com/spreadsheets/d/${ID_B}/edit`));
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
