import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

const ID = '1sp3A5KAkfDuWHK5ltNH8hY9TRIQDc92iol-ILcqlU1U';
const rekisteri = { [ID]: { alkuPvm: '2026-10-15', loppuPvm: '', paikka: 'Oulainen' } };
let saaTulos = { paikka: 'Oulainen', paivat: [{ pvm: '2026-10-15' }] };
const pyynnot = [];

mock.module('./_lib/sheetAllowlist.js', { namedExports: {
  haeRekisteriCsv: async () => 'csv',
  onSallittuSheetId: Object.assign(async () => true, { kisa: () => null }),
  parseRekisterinKisat: () => new Map(Object.entries(rekisteri)),
  torjuEiSallittuSheetId: async (id, res) => {
    if (id in rekisteri) return false;
    res.status(403).json({ error: 'ei' });
    return true;
  }
} });
mock.module('./_lib/saaHaku.js', { namedExports: {
  luoSaaHaku: () => async (kisa) => {
    pyynnot.push(kisa);
    if (saaTulos instanceof Error) throw saaTulos;
    return saaTulos;
  }
} });

const { default: handler, SAA_OTSIKOT } = await import('./saa.js');

async function kutsu(query) {
  const r = { headers: {}, statusCode: 0, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  await handler({ query }, r);
  return r;
}

test('ennuste rekisterin paikasta, CDN-otsikko ennusteen mukaan', async () => {
  const r = await kutsu({ sheetId: ID });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['Cache-Control'], SAA_OTSIKOT.ennuste);
  assert.deepEqual(pyynnot.at(-1), { paikka: 'Oulainen', alkuPvm: '2026-10-15', loppuPvm: '' });

  saaTulos = { paikka: '', paivat: [] };
  assert.equal((await kutsu({ sheetId: ID })).headers['Cache-Control'], SAA_OTSIKOT.tyhja);
});

test('virhe palauttaa tyhjän lyhyellä välimuistilla, tuntematon tai puuttuva id torjutaan', async () => {
  saaTulos = new Error('verkko');
  const r = await kutsu({ sheetId: ID });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { paikka: '', paivat: [], virhe: true });
  assert.equal(r.headers['Cache-Control'], SAA_OTSIKOT.virhe);

  assert.equal((await kutsu({ sheetId: 'x'.repeat(30) })).statusCode, 403);
  assert.equal((await kutsu({})).statusCode, 400);
});
