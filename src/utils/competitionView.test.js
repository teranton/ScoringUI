import test from 'node:test';
import assert from 'node:assert/strict';

import { kisaHash, laskeSeuraavaAktiivinenSivu, parsiKisaHash } from './competitionView.js';

const perus = {
  valittuKisa: { id: '1' },
  aktiivinenSivu: 'tulokset',
  onkoAikatauluSallittu: true,
  onkoIlmoittautuneita: true,
  onkoJoukkueKisa: true,
  onkoKisaPaattynyt: false,
  onkoKisaTulossa: false,
  onkoTaulukkoSallittu: true,
  onkoTuloksetSallittu: true
};

test('ohjaa tulossa-kisassa tuloksista Info-sivulle', () => {
  const seuraava = laskeSeuraavaAktiivinenSivu({
    ...perus,
    onkoKisaTulossa: true,
    onkoTuloksetSallittu: false,
    aktiivinenSivu: 'tulokset'
  });
  assert.equal(seuraava, 'info');
});

test('oletussivu: tuleva kisa Info-sivulle, käynnissä oleva ja päättynyt tuloksiin', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaTulossa: true, onkoTuloksetSallittu: false, aktiivinenSivu: 'oletus' }), 'info');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'oletus' }), 'tulokset');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaPaattynyt: true, aktiivinenSivu: 'oletus' }), 'tulokset');
});

test('tulevan kisan ilmoittautuneet ja aikataulu pysyvät auki', () => {
  const tuleva = { ...perus, onkoKisaTulossa: true, onkoTuloksetSallittu: false };
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...tuleva, aktiivinenSivu: 'ilmoittautuneet' }), 'ilmoittautuneet');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...tuleva, aktiivinenSivu: 'aikataulu' }), 'aikataulu');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...tuleva, aktiivinenSivu: 'aikataulu', onkoAikatauluSallittu: false }), 'info');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...tuleva, aktiivinenSivu: 'ilmoittautuneet', onkoIlmoittautuneita: false }), 'info');
});

test('Info on auki kaikissa tiloissa, ja vanha materiaalit-sivu on Info', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'info' }), 'info');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaPaattynyt: true, aktiivinenSivu: 'info' }), 'info');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'materiaalit' }), 'info');
});

test('päättyneessä kisassa aikataulu ja ilmoittautuneet vaihtuvat tuloksiin', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaPaattynyt: true, aktiivinenSivu: 'aikataulu' }), 'tulokset');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaPaattynyt: true, aktiivinenSivu: 'ilmoittautuneet' }), 'tulokset');
});

test('kisan osoite välilehden kanssa ja ilman', () => {
  assert.deepEqual(parsiKisaHash('#kisa-2026_12'), { id: '2026_12', sivu: null });
  assert.deepEqual(parsiKisaHash('#kisa-2026_12/ilmoittautuneet'), { id: '2026_12', sivu: 'ilmoittautuneet' });
  assert.deepEqual(parsiKisaHash('#kisa-2026_12/materiaalit'), { id: '2026_12', sivu: 'info' });
  assert.deepEqual(parsiKisaHash('#kisa-a%2Fb'), { id: 'a/b', sivu: null });
  assert.deepEqual(parsiKisaHash('#kisa-2026_12/tuntematon'), { id: '2026_12/tuntematon', sivu: null });
  assert.equal(parsiKisaHash('#muu'), null);
  assert.equal(parsiKisaHash('#kisa-'), null);
  assert.equal(kisaHash('2026_12', 'aikataulu'), '#kisa-2026_12/aikataulu');
  assert.equal(kisaHash('2026_12', null), '#kisa-2026_12');
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

test('palauttaa nykyisen sivun jos muutosta ei tarvita', () => {
  const seuraava = laskeSeuraavaAktiivinenSivu(perus);
  assert.equal(seuraava, 'tulokset');
});

test('ryhmien muokkaus pysyy auki tulevassa kisassa ja suljetaan, kun se ei ole sallittu', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaTulossa: true, onkoAikatauluSallittu: false, aktiivinenSivu: 'ryhmat', onkoRyhmaMuokkausSallittu: true }), 'ryhmat');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'ryhmat', onkoRyhmaMuokkausSallittu: false }), 'tulokset');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaTulossa: true, onkoTuloksetSallittu: false, aktiivinenSivu: 'ryhmat', onkoRyhmaMuokkausSallittu: false }), 'info');
});

test('radat live pysyy auki vain, kun se on sallittu', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'live', onkoLiveSallittu: true }), 'live');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'live', onkoLiveSallittu: false }), 'tulokset');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'live' }), 'tulokset');
});

test('finaali pysyy auki päättyneessä kisassa vain, kun FINAALI-välilehdellä on otteluita', () => {
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaPaattynyt: true, aktiivinenSivu: 'finaali', onkoFinaali: true }), 'finaali');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, onkoKisaPaattynyt: true, aktiivinenSivu: 'finaali', onkoFinaali: false }), 'tulokset');
  assert.equal(laskeSeuraavaAktiivinenSivu({ ...perus, aktiivinenSivu: 'finaali' }), 'tulokset');
});
