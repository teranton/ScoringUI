import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LOGO_PROXY_CACHE_BYTES = String(3 * 1024);
delete process.env.LOGO_PROXY_HOST_POLICY;
delete process.env.LOGO_PROXY_ALLOWED_HOSTS;

class EstettyHakuError extends Error {}
const haut = [];
let seuraava = null;

mock.module('./_lib/safeFetch.js', { namedExports: {
  EstettyHakuError,
  onEstettyIp: () => false,
  puhdasHost: (h) => String(h || '').toLowerCase(),
  turvallinenHaku: async (url, { hostSallittu }) => {
    haut.push(url);
    if (!hostSallittu(new URL(url).hostname)) throw new EstettyHakuError(`Estetty: ${url} -> 10.0.0.1`);
    if (seuraava) {
      const virhe = seuraava;
      seuraava = null;
      throw virhe;
    }
    return { status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.alloc(1024) };
  }
} });

const { default: handler, logoValimuistinKoko } = await import('./logoProxy.js');

function vastaus() {
  const res = { status: 0, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (s) => { res.status = s; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}

const pyyda = async (url) => {
  const res = vastaus();
  await handler({ method: 'GET', query: { url } }, res);
  return res;
};

const drive = (n) => `https://drive.google.com/thumbnail?id=${n}&sz=w1000`;

test('oletuksena vain Drive-osoitteet sallitaan', async () => {
  const res = await pyyda('https://example.com/logo.png');
  assert.equal(res.status, 403);
  assert.equal(haut.length, 0);

  const ok = await pyyda(drive('a'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['x-scoringui-logo-cache'], 'origin');
  assert.equal(ok.headers['cloudflare-cdn-cache-control'], 'max-age=86400, stale-while-revalidate=604800');

  const lh3 = await pyyda('https://lh3.googleusercontent.com/d/abc');
  assert.equal(lh3.status, 200);
});

test('muistivälimuisti pysyy tavurajan sisällä ja poistaa vanhimman', async () => {
  for (const n of ['b', 'c', 'd', 'e', 'f']) assert.equal((await pyyda(drive(n))).status, 200);
  const koko = logoValimuistinKoko();
  assert.ok(koko.tavut <= 3 * 1024, `tavut ${koko.tavut}`);
  assert.equal(koko.maara, 3);

  const hautEnnen = haut.length;
  const osuma = await pyyda(drive('f'));
  assert.equal(osuma.headers['x-scoringui-logo-cache'], 'memory-hit');
  assert.equal(haut.length, hautEnnen);

  const poistettu = await pyyda(drive('b'));
  assert.equal(poistettu.headers['x-scoringui-logo-cache'], 'origin');
});

test('virhevastaus ei kerro upstream-virheen yksityiskohtia', async () => {
  seuraava = new Error('connect ECONNREFUSED 10.1.2.3:443 sisainen.palvelin');
  const res = await pyyda(drive('virhe'));
  assert.equal(res.status, 502);
  assert.deepEqual(res.body, { error: 'Logo proxy fetch failed' });
});
