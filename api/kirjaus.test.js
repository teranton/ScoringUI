import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

const ID = '1rs_ZwCclYUxrDueBIc65M-49ZAh4XpxSFGOPNqEU3iU';
process.env.KIRJAUS_SALAISUUS = 'testisalaisuus-joka-on-pitka';
process.env.KIRJURI_CLIENT_EMAIL = 'kirjuri@example.com';
process.env.KIRJURI_PRIVATE_KEY = 'avain';

// Yksinkertainen taulukko muistissa: välilehti → rivit.
let taulukko;
let jaettu = true;
const pyynnot = [];

function alueenTiedot(alue) {
  const m = decodeURIComponent(alue).match(/^'((?:[^']|'')+)'(?:!A(\d+)(?::[A-Z]+(\d+))?)?/);
  return { tab: m[1].replace(/''/g, "'"), alku: m[2] ? Number(m[2]) : 1, loppu: m[3] ? Number(m[3]) : null };
}

async function request({ url, method = 'GET', data }) {
  pyynnot.push({ url, method });
  if (!jaettu) throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
  const u = new URL(url);
  if (method === 'GET' && u.pathname.endsWith(ID)) {
    return { data: { properties: { title: 'Testikisa' }, sheets: Object.keys(taulukko).map((title) => ({ properties: { title } })) } };
  }
  if (u.pathname.endsWith('values:batchGet')) {
    return { data: { valueRanges: u.searchParams.getAll('ranges').map((alue) => {
      const { tab, alku, loppu } = alueenTiedot(alue);
      const rivit = taulukko[tab] || [];
      return { values: rivit.slice(alku - 1, loppu ?? rivit.length) };
    }) } };
  }
  if (u.pathname.endsWith(':batchUpdate') && data.requests) {
    data.requests.forEach((r) => { taulukko[r.addSheet.properties.title] = []; });
    return { data: {} };
  }
  if (u.pathname.endsWith('values:batchUpdate')) {
    data.data.forEach(({ range, values }) => {
      const { tab, alku } = alueenTiedot(range);
      taulukko[tab][alku - 1] = values[0].map(String);
    });
    return { data: {} };
  }
  if (method === 'PUT') {
    const { tab } = alueenTiedot(u.pathname.split('/values/')[1]);
    taulukko[tab][0] = data.values[0];
    return { data: {} };
  }
  if (u.pathname.endsWith(':append')) {
    const { tab } = alueenTiedot(u.pathname.split('/values/')[1].replace(/:append$/, ''));
    taulukko[tab].push(...data.values.map((r) => r.map(String)));
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

const { default: handler } = await import('./kirjaus.js');
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
  pyynnot.length = 0;
  taulukko = {
    KISANSPEKSIT: [['RATA2_NIMI', 'Kakkonen'], ['LAYOUT/PÄIVÄ', '2']],
    'Aikataulu La': [
      ['AIKATAULU | 11.7.2026'],
      ['RATA1', '', '', 'RATA2'],
      ['09:00', '1', 'Aaltonen A', '09:00', '3', 'Cederberg C'],
      ['09:04', '2', 'Berg B', '09:04', '4', 'Dahl D']
    ]
  };
}

const MERKIT = 'XXXXO' + '-'.repeat(20);

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

test('tallenna luo välilehdet, kirjoittaa kortin ja lokin; vanha versio ei kirjoita', async () => {
  alusta();
  const body = { laite: 'laite-1', kortit: [{ nro: 3, merkit: MERKIT, versio: 10 }] };
  const res = await kutsu({ method: 'POST', toiminto: 'tallenna', body });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { tallennetut: [3], uudemmat: [] });
  const rivi = taulukko['MOBIILI Rata 2'][3];
  assert.deepEqual(rivi.slice(0, 3), ['3', 'Cederberg C', '4']);
  assert.equal(rivi[5], '10');
  assert.equal(taulukko['MOBIILI Rata 2'][0][0], 'NRO');
  assert.equal(taulukko.MOBIILI_LOKI.length, 2);

  // Sama lähetys uudelleen: kuitataan, ei kirjoiteta eikä lokiteta.
  const uudelleen = await kutsu({ method: 'POST', toiminto: 'tallenna', body: JSON.stringify(body) });
  assert.deepEqual(uudelleen.body, { tallennetut: [3], uudemmat: [] });
  assert.equal(taulukko.MOBIILI_LOKI.length, 2);

  // Vanhempi versio: palautetaan taulukon kortti.
  const vanha = await kutsu({ method: 'POST', toiminto: 'tallenna', body: { laite: 'laite-2', kortit: [{ nro: 3, merkit: 'O'.repeat(25), versio: 9 }] } });
  assert.deepEqual(vanha.body, { tallennetut: [], uudemmat: [{ nro: 3, merkit: MERKIT, versio: 10 }] });

  // Avaus palauttaa tallennetun kortin.
  const avattu = await kutsu();
  assert.deepEqual(avattu.body.kortit, [{ nro: 3, merkit: MERKIT, versio: 10 }]);
});

test('tallenna torjuu virheellisen rungon', async () => {
  alusta();
  const res = await kutsu({ method: 'POST', toiminto: 'tallenna', body: { laite: 'laite-1', kortit: [{ nro: 3, merkit: 'XX', versio: 1 }] } });
  assert.equal(res.statusCode, 400);
});
