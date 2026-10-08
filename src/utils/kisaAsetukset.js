// src/utils/kisaAsetukset.js
// KISANSPEKSIT-välilehden näkymäasetukset (aikataulun näkyvyys, logot, ryhmittely, malli).
import { parseCsvRows } from './csv.js';
import { normalisoiOtsikko } from './henkiloTulokset.js';

// Avaimet ja arvot verrataan normalisoituina: isot kirjaimet, Ä/Ö/Å → A/O/A, vain A-Z ja 0-9
// (välilyönnit ja alaviivat pois), joten 'Aikataulu näkyvyys' = 'AIKATAULU_NAKYVYYS'.
export const normalisoiAsetus = normalisoiOtsikko;

export function asetusJoukko(arvot) {
  return new Set(arvot.map(normalisoiAsetus));
}

// Muodostaa tulkintafunktion taulukosta [[tulos, [hyväksytyt arvot]], ...].
export function asetusTulkitsija(taulukko) {
  const joukot = taulukko.map(([tulos, arvot]) => [tulos, asetusJoukko(arvot)]);
  return (arvo) => {
    const norm = normalisoiAsetus(arvo);
    if (!norm) return null;
    const osuma = joukot.find(([, joukko]) => joukko.has(norm));
    return osuma ? osuma[0] : null;
  };
}

// Etsii riviltä asetusavaimen ja tulkitsee avaimen oikealla puolella olevan ensimmäisen ei-tyhjän solun.
// tulkitse(arvo, avain) palauttaa tulkinnan tai null.
export function haeAsetusSpekseista(speksitData, avainSanat, tulkitse) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());

    for (let i = 0; i < solut.length; i++) {
      const avain = normalisoiAsetus(solut[i]);
      if (!avainSanat.has(avain)) continue;

      const arvo = solut.slice(i + 1).find(Boolean);
      const tulkinta = arvo ? tulkitse(arvo, avain) : null;
      if (tulkinta) return tulkinta;
    }
  }

  return null;
}

const tulkitseAikatauluNakyvyys = asetusTulkitsija([
  ['always', ['ALWAYS', 'AINA', 'ON', 'TRUE', 'YES', '1', 'PUBLIC', 'ENABLED']],
  ['after-start', ['AFTER_START', 'START', 'KAYNNISSA', 'LIVE', 'RESULTS']],
  ['off', ['OFF', 'FALSE', 'NO', '0', 'HIDDEN', 'DISABLED', 'NONE', 'EI']]
]);

const AIKATAULU_NAKYVYYS_AVAIMET = asetusJoukko([
  'AIKATAULU_NAKYVYYS', 'AIKATAULU_JULKINEN', 'TIMETABLE_VISIBILITY', 'TIMETABLE_PUBLIC'
]);

export function haeAikatauluNakyvyysSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_NAKYVYYS_AVAIMET, tulkitseAikatauluNakyvyys);
}

const tulkitseSponsoriLogoNakyvyys = asetusTulkitsija([
  ['on', ['ON', 'TRUE', 'YES', '1', 'SHOW', 'VISIBLE', 'ENABLED', 'AINA', 'ALWAYS']],
  ['off', ['OFF', 'FALSE', 'NO', '0', 'HIDE', 'HIDDEN', 'DISABLED', 'EI', 'NONE']]
]);

const SPONSORI_LOGO_NAKYVYYS_AVAIMET = asetusJoukko([
  'LOGOT_NAKYVYYS', 'SPONSOR_LOGOS_VISIBILITY', 'SPONSOR_LOGO_NAKYVYYS', 'AIKATAULU_LOGOT'
]);

export function haeSponsoriLogoNakyvyysSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, SPONSORI_LOGO_NAKYVYYS_AVAIMET, tulkitseSponsoriLogoNakyvyys);
}

const tulkitseAikatauluRyhmittely = asetusTulkitsija([
  ['inline', ['INLINE', 'INLINEAMMUNTA', 'INLINEORDER', 'LANE', 'LANES', 'RADAT', 'RATA']],
  ['group5', ['5', 'GROUP5', 'RYHMA5', 'GROUPSIZE5', 'SIZE5']],
  ['group6', ['6', 'GROUP6', 'RYHMA6', 'GROUPSIZE6', 'SIZE6']]
]);

const AIKATAULU_RYHMITTELY_AVAIMET = asetusJoukko([
  'AIKATAULU_RYHMITTELY', 'AIKATAULU_GROUPING', 'TIMETABLE_GROUPING', 'AIKATAULU_RYHMAKOKO',
  'TIMETABLE_GROUP_SIZE', 'GROUPING_MODE'
]);

export function haeAikatauluRyhmittelySpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_RYHMITTELY_AVAIMET, tulkitseAikatauluRyhmittely);
}

const tulkitseAikatauluMalli = asetusTulkitsija([
  ['inline', ['INLINE', 'INLINEVIEW', 'INLINE_LAYOUT', 'INLINE_MALLI', 'INLINE_NAKYMA']],
  ['groups', ['GROUPS', 'GROUP', 'HEATS', 'ERAT', 'ERALUETTELO', 'RYHMAT', 'RYHMA']]
]);

const AIKATAULU_MALLI_AVAIMET = asetusJoukko([
  'AIKATAULU_MALLI', 'AIKATAULU_NAKYMA', 'TIMETABLE_MODEL', 'TIMETABLE_VIEW', 'SCHEDULE_MODEL'
]);

export function haeAikatauluMalliSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_MALLI_AVAIMET, tulkitseAikatauluMalli);
}
