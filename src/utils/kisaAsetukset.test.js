import test from 'node:test';
import assert from 'node:assert/strict';

import {
  haeAikatauluMalliSpekseista,
  haeAikatauluNakyvyysSpekseista,
  haeAikatauluRyhmittelySpekseista,
  haeSponsoriLogoNakyvyysSpekseista
} from './kisaAsetukset.js';

test('haeAikatauluNakyvyysSpekseista tunnistaa arvot TRUE, AFTER_START ja FALSE', () => {
  assert.equal(haeAikatauluNakyvyysSpekseista([['AIKATAULU_NAKYVYYS', 'TRUE']]), 'always');
  assert.equal(haeAikatauluNakyvyysSpekseista([['Aikataulu_nakyvyys', 'after start']]), 'after-start');
  assert.equal(haeAikatauluNakyvyysSpekseista([['AIKATAULU_NAKYVYYS', 'false']]), 'off');
  assert.equal(haeAikatauluNakyvyysSpekseista('AIKATAULUNAKYVYYS,FALSE\n'), 'off');
  assert.equal(haeAikatauluNakyvyysSpekseista([['AIKATAULUNAKYVYYS', 'jotain muuta']]), null);
  assert.equal(haeAikatauluNakyvyysSpekseista([]), null);
});

test('haeSponsoriLogoNakyvyysSpekseista tunnistaa TRUE ja FALSE', () => {
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['LOGOT_NAKYVYYS', 'TRUE']]), 'on');
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['LOGOT_NAKYVYYS', 'FALSE']]), 'off');
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['Asema', 'Max']]), null);
});

test('haeAikatauluRyhmittelySpekseista tunnistaa INLINE, 5 ja 6', () => {
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULURYHMAKOKO', 'INLINE']]), 'inline');
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULU_RYHMAKOKO', '5']]), 'group5');
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULURYHMAKOKO', '6']]), 'group6');
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULURYHMAKOKO', '']]), null);
});

test('haeAikatauluMalliSpekseista tunnistaa INLINE ja GROUPS', () => {
  assert.equal(haeAikatauluMalliSpekseista([['AIKATAULU_MALLI', 'inline']]), 'inline');
  assert.equal(haeAikatauluMalliSpekseista([['Muuta', ''], ['AIKATAULUMALLI', 'GROUPS']]), 'groups');
  assert.equal(haeAikatauluMalliSpekseista([['AIKATAULUMALLI', 'tuntematon']]), null);
});

test('muita avaimia ja arvoja ei tulkita', () => {
  assert.equal(haeAikatauluNakyvyysSpekseista([['TIMETABLE_VISIBILITY', 'FALSE']]), null);
  assert.equal(haeAikatauluNakyvyysSpekseista([['AIKATAULU_NAKYVYYS', 'aina']]), null);
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['LOGOT_NAKYVYYS', 'EI']]), null);
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULU_RYHMITTELY', '6']]), null);
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULU_RYHMAKOKO', 'Ryhmä 6']]), null);
  assert.equal(haeAikatauluMalliSpekseista([['AIKATAULU_MALLI', 'Erät']]), null);
});

test('avaimissa ääkköset, välilyönnit ja alaviivat ovat samanarvoisia', () => {
  assert.equal(haeAikatauluNakyvyysSpekseista([['Aikataulu näkyvyys', 'False']]), 'off');
  assert.equal(haeAikatauluRyhmittelySpekseista([['Aikataulu ryhmäkoko', '6']]), 'group6');
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['LOGOT_NÄKYVYYS', 'false']]), 'off');
});

test('asetuksen arvo on avaimen oikealla puolella oleva ensimmäinen ei-tyhjä solu', () => {
  const rivit = [['AIKATAULUNAKYVYYS', 'tuntematon', '', 'LOGOT_NAKYVYYS', 'TRUE']];
  assert.equal(haeAikatauluNakyvyysSpekseista(rivit), null);
  assert.equal(haeSponsoriLogoNakyvyysSpekseista(rivit), 'on');
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULURYHMAKOKO', '', '6']]), 'group6');
  assert.equal(haeAikatauluRyhmittelySpekseista([['6', 'AIKATAULURYHMAKOKO']]), null);

  const vierekkain = [['AIKATAULU_MALLI', 'AIKATAULURYHMAKOKO', 'INLINE']];
  assert.equal(haeAikatauluMalliSpekseista(vierekkain), null);
  assert.equal(haeAikatauluRyhmittelySpekseista(vierekkain), 'inline');
});
