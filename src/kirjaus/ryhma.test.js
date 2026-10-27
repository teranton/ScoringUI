import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aloitusAsema, aloitusLayout, asemanVali, hyvaksy, korttiAvain, kuittaa, lahettamattomat, layoutJarjestys, layoutinTila,
  merkitOf, merkitse, otaTaydennykset, peru, seuraavaAmpuja, seuraavaKohta, sovitaPituudet, yhdistaPalvelimelta
} from './ryhma.js';

const L1 = { nro: 1, nimi: 'Metsä', asemat: [{ sarake: 1, id: '1', kohteita: 2 }, { sarake: 2, id: '2', kohteita: 3 }], kohteita: 5 };
const L2 = { nro: 2, nimi: 'Järvi', asemat: [{ sarake: 3, id: '3', kohteita: 5 }], kohteita: 5, kierros: 0 };
const AMPUJAT = [{ nro: 4, nimi: 'Dahl D' }, { nro: 5, nimi: 'Fors F' }];
const tila = (kortit = {}) => ({ kortit, historia: [] });

test('asemien välit, järjestys ja aloitus', () => {
  assert.deepEqual(asemanVali(L1, 1), { alku: 2, loppu: 5 });
  assert.deepEqual(layoutJarjestys([{ ...L1, kierros: 1 }, L2, { nro: 3, kohteita: 1, asemat: [] }]).map((l) => l.nro), [2, 1, 3]);
  let t = tila();
  for (const nro of [4, 5]) for (let i = 0; i < 2; i++) t = merkitse(t, L1, { nro, i }, 'X', 10 + i);
  assert.equal(aloitusAsema(L1, AMPUJAT, t.kortit), 1);
  assert.equal(aloitusLayout([L1, L2], AMPUJAT, t.kortit).nro, 1);
});

test('kirjaus etenee ampuja kerrallaan aseman loppuun, valittu ampuja ensin', () => {
  let t = tila();
  assert.deepEqual(seuraavaKohta(L1, 0, AMPUJAT, t.kortit), { nro: 4, i: 0 });
  t = merkitse(t, L1, { nro: 4, i: 0 }, 'X', 1);
  t = merkitse(t, L1, { nro: 4, i: 1 }, 'O', 2);
  assert.deepEqual(seuraavaKohta(L1, 0, AMPUJAT, t.kortit), { nro: 5, i: 0 });
  assert.deepEqual(seuraavaKohta(L1, 1, AMPUJAT, t.kortit, 5), { nro: 5, i: 2 });
  assert.equal(seuraavaKohta(L1, 0, AMPUJAT, t.kortit, null, [5]), null, 'keskeyttänyt ohitetaan');
  assert.equal(seuraavaAmpuja(L1, 1, AMPUJAT, t.kortit, 4), 5);
  assert.equal(merkitOf(t.kortit, L1, 4), 'XO---');
  assert.equal(t.historia.length, 2);
});

test('peru palauttaa edellisen merkin; muutos poistaa hyväksynnän', () => {
  let t = tila();
  for (let i = 0; i < 5; i++) t = merkitse(t, L1, { nro: 4, i }, 'X', i + 1);
  const hyv = hyvaksy(t.kortit, L1, 4, 100);
  assert.equal(hyv[korttiAvain(1, 4)].hyvaksytty, 100);
  assert.equal(hyvaksy(t.kortit, L1, 5, 100), t.kortit, 'vajaata korttia ei hyväksytä');
  const p = peru({ kortit: hyv, historia: t.historia }, [L1]);
  assert.equal(merkitOf(p.kortit, L1, 4), 'XXXX-');
  assert.equal(p.kortit[korttiAvain(1, 4)].hyvaksytty, null);
  assert.deepEqual(p.kohta, { layout: 1, nro: 4, i: 4, ennen: '-' });
  assert.deepEqual(layoutinTila(L1, AMPUJAT, hyv), { valmiit: 1, hyvaksytyt: 1, ampujia: 2 });
});

test('lähetys, kuittaus, hylätty ja palvelimen kortit', () => {
  let t = tila();
  t = merkitse(t, L1, { nro: 4, i: 0 }, 'X', 50);
  t = merkitse(t, L2, { nro: 9, i: 0 }, 'O', 60);
  const lahetetyt = lahettamattomat(t.kortit);
  assert.deepEqual(lahetetyt, [{ layout: 1, nro: 4, merkit: 'X----', versio: 50 }, { layout: 2, nro: 9, merkit: 'O----', versio: 60 }]);
  const k = kuittaa(t.kortit, lahetetyt, { tallennetut: [{ layout: 1, nro: 4 }], hylatyt: [{ layout: 2, nro: 9, syy: 'ryhma' }],
    uudemmat: [{ layout: 2, nro: 5, merkit: 'XXXXX', versio: 70, hyvaksytty: true }] });
  assert.deepEqual(lahettamattomat(k), []);
  assert.equal(k[korttiAvain(2, 5)].hyvaksytty, true);
  // Avaus: taulukosta puuttuva lähetetty kortti lähetetään uudelleen.
  const avattu = yhdistaPalvelimelta(k, [{ layout: 2, nro: 5, merkit: 'XXXXX', versio: 70, hyvaksytty: true }], { kaikki: true });
  assert.deepEqual(lahettamattomat(avattu).map((x) => x.nro), [4]);
});

test('kiekkomäärän muutos ja korvatun puhelimen täydennykset', () => {
  let t = tila();
  t = merkitse(t, L1, { nro: 4, i: 0 }, 'X', 5);
  const lyhyt = { ...L1, kohteita: 4 };
  const sovitettu = sovitaPituudet(t.kortit, [lyhyt], 10);
  assert.equal(sovitettu[korttiAvain(1, 4)].merkit, 'X---');
  const tayd = otaTaydennykset(t.kortit, { '1:4': 'OOXXX', '1:5': 'XX---', '7:1': 'X' }, [L1], {}, 20);
  assert.equal(merkitOf(tayd.kortit, L1, 4), 'XOXXX', 'oma merkintä säilyy');
  assert.equal(merkitOf(tayd.kortit, L1, 5), 'XX---');
  assert.equal(tayd.taytetyt, 2);
  const uudelleen = otaTaydennykset(tayd.kortit, { '1:4': 'OOXXX' }, [L1], tayd.sovelletut, 30);
  assert.equal(uudelleen.taytetyt, 0);
});
