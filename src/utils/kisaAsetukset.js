// src/utils/kisaAsetukset.js
// KISANSPEKSIT-välilehden näkymäasetukset (aikataulun näkyvyys, logot, ryhmittely, malli).
import { parseCsvRows } from './csv.js';

// Isot kirjaimet, ääkköset ilman pisteitä (Ä→A, Ö→O, Å→A) ja vain A-Z, 0-9 ja _.
export function normalisoiAsetus(arvo) {
  return String(arvo || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9_]/g, '');
}

// Etsii riviltä asetusavaimen ja tulkitsee sen arvon avainta seuraavista kahdesta solusta.
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

      const ehdokasArvot = [solut[i + 1], solut[i + 2]].filter(Boolean);
      for (const ehdokas of ehdokasArvot) {
        const tulkinta = tulkitse(ehdokas, avain);
        if (tulkinta) return tulkinta;
      }
    }
  }

  return null;
}

function normalisoiAikatauluNakyvyysArvo(arvo) {
  const norm = normalisoiAsetus(arvo);
  if (!norm) return null;

  if (['ALWAYS', 'AINA', 'ON', 'TRUE', 'YES', '1', 'PUBLIC', 'ENABLED'].includes(norm)) return 'always';
  if (['AFTERSTART', 'AFTER_START', 'START', 'KAYNNISSA', 'LIVE', 'RESULTS'].includes(norm)) return 'after-start';
  if (['OFF', 'FALSE', 'NO', '0', 'HIDDEN', 'DISABLED', 'NONE', 'EI'].includes(norm)) return 'off';
  return null;
}

const AIKATAULU_NAKYVYYS_AVAIMET = new Set([
  'AIKATAULUNAKYVYYS', 'AIKATAULU_NAKYVYYS', 'AIKATAULUJULKINEN', 'AIKATAULU_JULKINEN',
  'TIMETABLEVISIBILITY', 'TIMETABLE_VISIBILITY', 'TIMETABLEPUBLIC', 'TIMETABLE_PUBLIC'
]);

export function haeAikatauluNakyvyysSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_NAKYVYYS_AVAIMET, normalisoiAikatauluNakyvyysArvo);
}

function normalisoiSponsoriLogoNakyvyysArvo(arvo) {
  const norm = normalisoiAsetus(arvo);
  if (!norm) return null;

  if (['ON', 'TRUE', 'YES', '1', 'SHOW', 'VISIBLE', 'ENABLED', 'AINA', 'ALWAYS'].includes(norm)) return 'on';
  if (['OFF', 'FALSE', 'NO', '0', 'HIDE', 'HIDDEN', 'DISABLED', 'EI', 'NONE'].includes(norm)) return 'off';
  return null;
}

const SPONSORI_LOGO_NAKYVYYS_AVAIMET = new Set([
  'LOGOTNAKYVYYS', 'LOGOT_NAKYVYYS', 'SPONSORLOGOSVISIBILITY', 'SPONSOR_LOGOS_VISIBILITY',
  'SPONSORLOGONAKYVYYS', 'SPONSOR_LOGO_NAKYVYYS', 'AIKATAULULOGOT', 'AIKATAULU_LOGOT'
]);

export function haeSponsoriLogoNakyvyysSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, SPONSORI_LOGO_NAKYVYYS_AVAIMET, normalisoiSponsoriLogoNakyvyysArvo);
}

function normalisoiAikatauluRyhmittelyArvo(arvo) {
  const norm = normalisoiAsetus(arvo).replace(/_/g, '');
  if (!norm) return null;

  if (['INLINE', 'INLINEAMMUNTA', 'INLINEORDER', 'LANE', 'LANES', 'RADAT', 'RATA'].includes(norm)) return 'inline';
  if (['5', 'GROUP5', 'RYHMA5', 'GROUPSIZE5', 'SIZE5'].includes(norm)) return 'group5';
  if (['6', 'GROUP6', 'RYHMA6', 'GROUPSIZE6', 'SIZE6'].includes(norm)) return 'group6';
  return null;
}

const AIKATAULU_RYHMITTELY_AVAIMET = new Set([
  'AIKATAULURYHMITTELY', 'AIKATAULU_RYHMITTELY', 'AIKATAULUGROUPING', 'AIKATAULU_GROUPING',
  'TIMETABLEGROUPING', 'TIMETABLE_GROUPING', 'AIKATAULURYHMAKOKO', 'AIKATAULU_RYHMAKOKO',
  'TIMETABLEGROUPSIZE', 'TIMETABLE_GROUP_SIZE', 'GROUPINGMODE', 'GROUPING_MODE'
]);

export function haeAikatauluRyhmittelySpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_RYHMITTELY_AVAIMET, normalisoiAikatauluRyhmittelyArvo);
}

function normalisoiAikatauluMalliArvo(arvo) {
  const norm = normalisoiAsetus(arvo);
  if (!norm) return null;

  if (['INLINE', 'INLINEVIEW', 'INLINE_LAYOUT', 'INLINE_MALLI', 'INLINE_NAKYMA'].includes(norm)) return 'inline';
  if (['GROUPS', 'GROUP', 'HEATS', 'ERAT', 'ERALUETTELO', 'RYHMAT', 'RYHMA'].includes(norm)) return 'groups';
  return null;
}

const AIKATAULU_MALLI_AVAIMET = new Set([
  'AIKATAULUMALLI', 'AIKATAULU_MALLI', 'AIKATAULUNAKYMA', 'AIKATAULU_NAKYMA',
  'TIMETABLEMODEL', 'TIMETABLE_MODEL', 'TIMETABLEVIEW', 'TIMETABLE_VIEW',
  'SCHEDULEMODEL', 'SCHEDULE_MODEL'
]);

export function haeAikatauluMalliSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_MALLI_AVAIMET, normalisoiAikatauluMalliArvo);
}
