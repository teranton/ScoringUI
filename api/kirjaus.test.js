import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

const ID = '1rs_ZwCclYUxrDueBIc65M-49ZAh4XpxSFGOPNqEU3iU';
process.env.KIRJAUS_SALAISUUS = 'testisalaisuus-joka-on-pitka';

// Taulukko muistissa: välilehti → { id, rivit }. Muotoilematon luku palautetaan lukuna, muotoiltu tekstinä.
let taulukko;
let jaettu = true;
let kirjoitukset = 0;
let lukuja = 0;

function alueenTiedot(alue) {
  const m = decodeURIComponent(alue).match(/^'((?:[^']|'')+)'(?:!A(\d+)(?::[A-Z]+(\d+))?)?/);
  return { tab: m[1].replace(/''/g, "'"), alku: m[2] ? Number(m[2]) : 1, loppu: m[3] ? Number(m[3]) : null };
}
const tabIdlla = (id) => Object.values(taulukko).find((t) => t.id === id);
const soluArvo = (s) => s.userEnteredValue?.numberValue ?? s.userEnteredValue?.stringValue ?? '';

async function request({ url, method = 'GET', data }) {
  if (!jaettu) throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
  const u = new URL(url);
  if (method === 'GET' && u.pathname.endsWith(ID)) {
    lukuja++;
    return { data: { properties: { title: 'Testikisa' }, sheets: Object.entries(taulukko).map(([title, t]) => ({ properties: { title, sheetId: t.id } })) } };
  }
  if (u.pathname.endsWith('values:batchGet')) {
    lukuja++;
    const muotoiltu = u.searchParams.get('valueRenderOption') === 'FORMATTED_VALUE';
    return { data: { valueRanges: u.searchParams.getAll('ranges').map((alue) => {
      const { tab, alku, loppu } = alueenTiedot(alue);
      const rivit = (taulukko[tab]?.rivit || []).slice(alku - 1, loppu ?? undefined)
        .map((r) => (r || []).map((v) => (muotoiltu && typeof v === 'number' && v > 1e11 ? v.toExponential(5) : v)));
      return { values: rivit };
    }) } };
  }
  if (u.pathname.endsWith(':batchUpdate')) {
    kirjoitukset++;
    for (const r of data.requests) {
      if (r.addSheet) {
        if (taulukko[r.addSheet.properties.title]) throw Object.assign(new Error('x'), { response: { status: 400, data: { error: { message: 'already exists' } } } });
        taulukko[r.addSheet.properties.title] = { id: r.addSheet.properties.sheetId, rivit: [] };
      } else if (r.updateCells) {
        tabIdlla(r.updateCells.start.sheetId).rivit[r.updateCells.start.rowIndex] = r.updateCells.rows[0].values.map(soluArvo);
      } else if (r.appendCells) {
        tabIdlla(r.appendCells.sheetId).rivit.push(...r.appendCells.rows.map((row) => row.values.map(soluArvo)));
      }
    }
    return { data: {} };
  }
  throw new Error(`odottamaton pyyntö ${method} ${url}`);
}

mock.module('./_lib/googleAuth.js', { namedExports: {
  onKiintioVirhe: () => false,
  onKirjuriMaaritetty: () => true,
  pyyntoUudelleenyrittaen: (req, opts) => req(opts),
  haeKirjuriAsiakas: async () => ({ request })
} });
mock.module('./_lib/sheetAllowlist.js', { namedExports: {
  torjuEiSallittuSheetId: async (sheetId, res) => {
    if (sheetId === ID) return false;
    res.status(403).json({ error: 'ei rekisterissä' });
    return true;
  }
} });

const { default: handler, tyhjennaKirjausMuisti } = await import('./kirjaus.js');
const { luoAvain } = await import('./_lib/kirjausAvain.js');

const avain = (sarake = 2, sheetId = ID) => luoAvain({ sheetId, sarake, voimassaAsti: Math.floor(Date.now() / 1000) + 3600 }, process.env.KIRJAUS_SALAISUUS);

function kutsu({ method = 'GET', toiminto = 'avaa', token = avain(), body } = {}) {
  const res = {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; }
  };
  const req = { method, query: { toiminto }, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
  return handler(req, res).then(() => res);
}

function alusta() {
  jaettu = true;
  kirjoitukset = 0;
  lukuja = 0;
  tyhjennaKirjausMuisti();
  taulukko = {
    KISANSPEKSIT: { id: 1, rivit: [['RATA2_NIMI', 'Kakkonen'], ['RATA2_OHJELMA', 'SDD'], ['LAYOUT/PÄIVÄ', '2']] },
    'Aikataulu La': { id: 2, rivit: [
      ['AIKATAULU | 11.7.2026'],
      ['RATA1', '', '', 'RATA2'],
      ['09:00', '1', 'Aaltonen A', '09:00', '3', 'Cederberg C'],
      ['09:04', '2', 'Berg B', '09:04', '4', 'Dahl D']
    ] }
  };
}

const MERKIT = 'XXXXO' + '-'.repeat(20);
const VERSIO = 1760012345678;

test('ilman koodia tai väärällä koodilla ei pääse', async () => {
  alusta();
  assert.equal((await kutsu({ token: '' })).statusCode, 401);
  assert.equal((await kutsu({ token: 'v1.a.b' })).statusCode, 401);
  assert.equal((await kutsu({ token: avain(2, '1Ert3n7Fft235Zpoc42NZnGxOOhM1kQzwhef6lRF0geI') })).statusCode, 403);
  assert.equal((await kutsu({ toiminto: 'muu' })).statusCode, 400);
  assert.equal((await kutsu({ method: 'POST', toiminto: 'avaa' })).statusCode, 405);
});

test('avaa: radan jono, nimi ja tyhjät kortit', async () => {
  alusta();
  const res = await kutsu();
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.kisa, 'Testikisa');
  assert.equal(res.body.rataNimi, 'Kakkonen');
  assert.equal(res.body.ohjelma, 'SDD');
  assert.deepEqual(res.body.jono.map((a) => a.nro), [3, 4, 1, 2]);
  assert.deepEqual(res.body.kortit, []);
});

test('jakamaton taulukko: kirjaus ei ole käytössä', async () => {
  alusta();
  jaettu = false;
  const res = await kutsu();
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /ei ole käytössä/);
});

test('tallenna: välilehdet otsikkoineen, kortti ja loki yhdellä kirjoituksella; vanha versio ei kirjoita', async () => {
  alusta();
  const body = { laite: 'laite-1', kortit: [{ nro: 3, nimi: 'Cederberg C', merkit: MERKIT, versio: VERSIO }] };
  const res = await kutsu({ method: 'POST', toiminto: 'tallenna', body });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { tallennetut: [3], uudemmat: [] });
  assert.equal(kirjoitukset, 2, 'välilehtien luonti + kortit ja loki');
  const tab = taulukko['MOBIILI Rata 2'].rivit;
  assert.equal(tab[0][0], 'NRO');
  assert.deepEqual(tab[3].slice(0, 3), [3, 'Cederberg C', 4]);
  assert.equal(tab[3][5], VERSIO);
  assert.equal(taulukko.MOBIILI_LOKI.rivit[0][0], 'AIKA');
  assert.equal(taulukko.MOBIILI_LOKI.rivit.length, 2);

  // Seuraava tallennus: välilehdet muistissa, yksi luku ja yksi kirjoitus.
  lukuja = 0;
  kirjoitukset = 0;
  const toinen = await kutsu({ method: 'POST', toiminto: 'tallenna', body: { laite: 'laite-1', kortit: [{ nro: 4, merkit: MERKIT, versio: VERSIO }] } });
  assert.deepEqual(toinen.body.tallennetut, [4]);
  assert.equal(lukuja, 1);
  assert.equal(kirjoitukset, 1);

  // Sama lähetys uudelleen: kuitataan, ei kirjoiteta eikä lokiteta.
  const uudelleen = await kutsu({ method: 'POST', toiminto: 'tallenna', body: JSON.stringify(body) });
  assert.deepEqual(uudelleen.body, { tallennetut: [3], uudemmat: [] });
  assert.equal(taulukko.MOBIILI_LOKI.rivit.length, 3);

  // Vanhempi versio: palautetaan taulukon kortti.
  const vanha = await kutsu({ method: 'POST', toiminto: 'tallenna', body: { laite: 'laite-2', kortit: [{ nro: 3, merkit: 'O'.repeat(25), versio: VERSIO - 1 }] } });
  assert.deepEqual(vanha.body, { tallennetut: [], uudemmat: [{ nro: 3, merkit: MERKIT, versio: VERSIO }] });

  // Avaus palauttaa tallennetut kortit, versio tarkkana lukuna.
  const avattu = await kutsu();
  assert.deepEqual(avattu.body.kortit, [{ nro: 3, merkit: MERKIT, versio: VERSIO }, { nro: 4, merkit: MERKIT, versio: VERSIO }]);
});

test('tallenna: toinen laite ehti luoda välilehdet', async () => {
  alusta();
  await kutsu();
  taulukko['MOBIILI Rata 2'] = { id: 77, rivit: [['NRO']] };
  taulukko.MOBIILI_LOKI = { id: 78, rivit: [['AIKA']] };
  const res = await kutsu({ method: 'POST', toiminto: 'tallenna', body: { laite: 'laite-1', kortit: [{ nro: 1, merkit: MERKIT, versio: 5 }] } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.tallennetut, [1]);
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[1][0], 1);
});

test('tallenna torjuu virheellisen rungon', async () => {
  alusta();
  const res = await kutsu({ method: 'POST', toiminto: 'tallenna', body: { laite: 'laite-1', kortit: [{ nro: 3, merkit: 'XX', versio: 1 }] } });
  assert.equal(res.statusCode, 400);
});
