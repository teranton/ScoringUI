import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kuittaa, lahettamattomat, lueKoodi, merkitOf, merkitse, peru, taytetyt, yhdistaPalvelimelta } from './kortit.js';

const ryhma = [{ nro: 1 }, { nro: 2 }, { nro: 3 }];

// Testin oma vuorojärjestys: kesken aseman oleva ensin, muuten vähiten ampunut (linjan vuorot: linja.test.js).
function seuraavaKohta(ampujat, kortit) {
  const tilat = ampujat.map(({ nro }) => ({ nro, merkit: merkitOf(kortit, nro) }))
    .map((a) => ({ ...a, n: taytetyt(a.merkit) }))
    .filter((a) => a.n < 25);
  if (tilat.length === 0) return null;
  const valittu = tilat.find((a) => a.n % 5 !== 0) || tilat.reduce((pienin, a) => (a.n < pienin.n ? a : pienin));
  return { nro: valittu.nro, i: valittu.merkit.indexOf('-') };
}

function ammu(tila, kerrat, merkki = 'X') {
  let t = tila;
  for (let k = 0; k < kerrat; k++) t = merkitse(t, seuraavaKohta(ryhma, t.kortit), merkki, 1000 + k);
  return t;
}

test('peru palauttaa edellisen merkin ja versio kasvaa', () => {
  let t = ammu({ kortit: {}, historia: [] }, 2, 'O');
  const ennen = t.kortit[1].versio;
  const p = peru(t, 0);
  assert.equal(p.kortit[1].merkit.slice(0, 2), 'O-');
  assert.ok(p.kortit[1].versio > ennen);
  assert.deepEqual(p.kohta, { nro: 1, i: 1 });
  assert.equal(p.historia.length, 1);
  assert.equal(peru({ kortit: {}, historia: [] }), null);
  t = merkitse(t, { nro: 1, i: 0 }, 'O');
  assert.equal(t.historia.length, 2, 'sama merkki ei muuta mitään');
});

test('synkronointi: kuittaus, uudempi palvelimelta, lähettämättömät', () => {
  let kortit = ammu({ kortit: {}, historia: [] }, 6).kortit;
  const lahetetyt = lahettamattomat(kortit);
  assert.deepEqual(lahetetyt.map((k) => k.nro), [1, 2]);
  kortit = merkitse({ kortit, historia: [] }, { nro: 2, i: 1 }, 'O', 5000).kortit;
  kortit = kuittaa(kortit, lahetetyt, { tallennetut: [1, 2], uudemmat: [{ nro: 9, merkit: 'X'.repeat(25), versio: 3 }] });
  assert.equal(kortit[1].lahetetty, true);
  assert.equal(kortit[2].lahetetty, false, 'muutettu lähetyksen aikana');
  assert.equal(kortit[9].lahetetty, true);
  const vanhempi = yhdistaPalvelimelta(kortit, [{ nro: 2, merkit: 'O'.repeat(25), versio: 1 }]);
  assert.equal(vanhempi[2].merkit, kortit[2].merkit);
});

test('koodin luku', () => {
  const payload = Buffer.from(JSON.stringify({ s: 'abc', c: 2, e: 9 })).toString('base64url');
  assert.deepEqual(lueKoodi(`v1.${payload}.sig`), { sheetId: 'abc', sarake: 2, voimassaAsti: 9 });
  assert.equal(lueKoodi('roskaa'), null);
});
