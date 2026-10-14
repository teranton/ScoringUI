import test from 'node:test';
import assert from 'node:assert/strict';

import {
  etsiOsallistujaAlue,
  muodostaRyhmat,
  osallistujaAlueA1,
  parsiOsallistujat,
  ryhmaKokoAsetuksesta,
  tarkistaVaihto,
  vaihdaPaikallisesti,
  vaihtoPyynnot
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

test('ampujat, tulokset ja ryhmät paikkajärjestyksessä', () => {
  const { sarakkeet, ampujat } = parsiOsallistujat(rowData, alue);
  assert.equal(sarakkeet.nimi, 2);
  assert.equal(sarakkeet.leveys, 8);
  assert.deepEqual(sarakkeet.tulokset, [6, 7]);
  assert.deepEqual(ampujat.map((a) => a.nimi), ['Mika Pöllänen', 'Kenneth Asplund', 'Ilpo Mäläskä', 'Titta Pääkkönen', 'Mikko Norrback', 'Pauli Moilanen']);
  assert.equal(ampujat[3].onTuloksia, true);
  assert.equal(ampujat[0].onTuloksia, false);
  assert.equal(ampujat[1].nro, '2');
  assert.equal(ampujat[1].rivi, 2);

  const ryhmat = muodostaRyhmat(ampujat, 5);
  assert.deepEqual(ryhmat.map((r) => [r.numero, r.ampujat.length]), [[1, 5], [2, 1]]);
  assert.equal(ryhmaKokoAsetuksesta('group6'), 6);
  assert.equal(ryhmaKokoAsetuksesta('inline'), 5);
});

test('vaihto siirtää syötetyt solut mutta ei kaavoja, kaavojen täyttämiä soluja eikä Ohjeita-saraketta', () => {
  const { sarakkeet, ampujat } = parsiOsallistujat(rowData, alue);
  const [mika, kenneth] = ampujat;
  const pyynnot = vaihtoPyynnot(alue.sheetId, mika, kenneth, sarakkeet.leveys);
  // Sarakkeet B..E yhtenä alueena kumpaankin suuntaan; NRO (A), TULOS (F) ja tyhjät asemat jäävät pois.
  assert.equal(pyynnot.length, 2);
  const [mikanRivi, kennethinRivi] = pyynnot.map((p) => p.updateCells);
  assert.deepEqual(mikanRivi.range, { sheetId: 7, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 5 });
  assert.deepEqual(mikanRivi.rows[0].values.map((v) => v.userEnteredValue.stringValue), ['OK', 'Kenneth Asplund', 'Y', 'JSF']);
  assert.deepEqual(kennethinRivi.rows[0].values.map((v) => v.userEnteredValue.stringValue), ['OK', 'Mika Pöllänen', 'Y', 'KajA']);
  assert.equal(mikanRivi.fields, 'userEnteredValue');
});

test('toisen rivin tyhjä solu siirtyy tyhjänä', () => {
  const a = { rivi: 1, solut: [taytetty('1'), teksti('OK'), teksti('A')] };
  const b = { rivi: 2, solut: [taytetty('2'), {}, teksti('B')] };
  const [aanRivi, bnRivi] = vaihtoPyynnot(0, a, b, 3).map((p) => p.updateCells);
  assert.deepEqual(aanRivi.rows[0].values, [{}, { userEnteredValue: { stringValue: 'B' } }]);
  assert.deepEqual(bnRivi.rows[0].values, [{ userEnteredValue: { stringValue: 'OK' } }, { userEnteredValue: { stringValue: 'A' } }]);
});

test('vaihto torjutaan, jos taulukko on muuttunut tai ampujalla on tuloksia', () => {
  const { ampujat } = parsiOsallistujat(rowData, alue);
  const [mika, kenneth, , titta] = ampujat;
  assert.equal(tarkistaVaihto(ampujat, mika, kenneth).ok, true);
  assert.deepEqual(tarkistaVaihto(ampujat, mika, titta), { ok: false, syy: 'tuloksia' });
  assert.deepEqual(tarkistaVaihto(ampujat, { ...mika, nimi: 'Joku muu' }, kenneth), { ok: false, syy: 'muuttunut' });
  assert.deepEqual(tarkistaVaihto(ampujat, mika, mika), { ok: false, syy: 'muuttunut' });
});

test('paikallinen vaihto vaihtaa ampujat ja pitää paikkojen numerot', () => {
  const { ampujat } = parsiOsallistujat(rowData, alue);
  const uusi = vaihdaPaikallisesti(ampujat, ampujat[0], ampujat[4]);
  assert.equal(uusi[0].nimi, 'Mikko Norrback');
  assert.equal(uusi[0].nro, '1');
  assert.equal(uusi[0].rivi, 1);
  assert.equal(uusi[4].nimi, 'Mika Pöllänen');
  assert.equal(uusi[4].nro, '5');
});
