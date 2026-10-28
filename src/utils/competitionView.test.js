import test from 'node:test';
import assert from 'node:assert/strict';

import { laskeSeuraavaAktiivinenSivu } from './competitionView.js';

const perus = {
  valittuKisa: { id: '1' },
  aktiivinenSivu: 'tulokset',
  onkoAikatauluSallittu: true,
  onkoIlmoittautuneita: true,
  onkoMateriaaleja: false,
  onkoJoukkueKisa: true,
  onkoKisaPaattynyt: false,
  onkoKisaTulossa: false,
  onkoTaulukkoSallittu: true,
  onkoTuloksetSallittu: true
};

test('ohjaa tulossa-kisassa ilmoittautuneisiin', () => {
  const seuraava = laskeSeuraavaAktiivinenSivu({
    ...perus,
    onkoKisaTulossa: true,
    aktiivinenSivu: 'tulokset'
  });
  assert.equal(seuraava, 'ilmoittautuneet');
});

test('siirtyy tuloksiin kun aikataulu ei ole sallittu', () => {
  const seuraava = laskeSeuraavaAktiivinenSivu({
    ...perus,
    aktiivinenSivu: 'aikataulu',
    onkoAikatauluSallittu: false
  });
  assert.equal(seuraava, 'tulokset');
});

test('siirtyy tuloksiin kun taulukko ei ole sallittu', () => {
  const seuraava = laskeSeuraavaAktiivinenSivu({
    ...perus,
    aktiivinenSivu: 'taulukko',
    onkoTaulukkoSallittu: false
  });
  assert.equal(seuraava, 'tulokset');
});

test('ohjaa materiaaleihin tulossa-kisassa ilman ilmoittautuneita ja aikataulua', () => {
  const seuraava = laskeSeuraavaAktiivinenSivu({
    ...perus,
    aktiivinenSivu: 'tulokset',
    onkoKisaTulossa: true,
    onkoIlmoittautuneita: false,
    onkoAikatauluSallittu: false,
    onkoMateriaaleja: true
  });
  assert.equal(seuraava, 'materiaalit');
});

test('palauttaa nykyisen sivun jos muutosta ei tarvita', () => {
  const seuraava = laskeSeuraavaAktiivinenSivu(perus);
  assert.equal(seuraava, 'tulokset');
});

test('ryhmien muokkaus pysyy auki tulevassa kisassa ja suljetaan, kun se ei ole sallittu', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaTulossa: true, onkoAikatauluSallittu: false, aktiivinenSivu: 'ryhmat', onkoRyhmaMuokkausSallittu: true }), 'ryhmat');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'ryhmat', onkoRyhmaMuokkausSallittu: false }), 'tulokset');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaTulossa: true, onkoTuloksetSallittu: false, aktiivinenSivu: 'ryhmat', onkoRyhmaMuokkausSallittu: false }), 'ilmoittautuneet');
});

test('radat live pysyy auki vain, kun se on sallittu', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'live', onkoLiveSallittu: true }), 'live');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'live', onkoLiveSallittu: false }), 'tulokset');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'live' }), 'tulokset');
});
