import test from 'node:test';
import assert from 'node:assert/strict';
import { asetaValimuisti, cloudflareOtsikko } from './cdnOtsikot.js';

test('cloudflareOtsikko: s-maxage ja stale-while-revalidate Cloudflarelle', () => {
  assert.equal(cloudflareOtsikko('public, s-maxage=15, stale-while-revalidate=15'), 'max-age=15, stale-while-revalidate=15');
  assert.equal(cloudflareOtsikko('public, s-maxage=10'), 'max-age=10');
  assert.equal(cloudflareOtsikko('no-store'), null);
  assert.equal(cloudflareOtsikko(undefined), null);
});

test('asetaValimuisti: Cloudflare-otsikko vain, kun Vercel saa välimuistittaa', () => {
  const otsikot = {};
  const res = { setHeader: (k, v) => { otsikot[k] = v; } };
  asetaValimuisti(res, 'public, s-maxage=300, stale-while-revalidate=86400');
  assert.equal(otsikot['Cache-Control'], 'public, s-maxage=300, stale-while-revalidate=86400');
  assert.equal(otsikot['Cloudflare-CDN-Cache-Control'], 'max-age=300, stale-while-revalidate=86400');

  const ei = {};
  asetaValimuisti({ setHeader: (k, v) => { ei[k] = v; } }, 'no-store');
  assert.equal(ei['Cloudflare-CDN-Cache-Control'], undefined);
});
