import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hairioRaja, hairiot, hairiotAsemittain, jasennaTapahtumat, kiekonKorostus, kiekonSelite, lisaa, normalisoi, onkoTapahtumat, poista,
  tapahtumaTeksti, varoitukset, yhteenveto
} from './tapahtumat.js';

test('teksti menee ja tulee samana', () => {
  const lista = [{ t: 'H', i: 4 }, { t: 'N', i: 11 }, { t: 'V', i: 11, syy: 'Ase auki' }, { t: 'V', i: 19, syy: 'Myöhästyi' }];
  const teksti = tapahtumaTeksti(lista);
  assert.equal(teksti, 'H5; N12; V12 Ase auki; V20 Myöhästyi');
  assert.deepEqual(jasennaTapahtumat(teksti), lista);
  assert.equal(tapahtumaTeksti([]), '');
  assert.equal(normalisoi(' h5 ;; v2  syy; tekstiä '), 'H5; V2 syy');
  // Syy ei voi rikkoa listaa.
  assert.equal(tapahtumaTeksti([{ t: 'V', i: 0, syy: 'a;b\nc' }]), 'V1 a b c');
});

test('tarkistus', () => {
  assert.ok(onkoTapahtumat('', 25));
  assert.ok(onkoTapahtumat(undefined, 25));
  assert.ok(onkoTapahtumat('H1; V25 syy', 25));
  assert.ok(!onkoTapahtumat('R3x2', 25), 'vähennyksiä ei ole');
  assert.ok(!onkoTapahtumat('H26', 25));
  assert.ok(!onkoTapahtumat('H0', 25));
  assert.ok(!onkoTapahtumat('X1', 25));
  assert.ok(!onkoTapahtumat(['H1'], 25));
});

test('laskurit ja korostus', () => {
  const t = 'H1; N2; V3; H3; V10';
  assert.equal(hairiot(t), 3);
  assert.equal(varoitukset(t), 2);
  assert.equal(kiekonKorostus(t, 0), 'hairio');
  assert.equal(kiekonKorostus(t, 2), 'varoitus');
  assert.equal(kiekonKorostus(t, 5), null);
  assert.equal(kiekonSelite('V3 Ase auki; H3', 2), 'varoitus: Ase auki, toimintahäiriö');
  assert.equal(yhteenveto(t), 'HÄIRIÖT 3, VAROITUKSET 2');
  assert.equal(yhteenveto(''), '');
});

test('lisäys, poisto ja raja', () => {
  assert.equal(lisaa('H1', { t: 'V', i: 4, syy: 'x' }), 'H1; V5 x');
  assert.equal(poista('H1; V1; V2', 0), 'V2');
  assert.equal(poista('H1; V1; V2', 0, ['V']), 'H1; V2');
  assert.equal(hairioRaja(''), 2);
  assert.equal(hairioRaja('3'), 3);
  assert.equal(hairioRaja('0'), 0);
  assert.equal(hairioRaja('kaksi'), 2);
  assert.equal(hairioRaja('12'), 2);
  assert.equal(hairioRaja('', 'COMPAK'), 1, 'FITASCin sääntö: 1 per 25 kiekon layout');
  assert.equal(hairioRaja('', 'fitasc'), 1);
  assert.equal(hairioRaja('', 'SPORTING'), 2);
  assert.equal(hairioRaja('3', 'COMPAK'), 3, 'avain voittaa');
  assert.equal(hairioRaja('', 'ESP'), 2);
  assert.ok(hairiotAsemittain('ESP'));
  assert.ok(!hairiotAsemittain('SPORTING'));
  assert.equal(hairiot('H1; H2; N7', 5, 10), 1, 'aseman kiekot');
});

test('tekstit kielen mukaan (i18n.js kirjausTapahtumat)', async () => {
  const { kiekonSelite, korostusNimi, taynnaViesti, tapahtumaMuutos } = await import('./tapahtumat.js');
  assert.equal(kiekonSelite('V3 Ase auki; N3', 2, 'en'), 'warning: Ase auki, malfunction over the limit (miss)');
  assert.equal(korostusNimi('hairio', 'en'), 'malfunction');
  assert.equal(korostusNimi('varoitus'), 'varoitus');
  assert.match(taynnaViesti('fi'), /^Kortilla on jo 40 /);
  assert.equal(tapahtumaMuutos('H1', 'H1; V2', 'en'), 'warning');
  assert.equal(tapahtumaMuutos('H1', '', 'fi'), 'poisto');
});
