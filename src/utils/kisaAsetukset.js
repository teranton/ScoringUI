// src/utils/kisaAsetukset.js
// KISANSPEKSIT-välilehden näkymäasetukset (aikataulun näkyvyys, logot, ryhmittely, malli).
import { parseCsvRows } from './csv.js';

function normalisoiAikatauluNakyvyysArvo(arvo) {
  const norm = String(arvo || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!norm) return null;

  if (['ALWAYS', 'AINA', 'ON', 'TRUE', 'YES', '1', 'PUBLIC', 'ENABLED'].includes(norm)) return 'always';
  if (['AFTERSTART', 'AFTER_START', 'START', 'KAYNNISSA', 'LIVE', 'RESULTS'].includes(norm)) return 'after-start';
  if (['OFF', 'FALSE', 'NO', '0', 'HIDDEN', 'DISABLED', 'NONE', 'EI'].includes(norm)) return 'off';
  return null;
}

export function haeAikatauluNakyvyysSpekseista(speksitData) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  const avainSanat = new Set([
    'AIKATAULUNAKYVYYS', 'AIKATAULU_NAKYVYYS', 'AIKATAULUJULKINEN', 'AIKATAULU_JULKINEN',
    'TIMETABLEVISIBILITY', 'TIMETABLE_VISIBILITY', 'TIMETABLEPUBLIC', 'TIMETABLE_PUBLIC'
  ]);

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());
    const normalisoidut = solut.map((s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, ''));

    for (let i = 0; i < normalisoidut.length; i++) {
      const avain = normalisoidut[i];
      if (!avainSanat.has(avain)) continue;

      const ehdokasArvot = [solut[i + 1], solut[i + 2], ...solut].filter(Boolean);
      for (const ehdokas of ehdokasArvot) {
        const tulkinta = normalisoiAikatauluNakyvyysArvo(ehdokas);
        if (tulkinta) return tulkinta;
      }
    }
  }

  return null;
}

function normalisoiSponsoriLogoNakyvyysArvo(arvo) {
  const norm = String(arvo || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!norm) return null;

  if (['ON', 'TRUE', 'YES', '1', 'SHOW', 'VISIBLE', 'ENABLED', 'AINA', 'ALWAYS'].includes(norm)) return 'on';
  if (['OFF', 'FALSE', 'NO', '0', 'HIDE', 'HIDDEN', 'DISABLED', 'EI', 'NONE'].includes(norm)) return 'off';
  return null;
}

export function haeSponsoriLogoNakyvyysSpekseista(speksitData) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  const avainSanat = new Set([
    'LOGOTNAKYVYYS', 'LOGOT_NAKYVYYS', 'SPONSORLOGOSVISIBILITY', 'SPONSOR_LOGOS_VISIBILITY',
    'SPONSORLOGONAKYVYYS', 'SPONSOR_LOGO_NAKYVYYS', 'AIKATAULULOGOT', 'AIKATAULU_LOGOT'
  ]);

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());
    const normalisoidut = solut.map((s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, ''));

    for (let i = 0; i < normalisoidut.length; i++) {
      const avain = normalisoidut[i];
      if (!avainSanat.has(avain)) continue;

      const ehdokasArvot = [solut[i + 1], solut[i + 2], ...solut].filter(Boolean);
      for (const ehdokas of ehdokasArvot) {
        const tulkinta = normalisoiSponsoriLogoNakyvyysArvo(ehdokas);
        if (tulkinta) return tulkinta;
      }
    }
  }

  return null;
}

function normalisoiAikatauluRyhmittelyArvo(arvo) {
  const norm = String(arvo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!norm) return null;

  if (['INLINE', 'INLINEAMMUNTA', 'INLINEORDER', 'LANE', 'LANES', 'RADAT', 'RATA'].includes(norm)) return 'inline';
  if (['5', 'GROUP5', 'RYHMA5', 'GROUPSIZE5', 'SIZE5'].includes(norm)) return 'group5';
  if (['6', 'GROUP6', 'RYHMA6', 'GROUPSIZE6', 'SIZE6'].includes(norm)) return 'group6';
  return null;
}

export function haeAikatauluRyhmittelySpekseista(speksitData) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  const avainSanat = new Set([
    'AIKATAULURYHMITTELY', 'AIKATAULU_RYHMITTELY', 'AIKATAULUGROUPING', 'AIKATAULU_GROUPING',
    'TIMETABLEGROUPING', 'TIMETABLE_GROUPING', 'AIKATAULURYHMAKOKO', 'AIKATAULU_RYHMAKOKO',
    'TIMETABLEGROUPSIZE', 'TIMETABLE_GROUP_SIZE', 'GROUPINGMODE', 'GROUPING_MODE'
  ]);

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());
    const normalisoidut = solut.map((s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, ''));

    for (let i = 0; i < normalisoidut.length; i++) {
      const avain = normalisoidut[i];
      if (!avainSanat.has(avain)) continue;

      const ehdokasArvot = [solut[i + 1], solut[i + 2], ...solut].filter(Boolean);
      for (const ehdokas of ehdokasArvot) {
        const tulkinta = normalisoiAikatauluRyhmittelyArvo(ehdokas);
        if (tulkinta) return tulkinta;
      }
    }
  }

  return null;
}

function normalisoiAikatauluMalliArvo(arvo) {
  const norm = String(arvo || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!norm) return null;

  if (['INLINE', 'INLINEVIEW', 'INLINE_LAYOUT', 'INLINE_MALLI', 'INLINE_NAKYMA'].includes(norm)) return 'inline';
  if (['GROUPS', 'GROUP', 'HEATS', 'ERAT', 'ERALUETTELO', 'RYHMAT', 'RYHMA'].includes(norm)) return 'groups';
  return null;
}

export function haeAikatauluMalliSpekseista(speksitData) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  const avainSanat = new Set([
    'AIKATAULUMALLI', 'AIKATAULU_MALLI', 'AIKATAULUNAKYMA', 'AIKATAULU_NAKYMA',
    'TIMETABLEMODEL', 'TIMETABLE_MODEL', 'TIMETABLEVIEW', 'TIMETABLE_VIEW',
    'SCHEDULEMODEL', 'SCHEDULE_MODEL'
  ]);

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());
    const normalisoidut = solut.map((s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, ''));

    for (let i = 0; i < normalisoidut.length; i++) {
      const avain = normalisoidut[i];
      if (!avainSanat.has(avain)) continue;

      const ehdokasArvot = [solut[i + 1], solut[i + 2], ...solut].filter(Boolean);
      for (const ehdokas of ehdokasArvot) {
        const tulkinta = normalisoiAikatauluMalliArvo(ehdokas);
        if (tulkinta) return tulkinta;
      }
    }
  }

  return null;
}
