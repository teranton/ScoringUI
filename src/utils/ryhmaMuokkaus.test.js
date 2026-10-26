import test from 'node:test';
import assert from 'node:assert/strict';

import {
  etsiOsallistujaAlue,
  kumoaSijoitukset,
  muodostaRyhmat,
  nimetTasmaavat,
  odotetutNimet,
  osallistujaAlueA1,
  parsiOsallistujat,
  ryhmaKokoAsetuksesta,
  ryhmanTayttoaste,
  siirtoPyynnot,
  sovellaPaikallisesti,
  suunnitteleSiirto
} from './ryhmaMuokkaus.js';

const teksti = (arvo) => ({ formattedValue: arvo, userEnteredValue: { stringValue: arvo } });
const luku = (arvo) => ({ formattedValue: String(arvo), userEnteredValue: { numberValue: arvo } });
const kaava = (arvo, kaavaTeksti) => ({ formattedValue: arvo, userEnteredValue: { formulaValue: kaavaTeksti } });
const taytetty = (arvo) => ({ formattedValue: arvo });

// Sama rakenne kuin kilpailutaulukoiden pääsivulla (Compak AM 2026): NRO ja TULOS ovat taulukkokaavoja,
// asemat 1..2, sen jälkeen tyhjä otsikko ja Ohjeita.
const otsikko = {
  values: [
    kaava('NRO', '={"NRO";SEQUENCE(COUNTA(C2:C))}'), teksti('ILMOITTAUTUNUT'), teksti('NIMI'), teksti('SARJA'), teksti('SEURA'),
    kaava('TULOS', '={"TULOS";BYROW(F2:G9;LAMBDA(x;SUBTOTAL(9;x)))}'), luku(1), luku(2), {}, teksti('Ohjeita')
  ]
};
const rivi = (nro, nimi, sarja, seura, tulokset = [], ohje) => ({
  values: [
    taytetty(String(nro)), teksti('OK'), teksti(nimi), teksti(sarja), teksti(seura), taytetty('0'),
    ...(tulokset.length ? tulokset.map(luku) : [{}, {}]), {}, ...(ohje ? [teksti(ohje)] : [])
  ]
});

const alue = { sheetId: 7, otsikko: 'OSALLISTUJAT+TULOKSET', otsikkoRivi: 0, alkuRivi: 1, loppuRivi: 9 };
const rowData = [
  otsikko,
  rivi(1, 'Mika Pöllänen', 'Y', 'KajA', [], 'Täytä nimet tähän'),
  rivi(2, 'Kenneth Asplund', 'Y', 'JSF'),
  rivi(3, 'Ilpo Mäläskä', 'Y60', 'OMAS'),
  rivi(4, 'Titta Pääkkönen', 'N', 'KajA', [23, 21]),
  rivi(5, 'Mikko Norrback', 'Y', 'JSF'),
  rivi(6, 'Pauli Moilanen', 'Y', 'KajA'),
  { values: [taytetty('7'), {}, teksti('7')] }, // paikka ilman ampujaa
  { values: [taytetty('8'), {}, kaava('', '=Ilmoittautuneet!C9')] }
];

test('alue löytyy nimetystä alueesta ja otsikkorivi on sen yläpuolella', () => {
  const meta = {
    namedRanges: [{ name: 'OSALLISTUJAT', range: { sheetId: 7, startRowIndex: 1, endRowIndex: 145, startColumnIndex: 0, endColumnIndex: 5 } }],
    sheets: [{ properties: { sheetId: 0, title: 'KISANSPEKSIT' } }, { properties: { sheetId: 7, title: "Osallistujat+Tulokset" } }]
  };
  const tulos = etsiOsallistujaAlue(meta);
  assert.deepEqual(tulos, { sheetId: 7, otsikko: 'Osallistujat+Tulokset', otsikkoRivi: 0, alkuRivi: 1, loppuRivi: 145 });
  assert.equal(osallistujaAlueA1({ ...tulos, otsikko: "Kisa's" }), "'Kisa''s'!1:145");
  assert.throws(() => etsiOsallistujaAlue({ namedRanges: [], sheets: [] }), /OSALLISTUJAT/);
});

const lue = (rivit = rowData) => parsiOsallistujat(rivit, alue);
const kuvaa = (sijoitukset) => sijoitukset.map(({ kohde, lahde }) => [kohde.rivi, lahde ? lahde.nimi : null]);
const pyyntoArvot = (pyynto) => pyynto.updateCells.rows[0].values.map((v) => {
  const arvo = v.userEnteredValue;
  return arvo ? (arvo.stringValue ?? arvo.numberValue) : null;
});

test('paikat, tyypit, tulokset ja ryhmät paikkajärjestyksessä', () => {
  const { sarakkeet, paikat, ampujat } = lue();
  assert.equal(sarakkeet.nimi, 2);
  assert.equal(sarakkeet.leveys, 8);
  assert.deepEqual(sarakkeet.tulokset, [6, 7]);
  assert.deepEqual(paikat.map((p) => p.tyyppi), ['ampuja', 'ampuja', 'ampuja', 'ampuja', 'ampuja', 'ampuja', 'vapaa', 'tyhja']);
  assert.deepEqual(ampujat.map((a) => a.nimi), ['Mika Pöllänen', 'Kenneth Asplund', 'Ilpo Mäläskä', 'Titta Pääkkönen', 'Mikko Norrback', 'Pauli Moilanen']);
  assert.equal(ampujat[3].onTuloksia, true);
  assert.equal(ampujat[0].onTuloksia, false);
  assert.deepEqual([paikat[1].nro, paikat[1].rivi, paikat[1].paikka], ['2', 2, 1]);
  assert.equal(paikat[7].nro, '8');

  const ryhmat = muodostaRyhmat(paikat, 5);
  assert.deepEqual(ryhmat.map((r) => [r.numero, r.koko, r.paikat.length, r.ampujia]), [[1, 5, 5, 5], [2, 5, 2, 1]]);
  assert.deepEqual(ryhmat.map(ryhmanTayttoaste), ['taysi', 'vajaa']);
  assert.equal(ryhmanTayttoaste({ ampujia: 4, koko: 5 }), 'lahes');
  assert.equal(ryhmanTayttoaste({ ampujia: 0, koko: 5 }), 'tyhja');
  assert.equal(ryhmaKokoAsetuksesta('group6'), 6);
  assert.equal(ryhmaKokoAsetuksesta('inline'), 5);
});

test('siirto vapaalle paikalle: ampuja siirtyy ja hänen paikkansa vapautuu numerolla', () => {
  const { sarakkeet, paikat } = lue();
  const suunnitelma = suunnitteleSiirto(paikat, 1, 7, 5);
  assert.equal(suunnitelma.toiminto, 'siirto');
  assert.deepEqual(kuvaa(suunnitelma.sijoitukset), [[7, 'Mika Pöllänen'], [1, null]]);

  const { ok, pyynnot } = siirtoPyynnot(alue.sheetId, suunnitelma.sijoitukset, sarakkeet);
  assert.equal(ok, true);
  // Sarakkeet B..E; NRO (A), TULOS (F) ja tyhjät asemat jäävät pois.
  assert.deepEqual(pyynnot.map((p) => p.updateCells.range), [
    { sheetId: 7, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 5 },
    { sheetId: 7, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 5 }
  ]);
  assert.deepEqual(pyyntoArvot(pyynnot[0]), ['OK', 'Mika Pöllänen', 'Y', 'KajA']);
  assert.deepEqual(pyyntoArvot(pyynnot[1]), [null, 1, null, null]);
  assert.equal(pyynnot[0].updateCells.fields, 'userEnteredValue');

  const uudet = sovellaPaikallisesti(paikat, suunnitelma.sijoitukset);
  assert.deepEqual([uudet[0].tyyppi, uudet[0].nimi, uudet[0].nro], ['vapaa', '1', '1']);
  assert.deepEqual([uudet[6].tyyppi, uudet[6].nimi, uudet[6].nro, uudet[6].rivi], ['ampuja', 'Mika Pöllänen', '7', 7]);
});

test('siirto tyhjälle riville täyttää väliin jäävät tyhjät rivit vapailla paikoilla', () => {
  const rivit = [otsikko, rivi(1, 'Mika Pöllänen', 'Y', 'KajA'), { values: [] }, { values: [] }];
  const { sarakkeet, paikat } = parsiOsallistujat(rivit, { ...alue, loppuRivi: 4 });
  const suunnitelma = suunnitteleSiirto(paikat, 1, 3, 5);
  assert.deepEqual(kuvaa(suunnitelma.sijoitukset), [[3, 'Mika Pöllänen'], [1, null], [2, null]]);
  const { pyynnot } = siirtoPyynnot(0, suunnitelma.sijoitukset, sarakkeet);
  assert.deepEqual(pyynnot.map(pyyntoArvot), [['OK', 'Mika Pöllänen', 'Y', 'KajA'], [null, 1, null, null], [2]]);
  assert.deepEqual(odotetutNimet(suunnitelma.sijoitukset), [{ rivi: 3, nimi: 'Mika Pöllänen' }, { rivi: 1, nimi: '1' }, { rivi: 2, nimi: '2' }]);
});

test('järjestys ryhmän sisällä siirtää väliin jäävät yhdellä', () => {
  const { paikat } = lue();
  const alas = suunnitteleSiirto(paikat, 1, 2, 5);
  assert.equal(alas.toiminto, 'jarjestys');
  assert.deepEqual(kuvaa(alas.sijoitukset), [[1, 'Kenneth Asplund'], [2, 'Mika Pöllänen']]);
  const ylos = suunnitteleSiirto(paikat, 3, 1, 5);
  assert.deepEqual(kuvaa(ylos.sijoitukset), [[1, 'Ilpo Mäläskä'], [2, 'Mika Pöllänen'], [3, 'Kenneth Asplund']]);
  // Välissä on ampuja, jolla on tuloksia.
  assert.deepEqual(suunnitteleSiirto(paikat, 1, 5, 5), { ok: false, syy: 'tuloksia' });
});

test('toisen ryhmän ampujan kanssa paikat vaihtuvat', () => {
  const { sarakkeet, paikat } = lue();
  const suunnitelma = suunnitteleSiirto(paikat, 1, 6, 5);
  assert.equal(suunnitelma.toiminto, 'vaihto');
  assert.deepEqual(kuvaa(suunnitelma.sijoitukset), [[6, 'Mika Pöllänen'], [1, 'Pauli Moilanen']]);
  const { pyynnot } = siirtoPyynnot(alue.sheetId, suunnitelma.sijoitukset, sarakkeet);
  assert.deepEqual(pyynnot.map(pyyntoArvot), [['OK', 'Mika Pöllänen', 'Y', 'KajA'], ['OK', 'Pauli Moilanen', 'Y', 'KajA']]);
});

test('siirto torjutaan, jos lähde ei ole ampuja, kohde on lukittu tai jommallakummalla on tuloksia', () => {
  const { paikat } = lue();
  assert.deepEqual(suunnitteleSiirto(paikat, 7, 1, 5), { ok: false, syy: 'muuttunut' });
  assert.deepEqual(suunnitteleSiirto(paikat, 1, 1, 5), { ok: false, syy: 'muuttunut' });
  assert.deepEqual(suunnitteleSiirto(paikat, 1, 99, 5), { ok: false, syy: 'muuttunut' });
  assert.deepEqual(suunnitteleSiirto(paikat, 4, 7, 5), { ok: false, syy: 'tuloksia' });
  assert.deepEqual(suunnitteleSiirto(paikat, 6, 4, 5), { ok: false, syy: 'tuloksia' });
});

test('kumoaminen palauttaa rivit ennalleen ja tarkistaa, ettei niitä ole muutettu välissä', () => {
  const { sarakkeet, paikat } = lue();
  const suunnitelma = suunnitteleSiirto(paikat, 1, 7, 5);
  const ennen = suunnitelma.sijoitukset.map((s) => s.kohde);
  const odotetut = odotetutNimet(suunnitelma.sijoitukset);
  const jalkeen = sovellaPaikallisesti(paikat, suunnitelma.sijoitukset);
  assert.equal(nimetTasmaavat(jalkeen, odotetut), true);
  assert.equal(nimetTasmaavat(paikat, odotetut), false);

  const kumous = kumoaSijoitukset(jalkeen, ennen);
  assert.deepEqual(kuvaa(kumous), [[7, '7'], [1, 'Mika Pöllänen']]);
  const { pyynnot } = siirtoPyynnot(alue.sheetId, kumous, sarakkeet);
  // Rivin 7 nimi palaa sellaisenaan (teksti "7"), ja Mikan rivi saa tietonsa takaisin.
  assert.deepEqual(pyynnot.map(pyyntoArvot), [[null, '7', null, null], ['OK', 'Mika Pöllänen', 'Y', 'KajA']]);
  assert.deepEqual(sovellaPaikallisesti(jalkeen, kumous).map((p) => p.nimi), paikat.map((p) => p.nimi));
});

test('Ryhmä-sarake ratkaisee ryhmän, ja avoin alue päättyy välilehden loppuun', () => {
  const otsikkoRyhma = { values: [...otsikko.values.slice(0, 8), kaava('Ryhmä', '={"Ryhmä";ARRAYFORMULA(ROUNDUP(SEQUENCE(8)/6))}')] };
  const rivit = [otsikkoRyhma, ...rowData.slice(1, 7).map((r, i) => ({ values: [...r.values.slice(0, 8), taytetty(String(Math.ceil((i + 1) / 6)))] }))];
  const { paikat } = parsiOsallistujat(rivit, { ...alue, loppuRivi: 7 });
  assert.deepEqual(muodostaRyhmat(paikat, 5).map((r) => [r.koko, r.ampujia]), [[6, 6]]);
  // Ryhmä-sarakkeen mukaan Mikko ja Pauli ovat samassa ryhmässä, joten siirto on järjestyksen muutos.
  assert.equal(suunnitteleSiirto(paikat, 5, 6, 5).toiminto, 'jarjestys');

  const meta = {
    namedRanges: [{ name: 'OSALLISTUJAT', range: { sheetId: 7, startRowIndex: 1 } }],
    sheets: [{ properties: { sheetId: 7, title: 'P', gridProperties: { rowCount: 200 } } }]
  };
  assert.equal(etsiOsallistujaAlue(meta).loppuRivi, 200);
});

test('kaavan täyttämä nimi on lukittu, ja kaava vastaan syötetty arvo torjuu siirron', () => {
  const rivit = [otsikko, { values: [taytetty('1'), teksti('OK'), taytetty('Kaava Nimi')] }, rivi(2, 'Kenneth Asplund', 'Y', 'JSF')];
  const { paikat } = parsiOsallistujat(rivit, { ...alue, loppuRivi: 3 });
  assert.deepEqual(paikat.map((p) => p.tyyppi), ['lukittu', 'ampuja']);
  assert.deepEqual(suunnitteleSiirto(paikat, 2, 1, 5), { ok: false, syy: 'lukittu' });
  assert.deepEqual(suunnitteleSiirto(paikat, 1, 2, 5), { ok: false, syy: 'lukittu' });
  assert.equal(muodostaRyhmat(paikat, 5)[0].ampujia, 2);

  const sarakkeet = { leveys: 5, nimi: 2 };
  const a = { rivi: 1, paikka: 0, nro: '1', nimi: 'A', solut: [taytetty('1'), teksti('OK'), teksti('A'), teksti('Y'), teksti('S')] };
  const b = { rivi: 2, paikka: 1, nro: '2', nimi: 'B', solut: [taytetty('2'), teksti('OK'), teksti('B'), teksti('Y'), kaava('S', '=VLOOKUP(C3;X;2)')] };
  assert.deepEqual(siirtoPyynnot(0, [{ kohde: b, lahde: a }, { kohde: a, lahde: b }], sarakkeet), { ok: false, syy: 'kaavoja' });
  // Vapaaksi jäävän rivin kaavaa ei kosketa.
  assert.deepEqual(siirtoPyynnot(0, [{ kohde: b, lahde: null }], sarakkeet).pyynnot.map(pyyntoArvot), [[null, 2, null]]);
});

test('tyhjä kaavarivi ei ole vapaa paikka, eikä sen yli voi täyttää', () => {
  const { paikat } = lue();
  // Fixturen rivi 8: nimen kaava antaa tyhjän.
  assert.equal(paikat[7].kaavaNimi, true);
  assert.deepEqual(muodostaRyhmat(paikat, 5)[1].paikat.map((p) => p.rivi), [6, 7]);
  assert.deepEqual(suunnitteleSiirto(paikat, 1, 8, 5), { ok: false, syy: 'lukittu' });
});

test('vapaan paikan numero luetaan syötteestä numeromuotoilusta riippumatta', () => {
  const rivit = [otsikko, { values: [taytetty('1'), {}, { formattedValue: '1,00', userEnteredValue: { numberValue: 1 } }] }, rivi(2, 'Kenneth Asplund', 'Y', 'JSF')];
  const { paikat } = parsiOsallistujat(rivit, { ...alue, loppuRivi: 3 });
  assert.deepEqual([paikat[0].tyyppi, paikat[0].nimi], ['vapaa', '1']);
  const suunnitelma = suunnitteleSiirto(paikat, 2, 1, 5);
  assert.equal(suunnitelma.toiminto, 'siirto');
  assert.equal(nimetTasmaavat(paikat, [{ rivi: 1, nimi: '1' }]), true);
});
