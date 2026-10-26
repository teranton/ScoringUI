import test from 'node:test';
import assert from 'node:assert/strict';

import { KOROSTUSVARIT, korostusVarit, ryhmatAjoittain, sarjatPaikoista, tallennetutKorostukset, vaihdaKorostus } from './ryhmaNakyma.js';

test('sarjat ja määrät ampujista, vapaat paikat pois', () => {
  const paikat = [
    { tyyppi: 'ampuja', sarja: 'Y' }, { tyyppi: 'ampuja', sarja: 'N' }, { tyyppi: 'lukittu', sarja: 'Y' },
    { tyyppi: 'vapaa', sarja: '' }, { tyyppi: 'ampuja', sarja: 'Y70' }, { tyyppi: 'ampuja', sarja: 'Y8' }
  ];
  assert.deepEqual(sarjatPaikoista(paikat), [
    { sarja: 'N', maara: 1 }, { sarja: 'Y', maara: 2 }, { sarja: 'Y8', maara: 1 }, { sarja: 'Y70', maara: 1 }
  ]);
});

test('korostettu sarja pitää värinsä, kun muita poistetaan', () => {
  let valitut = ['N', 'J', 'S'].reduce(vaihdaKorostus, []);
  valitut = vaihdaKorostus(valitut, 'N');
  const varit = korostusVarit(valitut);
  assert.equal(varit.get('J'), KOROSTUSVARIT[1]);
  assert.equal(varit.get('S'), KOROSTUSVARIT[2]);
  assert.equal(korostusVarit(vaihdaKorostus(valitut, 'Y')).get('Y'), KOROSTUSVARIT[0]);
});

test('värien loputtua uutta sarjaa ei korosteta', () => {
  const taynna = Array.from({ length: KOROSTUSVARIT.length }, (_, i) => `S${i}`).reduce(vaihdaKorostus, []);
  assert.equal(vaihdaKorostus(taynna, 'X'), taynna);
});

test('tallennetut korostukset tarkistetaan', () => {
  assert.deepEqual(tallennetutKorostukset(['N']), []);
  assert.deepEqual(tallennetutKorostukset('N'), []);
  assert.deepEqual(
    tallennetutKorostukset([{ sarja: 'N', vari: 1 }, { sarja: 'J', vari: 1 }, { sarja: 'S', vari: 99 }, { sarja: 'N', vari: 2 }, { sarja: 'Y', vari: 0 }]),
    [{ sarja: 'N', vari: 1 }, { sarja: 'Y', vari: 0 }]
  );
});

test('samaan aikaan lähtevät ryhmät rinnakkain, ilman aikaa viimeisenä', () => {
  const ajat = {
    1: [{ avain: 'la', aika: '9:00' }, { avain: 'su', aika: '10:00' }],
    2: [{ avain: 'la', aika: '9:00' }, { avain: 'su', aika: '9:00' }],
    3: [{ avain: 'la', aika: '10:30' }],
    4: []
  };
  const ryhmat = [1, 2, 3, 4].map((numero) => ({ numero }));
  const la = ryhmatAjoittain(ryhmat, (r) => ajat[r.numero], 'la');
  assert.deepEqual(la.map((s) => [s.aika, s.ryhmat.map((r) => r.numero)]), [['9:00', [1, 2]], ['10:30', [3]], ['', [4]]]);
  const su = ryhmatAjoittain(ryhmat, (r) => ajat[r.numero], 'su');
  assert.deepEqual(su.map((s) => [s.aika, s.ryhmat.map((r) => r.numero)]), [['9:00', [2]], ['10:00', [1]], ['', [3, 4]]]);
});

test('sama kellonaika eri kirjoitusasuissa on yksi lähtö', () => {
  const ajat = { 1: [{ avain: 'la', aika: '9:00' }], 2: [{ avain: 'la', aika: '09:00' }], 3: [{ avain: 'la', aika: '9.00' }] };
  const la = ryhmatAjoittain([1, 2, 3].map((numero) => ({ numero })), (r) => ajat[r.numero], 'la');
  assert.deepEqual(la.map((s) => [s.aika, s.ryhmat.map((r) => r.numero)]), [['9:00', [1, 2, 3]]]);
});
