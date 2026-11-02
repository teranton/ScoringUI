import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

let csv = 'Kisa-ID,Kisan nimi\n2026_1,Testi';
mock.module('./_lib/sheetAllowlist.js', { namedExports: {
  haeRekisteriCsv: async () => {
    if (csv instanceof Error) throw csv;
    return csv;
  }
} });

const { default: handler, REKISTERI_OTSIKOT } = await import('./rekisteri.js');

async function kutsu(query = {}) {
  const r = { headers: {}, statusCode: 0, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.json = (b) => { r.body = b; return r; };
  await handler({ query }, r);
  return r;
}

test('julkinen lista: minuutti Cloudflaressa, 5 s Vercelissä', async () => {
  const r = await kutsu();
  assert.equal(r.statusCode, 200);
  assert.equal(r.body, csv);
  assert.equal(r.headers['Cache-Control'], REKISTERI_OTSIKOT.julkinen);
  assert.equal(r.headers['Cloudflare-CDN-Cache-Control'], 'max-age=60, stale-while-revalidate=86400');
  assert.equal(r.headers['Vercel-CDN-Cache-Control'], 'max-age=5');
});

test('?preview=1 ohittaa CDN:n ja selaimen välimuistin', async () => {
  const r = await kutsu({ preview: '1' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
  assert.equal(r.headers['Cloudflare-CDN-Cache-Control'], undefined);
  assert.equal(r.headers['Vercel-CDN-Cache-Control'], undefined);
  assert.equal((await kutsu({ preview: '0' })).headers['Cache-Control'], REKISTERI_OTSIKOT.julkinen);
});

test('virhe: 500 ilman välimuistia', async () => {
  csv = new Error('verkko');
  const r = await kutsu();
  assert.equal(r.statusCode, 500);
  assert.equal(r.headers['Cache-Control'], 'no-store');
});
