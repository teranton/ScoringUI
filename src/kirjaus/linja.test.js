import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merkitse } from './kortit.js';
import { jasennaOhjelma, laskeVuorot, linjanTilanne, ohjelmaTekstiksi, radanLinjajono, tulevatAmpujat } from './linja.js';

const SSSD = [1, 1, 1, 2];
const SDD = [1, 2, 2];

test('ohjelma luetaan tekstistä', () => {
  assert.deepEqual(jasennaOhjelma('SSSD | SDD | SSSD | SDD | SSSSS'), [SSSD, SDD, SSSD, SDD, [1, 1, 1, 1, 1]]);
  assert.deepEqual(jasennaOhjelma('sssd sdd sssd sdd sdd'), [SSSD, SDD, SSSD, SDD, SDD]);
  assert.deepEqual(jasennaOhjelma('S+D+D'), [SDD, SDD, SDD, SDD, SDD]);
  assert.deepEqual(jasennaOhjelma('YYYT/YTT/YYYT/YTT/YTT'), [SSSD, SDD, SSSD, SDD, SDD]);
  assert.equal(jasennaOhjelma('SSD | SDD'), null);
  assert.equal(jasennaOhjelma('SSSS'), null);
  assert.equal(jasennaOhjelma(''), null);
  assert.equal(ohjelmaTekstiksi([SSSD, SDD, SSSD, SDD, SDD]), 'SSSD | SDD | SSSD | SDD | SDD');
});

const ohjelma = [SSSD, SDD, SSSD, SDD, SDD];
const jono = [{ nro: 1 }, { nro: 2 }, { nro: 3 }];

test('ensimmäinen ampuu aseman yksin, sitten vuorotellen asemajärjestyksessä', () => {
  const v = laskeVuorot(jono, ohjelma);
  const kierros = (k) => v.filter((x) => x.kierros === k).map((x) => `${x.nro}@${x.asema + 1}:${x.loppu - x.alku}`);
  assert.deepEqual(kierros(0), ['1@1:1', '1@1:1', '1@1:1', '1@1:2']);
  assert.deepEqual(kierros(1), ['2@1:1', '1@2:1', '2@1:1', '1@2:2', '2@1:1', '1@2:2', '2@1:2']);
  // Jono loppuu: asema 1 jää tyhjäksi ja linja tyhjenee.
  assert.deepEqual([...new Set(v.filter((x) => x.kierros === 3).map((x) => x.asema))], [1, 2, 3]);
  assert.equal(Math.max(...v.map((x) => x.kierros)), 6);
  // Jokainen ampuu kaikki 25 kiekkoa kerran.
  for (const { nro } of jono) {
    const kohteet = v.filter((x) => x.nro === nro).flatMap((x) => Array.from({ length: x.loppu - x.alku }, (_, i) => x.alku + i));
    assert.deepEqual(kohteet.sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
  }
});

test('linjalla on enintään viisi ampujaa', () => {
  const pitka = Array.from({ length: 12 }, (_, i) => ({ nro: i + 1 }));
  const v = laskeVuorot(pitka, ohjelma);
  const kierrokset = new Map();
  v.forEach((x) => kierrokset.set(x.kierros, new Set([...(kierrokset.get(x.kierros) || []), x.nro])));
  assert.equal(Math.max(...[...kierrokset.values()].map((s) => s.size)), 5);
});

test('tauko tyhjentää linjan ennen seuraavaa ampujaa', () => {
  const v = laskeVuorot(jono, ohjelma, [3]);
  const kolmasAlkaa = v.find((x) => x.nro === 3).kierros;
  assert.ok(v.filter((x) => x.kierros >= kolmasAlkaa).every((x) => x.nro === 3));
  const aikataulusta = laskeVuorot([{ nro: 1 }, { nro: 2 }, { nro: 3, taukoEnnen: true }], ohjelma);
  assert.deepEqual(aikataulusta, v);
});

test('tilanne seuraa merkintöjä: tuplassa kaksi kiekkoa samalle ampujalle', () => {
  const v = laskeVuorot(jono, ohjelma);
  let t = { kortit: {}, historia: [] };
  const ammu = (n) => {
    for (let k = 0; k < n; k++) t = merkitse(t, linjanTilanne(v, t.kortit).kohta, 'X', 1000 + k);
  };
  assert.deepEqual(linjanTilanne(v, t.kortit).kohta, { nro: 1, i: 0 });
  ammu(5);
  let tilanne = linjanTilanne(v, t.kortit);
  assert.deepEqual(tilanne.kohta, { nro: 2, i: 0 });
  assert.deepEqual(tilanne.linja, [{ nro: 2, asema: 0 }, { nro: 1, asema: 1 }]);
  assert.deepEqual(tulevatAmpujat(jono, v, tilanne.vuoro.kierros).map((a) => a.nro), [3]);
  ammu(2); // 2: S, 1: S
  ammu(1); // 2: S
  tilanne = linjanTilanne(v, t.kortit);
  assert.deepEqual(tilanne.kohta, { nro: 1, i: 6 });
  assert.equal(tilanne.vuoro.loppu - tilanne.vuoro.alku, 2);
  ammu(1);
  assert.deepEqual(linjanTilanne(v, t.kortit).kohta, { nro: 1, i: 7 });
  ammu(75 - 9);
  assert.equal(linjanTilanne(v, t.kortit), null);
});

test('lisätyt ja ohitetut ampujat', () => {
  const pohja = [{ nro: 1 }, { nro: 2 }, { nro: 3 }, { nro: 4 }];
  const nrot = (j) => j.map((a) => a.nro);
  assert.deepEqual(nrot(radanLinjajono(pohja, { ohitetut: [2] })), [1, 3, 4]);
  assert.deepEqual(nrot(radanLinjajono(pohja, { lisatyt: [{ nro: 9, jalkeen: 1 }, { nro: 8, jalkeen: 1 }] })), [1, 9, 8, 2, 3, 4]);
  assert.deepEqual(nrot(radanLinjajono(pohja, { lisatyt: [{ nro: 9 }, { nro: 7, jalkeen: null }] })), [7, 1, 2, 3, 4, 9]);
  // Ohitettu palaa myöhemmin: siirtyy uuteen paikkaan.
  const siirretty = radanLinjajono([...pohja.slice(0, 1), { nro: 2, nimi: 'Berg' }, ...pohja.slice(2)], { lisatyt: [{ nro: 2, jalkeen: 3 }] });
  assert.deepEqual(nrot(siirretty), [1, 3, 2, 4]);
  assert.equal(siirretty[2].nimi, 'Berg');
});
