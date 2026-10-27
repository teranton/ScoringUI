import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aloitusAsema, aloitusLayout, asemaJarjestys, asemaKiekolle, asemanSiirto, asemanVali, hyvaksy, kohdanOsa, pisteet, pisteKiekolle, seuraavaAsema, kierrata, korttiAvain, kuittaa, lahettamattomat,
  layoutHyvaksytty, layoutJarjestys, layoutinTila, merkitOf, merkitse, otaTaydennykset, peru, seuraavaAmpuja, seuraavaKohta, sovitaPituudet, yhdistaPalvelimelta
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

test('asemalähtö: puhelin avautuu lähtöasemalta, järjestys kiertää ja aloittaja siirtyy siitä lukien', () => {
  const L3 = {
    nro: 3, nimi: 'Pelto', kohteita: 6, kierros: 1, alkuasema: '3',
    asemat: [1, 2, 3].map((k) => ({ sarake: k, id: String(k), kohteita: 2 }))
  };
  assert.deepEqual(asemaJarjestys(L3), [2, 0, 1]);
  assert.deepEqual(asemaJarjestys({ ...L3, alkuasema: '9' }), [0, 1, 2], 'tuntematon lähtöasema: alusta');
  assert.deepEqual([2, 0, 1].map((a) => asemanSiirto(L3, a)), [1, 2, 3]);
  let t = tila();
  assert.equal(aloitusAsema(L3, AMPUJAT, t.kortit), 2);
  for (const nro of [4, 5]) for (const i of [4, 5]) t = merkitse(t, L3, { nro, i }, 'X', 1);
  assert.equal(aloitusAsema(L3, AMPUJAT, t.kortit), 0);
  assert.equal(seuraavaAsema(L3, 2, AMPUJAT, t.kortit), 0);
  for (const nro of [4, 5]) for (const i of [0, 1, 2, 3]) t = merkitse(t, L3, { nro, i }, 'X', 2);
  assert.equal(seuraavaAsema(L3, 1, AMPUJAT, t.kortit), null);
  assert.equal(aloitusAsema(L3, AMPUJAT, t.kortit), 1, 'valmis layout: viimeinen ammuttu asema');
});

test('FITASC: ohjelman pisteet asemina, sinkut ensin ja tuplissa järjestys siirtyy yhdellä', () => {
  const F = {
    nro: 1, nimi: 'A', kohteita: 11, kierros: 0,
    asemat: [{ sarake: 1, id: '1', kohteita: 11 }],
    ohjelma: [{ sinkut: 2, tuplat: 1 }, { sinkut: 1, tuplat: 2 }, { sinkut: 0, tuplat: 1 }]
  };
  assert.deepEqual(pisteet(F).map((p) => [p.id, p.alku, p.loppu, p.osat.map((o) => `${o.nimi}${o.alku}-${o.loppu}/${o.siirto}`)]), [
    ['1', 0, 4, ['sinkut0-2/0', 'tuplat2-4/1']],
    ['2', 4, 9, ['sinkut4-5/0', 'tuplat5-9/1']],
    ['3', 9, 11, ['tuplat9-11/0']]
  ]);
  assert.equal(pisteet({ ...F, kohteita: 12 }).length, 1, 'kiekot eivät täsmää: taulukon asema');
  assert.deepEqual([0, 3, 4, 10].map((i) => pisteKiekolle(F, i)), [0, 0, 1, 2]);
  assert.equal(kohdanOsa(F, 0, 3).nimi, 'tuplat');
  const kolme = [{ nro: 1 }, { nro: 2 }, { nro: 3 }];
  let t = tila();
  // Sinkut: 1, 2, 3 kukin omansa loppuun.
  const ammu = (odotettu) => {
    const k = seuraavaKohta(F, 0, kolme, t.kortit);
    assert.equal(k.nro, odotettu);
    t = merkitse(t, F, k, 'X', 1);
  };
  for (const nro of [1, 1, 2, 2, 3, 3]) ammu(nro);
  // Tuplat: 2, 3, 1.
  for (const nro of [2, 2, 3, 3, 1, 1]) ammu(nro);
  assert.equal(seuraavaKohta(F, 0, kolme, t.kortit), null);
  // Seuraava piste: aloittaja siirtyy yhdellä (asemanSiirto), sinkut 2, 3, 1.
  const vuoro = kierrata(kolme, asemanSiirto(F, 1));
  assert.equal(seuraavaKohta(F, 1, vuoro, t.kortit).nro, 2);
  assert.equal(seuraavaAmpuja(F, 1, vuoro, t.kortit, 2), 3);
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
  const sovitettu = sovitaPituudet(t.kortit, [lyhyt], [], 10);
  assert.equal(sovitettu[korttiAvain(1, 4)].merkit, 'X---');
  const tayd = otaTaydennykset(t.kortit, { '1:4': 'OOXXX', '1:5': 'XX---', '7:1': 'X' }, [L1], {}, 20);
  assert.equal(merkitOf(tayd.kortit, L1, 4), 'XOXXX', 'oma merkintä säilyy');
  assert.equal(merkitOf(tayd.kortit, L1, 5), 'XX---');
  assert.equal(tayd.taytetyt, 2);
  const uudelleen = otaTaydennykset(tayd.kortit, { '1:4': 'OOXXX' }, [L1], tayd.sovelletut, 30);
  assert.equal(uudelleen.taytetyt, 0);
});

test('kierrätys, kiekon asema ja keskeyttäneet layoutin hyväksynnässä', () => {
  const kolme = [{ nro: 1 }, { nro: 2 }, { nro: 3 }];
  assert.deepEqual(kierrata(kolme, 0).map((a) => a.nro), [1, 2, 3]);
  assert.deepEqual(kierrata(kolme, 1).map((a) => a.nro), [2, 3, 1]);
  assert.deepEqual(kierrata(kolme, 4).map((a) => a.nro), [2, 3, 1]);
  assert.deepEqual(kierrata(kolme, undefined).map((a) => a.nro), [1, 2, 3]);
  assert.deepEqual([0, 1, 2, 4].map((i) => asemaKiekolle(L1, i)), [0, 0, 1, 1]);

  // Ampuja 5 keskeytti: layout on hyväksytty, kun ampuja 4 hyväksyy.
  let t = tila();
  for (let i = 0; i < 5; i++) t = merkitse(t, L1, { nro: 4, i }, 'X', 10);
  const kortit = hyvaksy(t.kortit, L1, 4, Date.UTC(2026, 0, 1));
  assert.equal(layoutHyvaksytty(L1, AMPUJAT, kortit), false);
  assert.equal(layoutHyvaksytty(L1, AMPUJAT, kortit, [5]), true);
  assert.deepEqual(layoutinTila(L1, AMPUJAT, kortit, [5]), { valmiit: 1, hyvaksytyt: 1, ampujia: 1 });
  assert.equal(aloitusLayout([L1, L2], AMPUJAT, kortit, [5]).nro, 2);
});

test('asemajako: lähtee kortin mukana, muutos sovitetaan asema kerrallaan, poistettu layout hylätään', () => {
  let t = tila();
  'XOXXO'.split('').forEach((m, i) => { t = merkitse(t, L1, { nro: 4, i }, m, 10 + i); });
  assert.equal(lahettamattomat(t.kortit, 60, [L1])[0].jako, '2,3');
  assert.equal(lahettamattomat(t.kortit)[0].jako, undefined);

  // Kiekko siirtyy asemalta 2 asemalle 1 (2,3 → 3,2): aseman 1 merkinnät pysyvät asemalla 1.
  const uusi = { ...L1, asemat: [{ sarake: 1, id: '1', kohteita: 3 }, { sarake: 2, id: '2', kohteita: 2 }] };
  const sovitettu = sovitaPituudet(t.kortit, [uusi], [L1], 100);
  assert.equal(sovitettu[korttiAvain(1, 4)].merkit, 'XO-XX');
  assert.equal(sovitettu[korttiAvain(1, 4)].lahetetty, false);
  assert.equal(sovitaPituudet(sovitettu, [uusi], [uusi], 200), sovitettu, 'sama jako: ei muutosta');

  const lahetetyt = lahettamattomat(t.kortit);
  const kuitattu = kuittaa(t.kortit, lahetetyt, { hylatyt: [{ layout: 1, nro: 4, syy: 'layout' }] });
  assert.equal(kuitattu[korttiAvain(1, 4)].hylatty, true);
  assert.deepEqual(lahettamattomat(kuitattu), []);
});
