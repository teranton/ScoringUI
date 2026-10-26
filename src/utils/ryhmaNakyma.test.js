import test from 'node:test';
import assert from 'node:assert/strict';

import { KOROSTUSVARIT, korostusVarit, ryhmatAjoittain, sarjatPaikoista } from './ryhmaNakyma.js';

test('sarjat ja määrät ampujista, vapaat paikat pois', () => {
  const paikat = [
    { tyyppi: 'ampuja', sarja: 'Y' }, { tyyppi: 'ampuja', sarja: 'N' }, { tyyppi: 'lukittu', sarja: 'Y' },
    { tyyppi: 'vapaa', sarja: '' }, { tyyppi: 'ampuja', sarja: 'Y70' }, { tyyppi: 'ampuja', sarja: 'Y8' }
  ];
  assert.deepEqual(sarjatPaikoista(paikat), [
    { sarja: 'N', maara: 1 }, { sarja: 'Y', maara: 2 }, { sarja: 'Y8', maara: 1 }, { sarja: 'Y70', maara: 1 }
  ]);
});

test('korostusvärit valintajärjestyksessä ja kiertäen', () => {
  const varit = korostusVarit(['N', 'J']);
  assert.equal(varit.get('N'), KOROSTUSVARIT[0]);
  assert.equal(varit.get('J'), KOROSTUSVARIT[1]);
  const monta = korostusVarit(Array.from({ length: KOROSTUSVARIT.length + 1 }, (_, i) => `S${i}`));
  assert.equal(monta.get(`S${KOROSTUSVARIT.length}`), KOROSTUSVARIT[0]);
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
