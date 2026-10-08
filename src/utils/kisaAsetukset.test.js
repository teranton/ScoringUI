import test from 'node:test';
import assert from 'node:assert/strict';

import {
  haeAikatauluMalliSpekseista,
  haeAikatauluNakyvyysSpekseista,
  haeAikatauluRyhmittelySpekseista,
  haeSponsoriLogoNakyvyysSpekseista
} from './kisaAsetukset.js';

test('haeAikatauluNakyvyysSpekseista tunnistaa arvot always, after-start ja off', () => {
  assert.equal(haeAikatauluNakyvyysSpekseista([['AIKATAULU_NAKYVYYS', 'aina']]), 'always');
  assert.equal(haeAikatauluNakyvyysSpekseista([['Aikataulu_nakyvyys', 'after start']]), 'after-start');
  assert.equal(haeAikatauluNakyvyysSpekseista([['TIMETABLE_VISIBILITY', 'off']]), 'off');
  assert.equal(haeAikatauluNakyvyysSpekseista([['AIKATAULUNAKYVYYS', 'jotain muuta']]), null);
  assert.equal(haeAikatauluNakyvyysSpekseista('AIKATAULUNAKYVYYS,EI\n'), 'off');
  assert.equal(haeAikatauluNakyvyysSpekseista([]), null);
});

test('haeSponsoriLogoNakyvyysSpekseista tunnistaa on ja off', () => {
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['LOGOT_NAKYVYYS', 'näytä', 'show']]), 'on');
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['AIKATAULU_LOGOT', 'piilota', 'hidden']]), 'off');
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['Asema', 'Max']]), null);
});

test('haeAikatauluRyhmittelySpekseista tunnistaa inline-, 5- ja 6-ryhmittelyn', () => {
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULU_RYHMITTELY', 'radat']]), 'inline');
  assert.equal(haeAikatauluRyhmittelySpekseista([['TIMETABLE_GROUP_SIZE', '5']]), 'group5');
  assert.equal(haeAikatauluRyhmittelySpekseista([['GROUPING_MODE', 'Ryhma 6']]), 'group6');
  assert.equal(haeAikatauluRyhmittelySpekseista([['GROUPING_MODE', '']]), null);
});

test('haeAikatauluMalliSpekseista tunnistaa inline- ja ryhmämallin', () => {
  assert.equal(haeAikatauluMalliSpekseista([['AIKATAULU_MALLI', 'inline']]), 'inline');
  assert.equal(haeAikatauluMalliSpekseista([['Muuta', ''], ['AIKATAULUMALLI', 'erat']]), 'groups');
  assert.equal(haeAikatauluMalliSpekseista([['AIKATAULUMALLI', 'tuntematon']]), null);
});

test('asetusavaimet ja -arvot tunnistetaan myös ääkkösin', () => {
  assert.equal(haeAikatauluNakyvyysSpekseista([['Aikataulu näkyvyys', 'Käynnissä']]), 'after-start');
  assert.equal(haeAikatauluNakyvyysSpekseista([['AIKATAULU_NÄKYVYYS', 'ei']]), 'off');
  assert.equal(haeAikatauluRyhmittelySpekseista([['AIKATAULU_RYHMÄKOKO', 'Ryhmä 6']]), 'group6');
  assert.equal(haeAikatauluMalliSpekseista([['AIKATAULU_NÄKYMÄ', 'Erät']]), 'groups');
  assert.equal(haeAikatauluMalliSpekseista([['AIKATAULU_MALLI', 'Eräluettelo']]), 'groups');
  assert.equal(haeSponsoriLogoNakyvyysSpekseista([['LOGOT_NÄKYVYYS', 'Näkyvissä', 'on']]), 'on');
});

test('asetuksen arvo luetaan vain avainta seuraavista kahdesta solusta', () => {
  const rivit = [['AIKATAULUNAKYVYYS', 'tuntematon', '', 'LOGOT_NAKYVYYS', 'ON']];
  assert.equal(haeAikatauluNakyvyysSpekseista(rivit), null);
  assert.equal(haeSponsoriLogoNakyvyysSpekseista(rivit), 'on');
  assert.equal(haeAikatauluRyhmittelySpekseista([['GROUPING_MODE', '', '6']]), 'group6');
  assert.equal(haeAikatauluRyhmittelySpekseista([['6', 'GROUPING_MODE']]), null);
});
