import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merkitse } from './kortit.js';
import { jasennaOhjelma, laskeVuorot, linjanTilanne, ohjelmaTekstiksi, radanLinjajono, tulevatAmpujat } from './linja.js';

const SSSD = [1, 1, 1, 2];
const SDD = [1, 2, 2];

test('ohjelma luetaan tekstistä: sama kaikilla asemilla, yksittäiset ennen tuplia', () => {
  assert.deepEqual(jasennaOhjelma('SSSD'), SSSD);
  assert.deepEqual(jasennaOhjelma(' s s s d '), SSSD);
  assert.deepEqual(jasennaOhjelma('S+D+D'), SDD);
  assert.deepEqual(jasennaOhjelma('YTT'), SDD);
  assert.deepEqual(jasennaOhjelma('S S S S S'), [1, 1, 1, 1, 1]);
  assert.equal(jasennaOhjelma('DSSS'), null);
  assert.equal(jasennaOhjelma('SSD'), null);
  assert.equal(jasennaOhjelma('SSSD | SDD'), null);
  assert.equal(jasennaOhjelma(''), null);
  assert.equal(ohjelmaTekstiksi(SDD), 'SDD');
});

const ohjelma = SSSD;
const jono = [{ nro: 1 }, { nro: 2 }, { nro: 3 }];

test('ensimmäinen ampuu aseman yksin, sitten vuorotellen asemajärjestyksessä', () => {
  const v = laskeVuorot(jono, ohjelma);
  const kierros = (k) => v.filter((x) => x.kierros === k).map((x) => `${x.nro}@${x.asema + 1}:${x.loppu - x.alku}`);
  assert.deepEqual(kierros(0), ['1@1:1', '1@1:1', '1@1:1', '1@1:2']);
  assert.deepEqual(kierros(1), ['2@1:1', '1@2:1', '2@1:1', '1@2:1', '2@1:1', '1@2:1', '2@1:2', '1@2:2']);
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
  const v = laskeVuorot([{ nro: 1 }, { nro: 2 }, { nro: 3, taukoEnnen: true }], ohjelma);
  const kolmasAlkaa = v.find((x) => x.nro === 3).kierros;
  assert.ok(v.filter((x) => x.kierros >= kolmasAlkaa).every((x) => x.nro === 3));
  assert.ok(v.filter((x) => x.kierros < kolmasAlkaa).every((x) => x.nro !== 3));
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
  ammu(6); // vuorotellen kolme yksittäistä
  tilanne = linjanTilanne(v, t.kortit);
  assert.deepEqual(tilanne.kohta, { nro: 2, i: 3 });
  assert.equal(tilanne.vuoro.loppu - tilanne.vuoro.alku, 2);
  ammu(1);
  assert.deepEqual(linjanTilanne(v, t.kortit).kohta, { nro: 2, i: 4 });
  ammu(1);
  assert.deepEqual(linjanTilanne(v, t.kortit).kohta, { nro: 1, i: 8 });
  ammu(75 - 13);
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

test('keskeyttäneen vuorot ohitetaan, linjan paikat eivät muutu', () => {
  const v = laskeVuorot(jono, ohjelma);
  let t = { kortit: {}, historia: [] };
  for (let k = 0; k < 8; k++) t = merkitse(t, linjanTilanne(v, t.kortit).kohta, 'X', 1000 + k);
  assert.equal(linjanTilanne(v, t.kortit).kohta.nro, 1);
  const tilanne = linjanTilanne(v, t.kortit, [1]);
  assert.deepEqual(tilanne.kohta, { nro: 2, i: 2 });
  assert.deepEqual(tilanne.linja, [{ nro: 2, asema: 0 }, { nro: 1, asema: 1 }]);
});

test('lisätty tulee linjaan aikaisintaan annetulla kierroksella', () => {
  // 1 ja 2 linjalla, tauko ennen 3:a; kierroksella 3 lisätään 9 ampujan 2 perään.
  const pohja = [{ nro: 1 }, { nro: 2 }, { nro: 3, taukoEnnen: true }];
  const j = radanLinjajono(pohja, { lisatyt: [{ nro: 9, jalkeen: 2, kierroksesta: 4 }] });
  const v = laskeVuorot(j, ohjelma);
  assert.equal(v.find((x) => x.nro === 9).kierros, 4);
  assert.deepEqual(v.filter((x) => x.kierros < 4).map((x) => x.nro).filter((n) => n === 9), []);
});

test('ohitetun tai siirretyn aikataulutauko siirtyy seuraavalle', () => {
  const pohja = [{ nro: 1 }, { nro: 2, taukoEnnen: true }, { nro: 3 }];
  assert.equal(radanLinjajono(pohja, { ohitetut: [2] })[1].taukoEnnen, true);
  const siirretty = radanLinjajono(pohja, { lisatyt: [{ nro: 2, jalkeen: 3 }] });
  assert.deepEqual(siirretty.map((a) => [a.nro, Boolean(a.taukoEnnen)]), [[1, false], [3, true], [2, false]]);
});

test('lisätty, jonka ankkuri lisätään myöhemmin, löytää paikkansa', () => {
  const pohja = [{ nro: 1 }, { nro: 2 }];
  const j = radanLinjajono(pohja, { lisatyt: [{ nro: 41, jalkeen: 40 }, { nro: 40, jalkeen: 1 }] });
  assert.deepEqual(j.map((a) => a.nro), [1, 40, 41, 2]);
});
