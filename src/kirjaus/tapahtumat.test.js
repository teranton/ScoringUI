import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hairioRaja, hairiot, jasennaTapahtumat, kiekonKorostus, kiekonSelite, lisaa, normalisoi, onkoTapahtumat, poista,
  tapahtumaTeksti, vahennetty, vahennys, varoitukset, yhteenveto
} from './tapahtumat.js';

test('teksti menee ja tulee samana', () => {
  const lista = [{ t: 'H', i: 4 }, { t: 'N', i: 11 }, { t: 'V', i: 11, syy: 'Ase auki' }, { t: 'R', i: 19, n: 2, syy: 'Myöhästyi' }];
  const teksti = tapahtumaTeksti(lista);
  assert.equal(teksti, 'H5; N12; V12 Ase auki; R20x2 Myöhästyi');
  assert.deepEqual(jasennaTapahtumat(teksti), lista);
  assert.equal(tapahtumaTeksti([]), '');
  assert.equal(normalisoi(' h5 ;; v2  syy; tekstiä '), 'H5; V2 syy');
  // Syy ei voi rikkoa listaa.
  assert.equal(tapahtumaTeksti([{ t: 'V', i: 0, syy: 'a;b\nc' }]), 'V1 a b c');
  assert.equal(tapahtumaTeksti([{ t: 'R', i: 0, n: 1 }]), 'R1');
});

test('tarkistus', () => {
  assert.ok(onkoTapahtumat('', 25));
  assert.ok(onkoTapahtumat(undefined, 25));
  assert.ok(onkoTapahtumat('H1; R25x3 syy', 25));
  assert.ok(!onkoTapahtumat('H26', 25));
  assert.ok(!onkoTapahtumat('H0', 25));
  assert.ok(!onkoTapahtumat('X1', 25));
  assert.ok(!onkoTapahtumat(['H1'], 25));
});

test('laskurit, vähennys ja korostus', () => {
  const t = 'H1; N2; V3; R3x2; R10';
  assert.equal(hairiot(t), 2);
  assert.equal(varoitukset(t), 1);
  assert.equal(vahennys(t), 3);
  assert.equal(vahennys(t, 0, 5), 2);
  assert.equal(vahennys(t, 5, 10), 1);
  assert.equal(vahennetty(20, t), 17);
  assert.equal(vahennetty(1, t), 0);
  assert.equal(kiekonKorostus(t, 0), 'hairio');
  assert.equal(kiekonKorostus(t, 2), 'vahennys');
  assert.equal(kiekonKorostus(t, 5), null);
  assert.equal(kiekonSelite('V3 Ase auki; R3x2', 2), 'varoitus: Ase auki, vähennys 2');
  assert.equal(yhteenveto(t), 'HÄIRIÖT 2, VAROITUKSET 1, VÄHENNYS 3');
  assert.equal(yhteenveto(''), '');
});

test('lisäys, poisto ja raja', () => {
  assert.equal(lisaa('H1', { t: 'V', i: 4, syy: 'x' }), 'H1; V5 x');
  assert.equal(poista('H1; V1; R2', 0), 'R2');
  assert.equal(poista('H1; V1; R2', 0, ['V']), 'H1; R2');
  assert.equal(hairioRaja(''), 2);
  assert.equal(hairioRaja('3'), 3);
  assert.equal(hairioRaja('0'), 0);
  assert.equal(hairioRaja('kaksi'), 2);
  assert.equal(hairioRaja('12'), 2);
});
