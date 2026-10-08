import test from 'node:test';
import assert from 'node:assert/strict';

import {
  haeStatusOverrideSpekseista,
  laskeKisanEfektiivinenStatus,
  laskeKisanStatusJaTyyli,
  laskeOnkoIlmoittautuminenPaattynyt,
  parsiPaivamaara
} from './kisaStatus.js';

const hetki = (paiva, kuukausi, vuosi, tunti = 12, minuutti = 0) => new Date(vuosi, kuukausi - 1, paiva, tunti, minuutti);

test('parsiPaivamaara hyväksyy olemassa olevat päivät muodoissa p.k.vvvv ja vvvv-kk-pp', () => {
  assert.deepEqual(parsiPaivamaara('7.6.2026'), new Date(2026, 5, 7));
  assert.deepEqual(parsiPaivamaara(' 07.06.2026 '), new Date(2026, 5, 7));
  assert.deepEqual(parsiPaivamaara('2026-06-07'), new Date(2026, 5, 7));
  assert.deepEqual(parsiPaivamaara('2026-6-7'), new Date(2026, 5, 7));
  assert.equal(parsiPaivamaara('31.2.2026'), null);
  assert.equal(parsiPaivamaara('2026-02-31'), null);
  assert.equal(parsiPaivamaara('kesäkuu'), null);
  assert.equal(parsiPaivamaara(''), null);
  assert.equal(parsiPaivamaara(null), null);
});

test('laskeKisanStatusJaTyyli päättelee tilan päivämääristä', () => {
  assert.equal(laskeKisanStatusJaTyyli('6.6.2026', '7.6.2026', hetki(5, 6, 2026)).status, 'tulossa');
  assert.equal(laskeKisanStatusJaTyyli('6.6.2026', '7.6.2026', hetki(6, 6, 2026, 8)).status, 'kaynnissa');
  assert.equal(laskeKisanStatusJaTyyli('6.6.2026', '7.6.2026', hetki(7, 6, 2026, 23, 59)).status, 'kaynnissa');
  assert.equal(laskeKisanStatusJaTyyli('6.6.2026', '7.6.2026', hetki(8, 6, 2026)).status, 'paattynyt');
  assert.equal(laskeKisanStatusJaTyyli('6.6.2026', '', hetki(7, 6, 2026)).status, 'paattynyt');
  assert.equal(laskeKisanStatusJaTyyli('', '', hetki(7, 6, 2026)).status, 'tulossa');
  assert.equal(laskeKisanStatusJaTyyli('huomenna', '', hetki(7, 6, 2026)).status, 'tulossa');
});

test('laskeKisanStatusJaTyyli ei muuta annettua hetkeä', () => {
  const nyt = hetki(6, 6, 2026, 15, 30);
  laskeKisanStatusJaTyyli('6.6.2026', '7.6.2026', nyt);
  assert.equal(nyt.getHours(), 15);
});

test('laskeOnkoIlmoittautuminenPaattynyt sulkee ilmoittautumisen kisapäivänä klo 10', () => {
  assert.equal(laskeOnkoIlmoittautuminenPaattynyt('6.6.2026', hetki(6, 6, 2026, 9, 59)), false);
  assert.equal(laskeOnkoIlmoittautuminenPaattynyt('6.6.2026', hetki(6, 6, 2026, 10, 0)), true);
  assert.equal(laskeOnkoIlmoittautuminenPaattynyt('', hetki(6, 6, 2026)), true);
});

test('haeStatusOverrideSpekseista lukee status-avaimen riveiltä tai CSV-tekstistä', () => {
  assert.equal(haeStatusOverrideSpekseista([['Asema', 'Max'], ['STATUS', 'Käynnissä']]), 'kaynnissa');
  assert.equal(haeStatusOverrideSpekseista([['Kisa status', 'tauolla']]), 'tauolla');
  assert.equal(haeStatusOverrideSpekseista([['KISA_PAATTYNYT', 'x']]), 'paattynyt');
  assert.equal(haeStatusOverrideSpekseista('STATUS,FINISHED\n'), 'paattynyt');
  assert.equal(haeStatusOverrideSpekseista([['STATUS', '']]), null);
  assert.equal(haeStatusOverrideSpekseista([]), null);
  assert.equal(haeStatusOverrideSpekseista([['Kisa päättynyt', 'x']]), 'paattynyt');
  assert.equal(haeStatusOverrideSpekseista([['Kilpailu_päättynyt', '', 'TRUE']]), 'paattynyt');
  assert.equal(haeStatusOverrideSpekseista(null), null);
});

test('laskeKisanEfektiivinenStatus vaatii käynnissä olevalle kisalle status-merkinnän', () => {
  const kisapaiva = hetki(6, 6, 2026);

  assert.equal(laskeKisanEfektiivinenStatus('6.6.2026', '7.6.2026', [], kisapaiva).status, 'tulossa');
  assert.equal(laskeKisanEfektiivinenStatus('6.6.2026', '7.6.2026', [['STATUS', 'LIVE']], kisapaiva).status, 'kaynnissa');

  const tauolla = laskeKisanEfektiivinenStatus('6.6.2026', '7.6.2026', [['STATUS', 'Tauko']], kisapaiva);
  assert.equal(tauolla.status, 'tauolla');
  assert.equal(tauolla.teksti, 'Tauolla');
});

test('laskeKisanEfektiivinenStatus: päättynyt-merkintä voittaa päivämäärät', () => {
  const ennenKisaa = hetki(1, 6, 2026);
  assert.equal(laskeKisanEfektiivinenStatus('6.6.2026', '7.6.2026', [['STATUS', 'Päättynyt']], ennenKisaa).status, 'paattynyt');
  assert.equal(laskeKisanEfektiivinenStatus('6.6.2026', '7.6.2026', [['STATUS', 'Käynnissä']], ennenKisaa).status, 'tulossa');
  assert.equal(laskeKisanEfektiivinenStatus('6.6.2026', '7.6.2026', [], hetki(9, 6, 2026)).status, 'paattynyt');
});

test('haeStatusOverrideSpekseista ei lue arvoa rivin muista soluista', () => {
  assert.equal(haeStatusOverrideSpekseista([['STATUS', 'tuntematon', '', 'Muu asetus', 'LIVE']]), null);
  assert.equal(haeStatusOverrideSpekseista([['Tauolla', 'STATUS', '']]), null);
});
