import { test } from 'node:test';
import assert from 'node:assert/strict';
import { luoAvain, tarkistaAvain } from './kirjausAvain.js';

const SALAISUUS = 'testisalaisuus-joka-on-pitka';
const ID = '1rs_ZwCclYUxrDueBIc65M-49ZAh4XpxSFGOPNqEU3iU';

test('kelvollinen avain avautuu', () => {
  const avain = luoAvain({ sheetId: ID, sarake: 3, voimassaAsti: 2000 }, SALAISUUS);
  assert.deepEqual(tarkistaAvain(avain, SALAISUUS, 1000), { sheetId: ID, sarake: 3, voimassaAsti: 2000 });
});

test('väärä allekirjoitus, muutettu sisältö ja vanhentunut avain torjutaan', () => {
  const avain = luoAvain({ sheetId: ID, sarake: 3, voimassaAsti: 2000 }, SALAISUUS);
  assert.ok(tarkistaAvain(avain, 'toinen-salaisuus-joka-on-pitka', 1000).virhe);
  const [v, , sig] = avain.split('.');
  const muutettu = Buffer.from(JSON.stringify({ s: ID, c: 4, e: 2000 })).toString('base64url');
  assert.ok(tarkistaAvain(`${v}.${muutettu}.${sig}`, SALAISUUS, 1000).virhe);
  assert.equal(tarkistaAvain(avain, SALAISUUS, 2001).virhe, 'Ratakoodi on vanhentunut');
  assert.ok(tarkistaAvain('', SALAISUUS, 1000).virhe);
  assert.ok(tarkistaAvain('v1.x.y', SALAISUUS, 1000).virhe);
});

test('lyhyt tai puuttuva salaisuus ei kelpaa', () => {
  const avain = luoAvain({ sheetId: ID, sarake: 1, voimassaAsti: 2000 }, 'lyhyt');
  assert.ok(tarkistaAvain(avain, 'lyhyt', 1000).virhe);
  assert.ok(tarkistaAvain(avain, undefined, 1000).virhe);
});

test('virheellinen sarake torjutaan', () => {
  for (const sarake of [0, 51, 1.5, '2']) {
    const avain = luoAvain({ sheetId: ID, sarake, voimassaAsti: 2000 }, SALAISUUS);
    assert.ok(tarkistaAvain(avain, SALAISUUS, 1000).virhe, String(sarake));
  }
});

// Sama kiinteä koodi on ScoringLibin testissä (tests/mobiilikirjaus.test.js): muoto pysyy samana molemmissa.
test('kiinteä koodi vastaa ScoringLibin tekemää', () => {
  const koodi = 'v1.eyJzIjoiMXJzX1p3Q2NsWVV4ckR1ZUJJYzY1TS00OVpBaDRYcHhTRkdPUE5xRVUzaVUiLCJjIjozLCJlIjoxODAwMDAwMDAwfQ.gzZrQLuOGGSenXbIBG1pDTvE0biEa-_nwsYFRWRKbwE';
  assert.equal(luoAvain({ sheetId: ID, sarake: 3, voimassaAsti: 1800000000 }, SALAISUUS), koodi);
  assert.deepEqual(tarkistaAvain(koodi, SALAISUUS, 1000), { sheetId: ID, sarake: 3, voimassaAsti: 1800000000 });
});
