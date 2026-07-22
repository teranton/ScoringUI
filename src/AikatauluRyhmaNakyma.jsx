import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';

function toSortValue(timeText) {
  const cleaned = String(timeText || '').trim();
  const m = cleaned.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}

function isTimeLike(value) {
  return /(\d{1,2})[:.](\d{2})/.test(String(value || '').trim());
}

function isLaneHeader(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^RATA\s*\d+/.test(text) || /^LANE\s*\d+/.test(text) || /^\d+\s+\S+/.test(text);
}

function extractTitleSuffixFromFirstRow(row) {
  const first = String(row?.[0] || '').trim();
  const second = String(row?.[1] || '').trim();
  if (second) return second;

  const separatorIndex = first.indexOf('|');
  if (separatorIndex === -1) return '';

  return first.slice(separatorIndex + 1).trim();
}

function toShooterNumber(value) {
  const text = String(value || '').trim();
  const m = text.match(/\d+/);
  if (!m) return null;
  const parsed = parseInt(m[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGroupingMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'group6') return 6;
  return 5;
}

function buildNumberGroupMap(laneRows, groupSize) {
  const numberSet = new Set();
  for (const row of laneRows) {
    for (const slot of row.slots || []) {
      const num = toShooterNumber(slot?.number);
      if (num !== null) numberSet.add(num);
    }
  }

  const sorted = Array.from(numberSet).sort((a, b) => a - b);
  const map = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const groupIndex = Math.floor(i / groupSize);
    map.set(sorted[i], groupIndex);
  }
  return map;
}

function getGroupBadgeClass(groupIndex) {
  const classes = [
    'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/35',
    'bg-[hsl(var(--status-ready))]/12 text-[hsl(var(--status-ready))] border-[hsl(var(--status-ready))]/35',
    'bg-[hsl(var(--score-second-fg))]/12 text-[hsl(var(--score-second-fg))] border-[hsl(var(--score-second-fg))]/35',
    'bg-[hsl(var(--rank-3))]/14 text-[hsl(var(--rank-3))] border-[hsl(var(--rank-3))]/35'
  ];
  return classes[groupIndex % classes.length];
}

function getOrderDayClasses(dayNumber, dayLabel) {
  const label = String(dayLabel || '').toUpperCase();
  const isSaturday = dayNumber === 1 || /LAUANTAI|SATURDAY/.test(label);
  const isSunday = dayNumber === 2 || /SUNNUNTAI|SUNDAY/.test(label);

  if (isSaturday) {
    return {
      title: 'text-[hsl(var(--primary))]',
      container: 'border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/[0.03]',
      header: 'bg-[hsl(var(--badge-upcoming-bg))] text-[hsl(var(--badge-upcoming-fg))]'
    };
  }

  if (isSunday) {
    return {
      title: 'text-[hsl(var(--score-second-fg))]',
      container: 'border-[hsl(var(--score-second-fg))]/30 bg-[hsl(var(--score-second-fg))]/[0.03]',
      header: 'bg-[hsl(var(--badge-ongoing-bg))] text-[hsl(var(--badge-ongoing-fg))]'
    };
  }

  return {
    title: 'text-[hsl(var(--foreground))]',
    container: 'border-[hsl(var(--border))]/60 bg-transparent',
    header: 'bg-[hsl(var(--muted))]/15 text-[hsl(var(--muted-foreground))]'
  };
}

function getLayoutColumnClasses(layoutLabel, index) {
  const upper = String(layoutLabel || '').toUpperCase();
  const isOne = /(?:^|[^0-9])1(?:[^0-9]|$)/.test(upper);
  const isTwo = /(?:^|[^0-9])2(?:[^0-9]|$)/.test(upper);

  if (isOne) {
    return {
      head: 'bg-[hsl(var(--badge-upcoming-bg))]/70 text-[hsl(var(--badge-upcoming-fg))]',
      cell: 'bg-[hsl(var(--primary))]/[0.04]'
    };
  }

  if (isTwo) {
    return {
      head: 'bg-[hsl(var(--badge-ongoing-bg))]/70 text-[hsl(var(--badge-ongoing-fg))]',
      cell: 'bg-[hsl(var(--score-second-fg))]/[0.04]'
    };
  }

  const fallback = [
    {
      head: 'bg-[hsl(var(--status-neutral-bg))] text-[hsl(var(--status-neutral-fg))]',
      cell: 'bg-[hsl(var(--status-ready))]/[0.04]'
    },
    {
      head: 'bg-[hsl(var(--badge-paused-bg))] text-[hsl(var(--badge-paused-fg))]',
      cell: 'bg-[hsl(var(--rank-1))]/[0.05]'
    }
  ];

  return fallback[index % fallback.length];
}

function sanitizeName(value) {
  return String(value || '').replace(/\u200B/g, '').trim();
}

function parseCompetitionDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const dot = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) {
    const d = parseInt(dot[1], 10);
    const m = parseInt(dot[2], 10);
    const y = parseInt(dot[3], 10);
    const parsed = new Date(y, m - 1, d);
    if (parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d) {
      return parsed;
    }
    return null;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    const parsed = new Date(y, m - 1, d);
    if (parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d) {
      return parsed;
    }
  }

  return null;
}

function onkoEnsimmainenPaivaOhitettu(competitionStartDate) {
  const start = parseCompetitionDate(competitionStartDate);
  if (!start) return false;

  const paivanLoppu = new Date(start.getTime());
  paivanLoppu.setHours(23, 59, 59, 999);
  return Date.now() > paivanLoppu.getTime();
}

function parseDayMarker(row) {
  if (!Array.isArray(row) || row.length === 0) return null;
  const text = row.map((cell) => String(cell || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const match = text.match(/(?:P[AÄ]IV[AÄ]|DAY)\s*(\d+)/i);
  if (!match) return null;

  return {
    label: text,
    dayNumber: parseInt(match[1], 10)
  };
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/Ä/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/Å/g, 'A')
    .replace(/[^A-Z0-9]/g, '');
}

function findRyhmatHeaderInfo(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const headerIndex = rows.findIndex((row) => Array.isArray(row) && row.some((cell) => normalizeKey(cell) === 'RYHMA'));
  if (headerIndex === -1) return null;

  const headerRow = rows[headerIndex] || [];
  const blockStarts = [];
  for (let i = 0; i < headerRow.length; i++) {
    if (normalizeKey(headerRow[i]) === 'RYHMA') {
      blockStarts.push(i);
    }
  }

  if (blockStarts.length === 0) return null;
  return { headerIndex, blockStarts };
}

function parseGroupsTable(rows) {
  const headerInfo = findRyhmatHeaderInfo(rows);
  if (!headerInfo) return null;

  const { headerIndex, blockStarts } = headerInfo;
  const activeGroupByBlock = new Map();
  const groups = new Map();

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];

    for (const start of blockStarts) {
      const groupCell = String(row[start] || '').trim();
      const bibCell = String(row[start + 1] || '').trim();
      const nameCell = sanitizeName(row[start + 2] || '');
      const classCell = String(row[start + 3] || '').trim();
      const clubCell = String(row[start + 4] || '').trim();

      const parsedGroupNumber = toShooterNumber(groupCell);
      if (parsedGroupNumber !== null) {
        activeGroupByBlock.set(start, parsedGroupNumber);
      }

      const groupNumber = activeGroupByBlock.get(start);
      if (!groupNumber) continue;
      if (!nameCell) continue;

      if (!groups.has(groupNumber)) {
        groups.set(groupNumber, []);
      }

      groups.get(groupNumber).push({
        number: /^\d+$/.test(bibCell) ? bibCell : '',
        shooter: nameCell,
        className: classCell,
        club: clubCell,
        lane: clubCell || '-'
      });
    }
  }

  if (groups.size === 0) return null;
  return { headerIndex, groups };
}

function extractSessionLabel(titleRow, startCol, endCol, fallback) {
  for (let col = startCol; col < endCol; col++) {
    const text = String(titleRow?.[col] || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  for (let col = Math.max(0, startCol - 1); col <= Math.min((titleRow?.length || 0) - 1, endCol); col++) {
    const text = String(titleRow?.[col] || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return fallback;
}

function buildDayMetaFromSessionLabel(label, fallbackDayNumber) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  const upper = text.toUpperCase();
  const knownDays = [
    { keys: ['LAUANTAI', 'SATURDAY'], label: 'Lauantai', dayNumber: 1 },
    { keys: ['SUNNUNTAI', 'SUNDAY'], label: 'Sunnuntai', dayNumber: 2 },
    { keys: ['PERJANTAI', 'FRIDAY'], label: 'Perjantai', dayNumber: 1 },
    { keys: ['MAANANTAI', 'MONDAY'], label: 'Maanantai', dayNumber: 1 }
  ];

  for (const day of knownDays) {
    if (day.keys.some((key) => upper.includes(key))) {
      const shortLabel = text.replace(new RegExp(day.keys[0], 'i'), '').trim() || text;
      return {
        dayKey: `day-${day.dayNumber}`,
        dayLabel: day.label,
        dayNumber: day.dayNumber,
        sessionLabel: text,
        shortSessionLabel: shortLabel
      };
    }
  }

  return {
    dayKey: `day-${fallbackDayNumber}`,
    dayLabel: `${fallbackDayNumber}`,
    dayNumber: fallbackDayNumber,
    sessionLabel: text,
    shortSessionLabel: text
  };
}

function parseCombinedScheduleRows(rows, tx) {
  const parsedGroups = parseGroupsTable(rows);
  if (!parsedGroups) return null;

  const { headerIndex, groups } = parsedGroups;
  const sessions = [];
  const dayOrder = [];
  const dayMetaByKey = new Map();
  let fallbackDayNumber = 1;

  const registerDay = (meta) => {
    if (!dayMetaByKey.has(meta.dayKey)) {
      dayOrder.push(meta.dayKey);
      dayMetaByKey.set(meta.dayKey, {
        key: meta.dayKey,
        label: meta.dayLabel,
        dayNumber: meta.dayNumber,
        order: dayOrder.length - 1
      });
    }
    return dayMetaByKey.get(meta.dayKey);
  };

  for (let rowIndex = 0; rowIndex < headerIndex; rowIndex++) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const startCols = [];

    for (let col = 0; col < row.length; col++) {
      if (normalizeKey(row[col]) === 'START') startCols.push(col);
    }
    if (startCols.length === 0) continue;

    const titleRow = Array.isArray(rows[rowIndex - 1]) ? rows[rowIndex - 1] : [];
    for (let startIdx = 0; startIdx < startCols.length; startIdx++) {
      const startCol = startCols[startIdx];
      const endCol = startIdx < startCols.length - 1 ? startCols[startIdx + 1] : row.length;
      const layoutColumns = [];

      for (let col = startCol + 1; col < endCol; col++) {
        const text = String(row[col] || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        if (normalizeKey(text) === 'START') continue;
        layoutColumns.push({ col, label: text });
      }
      if (layoutColumns.length === 0) continue;

      const label = extractSessionLabel(titleRow, startCol, endCol, `${tx.day} ${fallbackDayNumber}`);
      const dayMeta = buildDayMetaFromSessionLabel(label, fallbackDayNumber);
      registerDay(dayMeta);
      fallbackDayNumber = Math.max(fallbackDayNumber, dayMeta.dayNumber + 1);

      const sessionHeats = [];
      for (let dataRowIndex = rowIndex + 1; dataRowIndex < headerIndex; dataRowIndex++) {
        const dataRow = Array.isArray(rows[dataRowIndex]) ? rows[dataRowIndex] : [];
        if (dataRow.some((cell) => normalizeKey(cell) === 'START')) break;

        const blockValues = dataRow.slice(startCol, endCol).map((cell) => String(cell || '').trim());
        if (blockValues.every((cell) => !cell)) continue;

        const time = String(dataRow[startCol] || '').trim();
        if (!isTimeLike(time)) continue;

        for (const layout of layoutColumns) {
          const groupText = String(dataRow[layout.col] || '').trim();
          const groupNumber = toShooterNumber(groupText);
          if (groupNumber === null) continue;

          sessionHeats.push({
            id: `${dayMeta.dayKey}-${startCol}-${dataRowIndex}-${layout.col}-${groupNumber}`,
            time,
            dayKey: dayMeta.dayKey,
            dayNumber: dayMeta.dayNumber,
            dayLabel: dayMeta.dayLabel,
            sessionLabel: dayMeta.sessionLabel,
            shortSessionLabel: dayMeta.shortSessionLabel,
            layoutLabel: layout.label,
            groupIndex: groupNumber - 1,
            groupLabel: groupNumber,
            shooters: groups.get(groupNumber) || []
          });
        }
      }

      if (sessionHeats.length > 0) {
        sessions.push({
          key: `${dayMeta.dayKey}-${startCol}`,
          dayKey: dayMeta.dayKey,
          dayNumber: dayMeta.dayNumber,
          dayLabel: dayMeta.dayLabel,
          label,
          shortLabel: dayMeta.shortSessionLabel,
          heats: sessionHeats.sort((a, b) => {
            const timeCmp = toSortValue(a.time) - toSortValue(b.time);
            if (timeCmp !== 0) return timeCmp;
            return String(a.layoutLabel).localeCompare(String(b.layoutLabel), 'fi');
          })
        });
      }
    }
  }

  if (sessions.length === 0) {
    const sortedGroupNumbers = Array.from(groups.keys()).sort((a, b) => a - b);
    const heats = sortedGroupNumbers.map((groupNumber, idx) => ({
      id: `group-sheet-${groupNumber}`,
      heatNumber: groupNumber,
      time: '',
      groupIndex: idx,
      groupLabel: groupNumber,
      shooters: groups.get(groupNumber) || []
    }));

    return {
      mode: 'group-sheet',
      titleSuffix: '',
      laneColumns: [],
      laneRows: [],
      heats,
      daySections: [{ key: 'groups', label: tx.group, dayNumber: 1, heats }]
    };
  }

  const sessionCounters = new Map();
  const normalizedSessions = sessions.map((session) => {
    return {
      ...session,
      heats: session.heats.map((heat) => {
        const current = sessionCounters.get(session.key) || 0;
        const next = current + 1;
        sessionCounters.set(session.key, next);

        return {
          ...heat,
          heatNumber: next
        };
      })
    };
  });

  const sectionMap = new Map();
  for (const session of normalizedSessions) {
    if (!sectionMap.has(session.dayKey)) {
      const meta = dayMetaByKey.get(session.dayKey);
      sectionMap.set(session.dayKey, {
        key: session.dayKey,
        label: meta?.label || session.dayLabel,
        dayNumber: meta?.dayNumber || session.dayNumber,
        order: meta?.order ?? Number.MAX_SAFE_INTEGER,
        sessionSections: []
      });
    }
    sectionMap.get(session.dayKey).sessionSections.push(session);
  }

  const daySections = Array.from(sectionMap.values())
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      key: section.key,
      label: section.label,
      dayNumber: section.dayNumber,
      sessionSections: section.sessionSections,
      heats: section.sessionSections.flatMap((session) => session.heats)
    }));

  return {
    mode: 'combined-schedule',
    titleSuffix: extractTitleSuffixFromFirstRow(rows[0] || []),
    laneColumns: [],
    laneRows: [],
    heats: daySections.flatMap((section) => section.heats),
    daySections
  };
}

export default function AikatauluRyhmaNakyma({ rawCsv, locale = 'fi', sponsorLogos = [], showGlobalSponsorLogos = true, defaultGroupingMode = 'group5', competitionStartDate = '' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [combinedTab, setCombinedTab] = useState('groups');
  const [focusedGroupKey, setFocusedGroupKey] = useState('');
  const groupCardRefs = useRef(new Map());
  const tx = locale === 'en'
    ? {
      title: 'Heat Schedule',
      empty: 'No group schedule rows found.',
      heat: 'Heat',
      day: 'Day',
      group: 'Group',
      time: 'Time',
      lane: 'Lane',
      classLabel: 'Class',
      clubLabel: 'Club',
      noShooter: 'No shooters in this heat.',
      number: 'No.',
      shooter: 'Shooter',
      searchPlaceholder: 'Search shooter...',
      clear: 'Clear',
      noSearchResults: 'No matching group found.',
      saturday: 'Saturday',
      sunday: 'Sunday',
      groupsTab: 'Groups',
      orderTab: 'Order',
      orderOnlyTitle: 'Group Order',
      noOrderRows: 'No order rows found.',
      openGroup: 'Open group view'
    }
    : {
      title: 'Eräluettelo',
      empty: 'Ryhmäaikataulurivejä ei löytynyt.',
      heat: 'Erä',
      day: 'Päivä',
      group: 'Ryhmä',
      time: 'Aika',
      lane: 'Rata',
      classLabel: 'Sarja',
      clubLabel: 'Seura',
      noShooter: 'Ei ampujia tässä erässä.',
      number: 'Nro',
      shooter: 'Ampuja',
      searchPlaceholder: 'Hae ampujaa...',
      clear: 'Tyhjennä',
      noSearchResults: 'Haulla ei löytynyt ryhmää.',
      saturday: 'Lauantai',
      sunday: 'Sunnuntai',
      groupsTab: 'Ryhmät',
      orderTab: 'Järjestys',
      orderOnlyTitle: 'Ryhmien järjestys',
      noOrderRows: 'Järjestysrivejä ei löytynyt.',
      openGroup: 'Avaa ryhmänäkymä'
    };

  const parsed = useMemo(() => {
    const rows = parseCsvRows(rawCsv || '');
    if (!Array.isArray(rows) || rows.length < 2) {
      return { mode: 'lane-grid', titleSuffix: '', laneColumns: [], laneRows: [], heats: [], daySections: [] };
    }

    const parsedCombined = parseCombinedScheduleRows(rows, tx);
    if (parsedCombined) return parsedCombined;

    const titleSuffix = extractTitleSuffixFromFirstRow(rows[0] || []);
    const laneHeaderRow = rows.find((row) => Array.isArray(row) && row.some(isLaneHeader));
    const laneColumns = [];

    if (laneHeaderRow) {
      for (let i = 0; i < laneHeaderRow.length; i++) {
        if (!isLaneHeader(laneHeaderRow[i])) continue;
        let startIndex = i;
        if (i > 0 && !isLaneHeader(laneHeaderRow[i - 1])) {
          startIndex = i - 1;
        }
        const rawLabel = String(laneHeaderRow[i]).trim();
        const match = rawLabel.toUpperCase().match(/^(?:RATA|LANE)\s*(\d+\s*.*)/i);
        laneColumns.push({ label: match ? match[1] : rawLabel, startIndex });
      }
    }

    if (laneColumns.length < 2) {
      return { mode: 'lane-grid', titleSuffix, laneColumns: [], laneRows: [], heats: [], daySections: [] };
    }

    const laneRows = [];
    const dayOrder = [];
    const dayMetaByKey = new Map();
    let currentDayKey = 'day-1';
    dayOrder.push(currentDayKey);
    dayMetaByKey.set(currentDayKey, {
      key: currentDayKey,
      label: `${tx.day} 1`,
      dayNumber: 1,
      order: 0
    });

    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;

      const dayMarker = parseDayMarker(row);
      if (dayMarker) {
        const markerNumber = Number.isInteger(dayMarker.dayNumber) ? dayMarker.dayNumber : (dayOrder.length + 1);
        const dayKey = `day-${markerNumber}`;
        currentDayKey = dayKey;
        if (!dayMetaByKey.has(dayKey)) {
          dayOrder.push(dayKey);
          dayMetaByKey.set(dayKey, {
            key: dayKey,
            label: dayMarker.label || `${tx.day} ${markerNumber}`,
            dayNumber: markerNumber,
            order: dayOrder.length - 1
          });
        } else {
          const prev = dayMetaByKey.get(dayKey);
          dayMetaByKey.set(dayKey, {
            ...prev,
            label: dayMarker.label || prev.label
          });
        }
      }

      const laneSlots = laneColumns.map((lane) => {
        const rawTime = String(row[lane.startIndex] || '').trim();
        const number = String(row[lane.startIndex + 1] || '').trim();
        const shooter = String(row[lane.startIndex + 2] || '').trim();
        return { lane: lane.label, time: rawTime, number, shooter };
      });

      const hasAnyShooter = laneSlots.some((slot) => slot.shooter);
      const globalTimeSlot = laneSlots.find((slot) => isTimeLike(slot.time));
      if (!hasAnyShooter || !globalTimeSlot) return;

      const rowTime = globalTimeSlot.time;
      const finalizedSlots = laneSlots.map((slot) => ({
        ...slot,
        time: isTimeLike(slot.time) ? slot.time : rowTime
      }));

      laneRows.push({ id: `${rowIndex}-${rowTime}`, time: rowTime, slots: finalizedSlots, dayKey: currentDayKey });
    });

    laneRows.sort((a, b) => {
      const aOrder = dayMetaByKey.get(a.dayKey)?.order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = dayMetaByKey.get(b.dayKey)?.order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return toSortValue(a.time) - toSortValue(b.time);
    });

    const groupSize = parseGroupingMode(defaultGroupingMode);
    const numberGroupMap = buildNumberGroupMap(laneRows, groupSize);

    const heatItems = [];
    for (const row of laneRows) {
      const perGroup = new Map();

      for (const slot of row.slots || []) {
        const shooter = sanitizeName(slot.shooter);
        if (!shooter) continue;

        const number = toShooterNumber(slot.number);
        const groupIndex = number !== null && numberGroupMap.has(number)
          ? numberGroupMap.get(number)
          : 0;

        if (!perGroup.has(groupIndex)) perGroup.set(groupIndex, []);
        perGroup.get(groupIndex).push({
          lane: slot.lane,
          number: slot.number,
          shooter
        });
      }

      for (const [groupIndex, shooters] of perGroup.entries()) {
        const sortedShooters = [...shooters].sort((a, b) => {
          const aNum = toShooterNumber(a.number);
          const bNum = toShooterNumber(b.number);
          if (aNum === null && bNum === null) return String(a.shooter).localeCompare(String(b.shooter), 'fi');
          if (aNum === null) return 1;
          if (bNum === null) return -1;
          return aNum - bNum;
        });

        heatItems.push({
          id: `${row.id}-g${groupIndex}`,
          time: row.time,
          dayKey: row.dayKey,
          groupIndex,
          groupLabel: groupIndex + 1,
          shooters: sortedShooters
        });
      }
    }

    heatItems.sort((a, b) => {
      const aOrder = dayMetaByKey.get(a.dayKey)?.order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = dayMetaByKey.get(b.dayKey)?.order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const timeCmp = toSortValue(a.time) - toSortValue(b.time);
      if (timeCmp !== 0) return timeCmp;
      return a.groupIndex - b.groupIndex;
    });

    const heatCountersByDay = new Map();
    const heats = heatItems.map((heat) => {
      const current = heatCountersByDay.get(heat.dayKey) || 0;
      const next = current + 1;
      heatCountersByDay.set(heat.dayKey, next);
      return {
        ...heat,
        heatNumber: next
      };
    });

    const sectionMap = new Map();
    for (const heat of heats) {
      if (!sectionMap.has(heat.dayKey)) {
        const meta = dayMetaByKey.get(heat.dayKey);
        sectionMap.set(heat.dayKey, {
          key: heat.dayKey,
          label: meta?.label || `${tx.day}`,
          dayNumber: meta?.dayNumber || null,
          order: meta?.order ?? Number.MAX_SAFE_INTEGER,
          heats: []
        });
      }
      sectionMap.get(heat.dayKey).heats.push(heat);
    }

    const daySections = Array.from(sectionMap.values())
      .sort((a, b) => a.order - b.order)
      .map((section) => ({
        key: section.key,
        label: section.label,
        dayNumber: section.dayNumber,
        heats: section.heats
      }));

    return { mode: 'lane-grid', titleSuffix, laneColumns, laneRows, heats, daySections };
  }, [rawCsv, defaultGroupingMode, tx.day]);

  const laneLogoMap = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(parsed.laneColumns) || sponsorLogos.length === 0) return map;

    parsed.laneColumns.forEach((lane) => {
      const laneText = String(lane?.label || '').trim().toUpperCase();
      if (!laneText) {
        map.set(lane?.label || '', null);
        return;
      }

      const match = sponsorLogos.find((logo) => {
        const logoKey = String(logo?.alt || '').trim().toUpperCase();
        if (!logoKey) return false;
        return laneText.includes(logoKey);
      }) || null;

      map.set(lane.label, match);
    });

    return map;
  }, [parsed.laneColumns, sponsorLogos]);

  const globalSponsorLogos = useMemo(() => {
    if (!showGlobalSponsorLogos) return [];
    return sponsorLogos.filter((logo) => {
      const logoKey = String(logo?.alt || '').trim().toUpperCase();
      if (!logoKey) return true;
      return !parsed.laneColumns?.some((lane) => String(lane?.label || '').toUpperCase().includes(logoKey));
    });
  }, [parsed.laneColumns, sponsorLogos, showGlobalSponsorLogos]);

  const visibleDaySections = useMemo(() => {
    if (!Array.isArray(parsed.daySections) || parsed.daySections.length === 0) return [];
    if (parsed.mode === 'group-sheet') return parsed.daySections;
    if (parsed.daySections.length < 2) return parsed.daySections;
    if (!onkoEnsimmainenPaivaOhitettu(competitionStartDate)) return parsed.daySections;

    const withoutDayOne = parsed.daySections.filter((section) => section.dayNumber !== 1);
    return withoutDayOne.length > 0 ? withoutDayOne : parsed.daySections;
  }, [parsed.daySections, competitionStartDate]);

  if (!visibleDaySections.length) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.empty}</div>;
  }

  const title = parsed.titleSuffix ? `${tx.title} | ${parsed.titleSuffix}` : tx.title;
  const naytaSarjaSarake = visibleDaySections.some((section) =>
    (section.heats || []).some((heat) => (heat.shooters || []).some((shooter) => Boolean(shooter.className)))
  );
  const naytaSeuraSarake = visibleDaySections.some((section) =>
    (section.heats || []).some((heat) => (heat.shooters || []).some((shooter) => Boolean(shooter.club || shooter.lane)))
  );
  const yhdistetytRyhmaKortit = useMemo(() => {
    if (parsed.mode !== 'combined-schedule') return [];

    const byGroup = new Map();
    for (const section of visibleDaySections) {
      for (const session of section.sessionSections || []) {
        for (const heat of session.heats || []) {
          const groupKey = String(heat.groupLabel ?? heat.groupIndex ?? '');
          if (!groupKey) continue;

          if (!byGroup.has(groupKey)) {
            byGroup.set(groupKey, {
              key: `group-${groupKey}`,
              groupLabel: heat.groupLabel ?? heat.groupIndex + 1,
              groupIndex: heat.groupIndex,
              shooters: heat.shooters || [],
              scheduleRows: []
            });
          }

          byGroup.get(groupKey).scheduleRows.push({
            id: heat.id,
            dayNumber: section.dayNumber,
            dayLabel: section.label,
            sessionLabel: session.shortLabel || session.label || '',
            time: heat.time || '',
            layoutLabel: heat.layoutLabel || ''
          });
        }
      }
    }

    return Array.from(byGroup.values())
      .map((group) => ({
        ...group,
        scheduleRows: group.scheduleRows.sort((a, b) => {
          const dayCmp = String(a.dayLabel).localeCompare(String(b.dayLabel), 'fi');
          if (dayCmp !== 0) return dayCmp;
          const timeCmp = toSortValue(a.time) - toSortValue(b.time);
          if (timeCmp !== 0) return timeCmp;
          return String(a.layoutLabel).localeCompare(String(b.layoutLabel), 'fi');
        })
      }))
      .sort((a, b) => Number(a.groupLabel) - Number(b.groupLabel));
  }, [parsed.mode, visibleDaySections]);
  const filteredYhdistetytRyhmaKortit = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return yhdistetytRyhmaKortit;
    return yhdistetytRyhmaKortit.filter((group) =>
      (group.shooters || []).some((shooter) => String(shooter.shooter || '').toLowerCase().includes(query))
    );
  }, [yhdistetytRyhmaKortit, searchQuery]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  useLayoutEffect(() => {
    if (combinedTab !== 'groups' || !focusedGroupKey) return;
    let raf1 = 0;
    let raf2 = 0;

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        const el = groupCardRefs.current.get(focusedGroupKey);
        if (!el) return;
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    });

    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [combinedTab, focusedGroupKey, filteredYhdistetytRyhmaKortit]);
  const ryhmaJarjestysTaulukko = useMemo(() => {
    if (parsed.mode !== 'combined-schedule') {
      return { dayTables: [] };
    }

    const paivaosiot = [...visibleDaySections].sort((a, b) => {
      const aNum = Number.isFinite(a.dayNumber) ? a.dayNumber : Number.MAX_SAFE_INTEGER;
      const bNum = Number.isFinite(b.dayNumber) ? b.dayNumber : Number.MAX_SAFE_INTEGER;
      if (aNum !== bNum) return aNum - bNum;
      return String(a.label || '').localeCompare(String(b.label || ''), 'fi');
    });

    return {
      dayTables: paivaosiot.map((section) => {
        const layoutOrder = [];
        const rowsByTime = new Map();

        for (const session of section.sessionSections || []) {
          for (const heat of session.heats || []) {
            const layoutLabel = String(heat.layoutLabel || '-').trim() || '-';
            if (!layoutOrder.includes(layoutLabel)) layoutOrder.push(layoutLabel);

            const time = String(heat.time || '').trim() || '—';
            if (!rowsByTime.has(time)) {
              rowsByTime.set(time, {
                time,
                sortKey: toSortValue(time),
                byLayout: new Map()
              });
            }

            const row = rowsByTime.get(time);
            if (!row.byLayout.has(layoutLabel)) row.byLayout.set(layoutLabel, []);
            row.byLayout.get(layoutLabel).push(heat.groupLabel);
          }
        }

        const rows = Array.from(rowsByTime.values())
          .sort((a, b) => {
            if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
            return String(a.time).localeCompare(String(b.time), 'fi');
          })
          .map((row) => ({
            time: row.time,
            layouts: layoutOrder.map((layoutLabel) => ({
              layoutLabel,
              groups: (row.byLayout.get(layoutLabel) || []).slice().sort((a, b) => Number(a) - Number(b))
            }))
          }));

        return {
          key: section.key,
          dayNumber: section.dayNumber,
          dayLabel: section.label,
          layouts: layoutOrder,
          rows
        };
      })
    };
  }, [parsed.mode, visibleDaySections]);

  const avaaRyhmanakyma = (groupLabel) => {
    const key = `group-${groupLabel}`;
    setSearchQuery('');
    setFocusedGroupKey(key);

    if (combinedTab === 'groups') {
      const el = groupCardRefs.current.get(key);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      return;
    }

    setCombinedTab('groups');
  };

  return (
    <div className="space-y-3">
      <Card className="w-full shadow-sm">
        <CardHeader className="pb-3 bg-[hsl(var(--muted))]/20 border-b">
          <div className="flex items-center gap-3">
            <CardTitle className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</CardTitle>
            {showGlobalSponsorLogos && globalSponsorLogos.length > 0 && (
              <div className="flex max-w-[62%] shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {globalSponsorLogos.map((logo, idx) => (
                  logo.href ? (
                    <a key={`group-sponsor-global-${idx}`} href={logo.href} target="_blank" rel="noopener noreferrer" className="flex items-center hover:opacity-75 transition-opacity">
                      <img
                        src={logo.src}
                        alt={logo.alt}
                        loading="lazy"
                        decoding="async"
                        className="h-6 max-w-[84px] object-contain opacity-90"
                      />
                    </a>
                  ) : (
                    <img
                      key={`group-sponsor-global-${idx}`}
                      src={logo.src}
                      alt={logo.alt}
                      loading="lazy"
                      decoding="async"
                      className="h-6 max-w-[84px] object-contain opacity-90"
                    />
                  )
                ))}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-3 md:p-4">
          {parsed.mode === 'combined-schedule' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCombinedTab('groups');
                    setFocusedGroupKey('');
                  }}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${combinedTab === 'groups' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                >
                  {tx.groupsTab}
                </button>
                <button
                  type="button"
                  onClick={() => setCombinedTab('order')}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${combinedTab === 'order' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                >
                  {tx.orderTab}
                </button>
              </div>

              {combinedTab === 'groups' && (
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder={tx.searchPlaceholder}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 pr-20 text-sm text-[hsl(var(--foreground))] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/50"
                  />
                  {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-[hsl(var(--muted))]/50 px-1.5 py-0.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    {tx.clear}
                  </button>
                  )}
                </div>
              )}

              {combinedTab === 'groups' && filteredYhdistetytRyhmaKortit.length === 0 ? (
                <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-3 py-5 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  {tx.noSearchResults}
                </div>
              ) : combinedTab === 'groups' ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredYhdistetytRyhmaKortit.map((group) => {
                const lauantaiRivit = (group.scheduleRows || []).filter((slot) =>
                  slot.dayNumber === 1 || /LAUANTAI|SATURDAY/i.test(String(slot.dayLabel || ''))
                );
                const sunnuntaiRivit = (group.scheduleRows || []).filter((slot) =>
                  slot.dayNumber === 2 || /SUNNUNTAI|SUNDAY/i.test(String(slot.dayLabel || ''))
                );
                const rivit = Math.max(lauantaiRivit.length, sunnuntaiRivit.length);
                const viikonloppuRivit = Array.from({ length: rivit }, (_, idx) => ({
                  lauantai: lauantaiRivit[idx] || null,
                  sunnuntai: sunnuntaiRivit[idx] || null
                }));

                return (
                <article
                  key={group.key}
                  ref={(node) => {
                    if (node) groupCardRefs.current.set(group.key, node);
                    else groupCardRefs.current.delete(group.key);
                  }}
                  className={`overflow-hidden rounded-xl border bg-[hsl(var(--card))] shadow-sm ${focusedGroupKey === group.key ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]/20' : 'border-[hsl(var(--border))]'}`}
                >
                  <header className="border-b border-[hsl(var(--border))]/60 px-3 py-2 bg-[hsl(var(--muted))]/20">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[hsl(var(--foreground))]">
                        {tx.group} {group.groupLabel}
                      </h3>
                    </div>
                  </header>

                  <div className="border-b border-[hsl(var(--border))]/45 px-3 py-2">
                    <div className="overflow-hidden">
                      <table className="w-full table-fixed border-collapse text-[11px] md:text-xs">
                        <thead>
                          <tr>
                            <th className="w-1/2 bg-[hsl(var(--badge-upcoming-bg))] px-1.5 py-1 text-left font-semibold text-[hsl(var(--badge-upcoming-fg))] md:px-2">{tx.saturday}</th>
                            <th className="w-1/2 bg-[hsl(var(--badge-ongoing-bg))] px-1.5 py-1 text-left font-semibold text-[hsl(var(--badge-ongoing-fg))] md:px-2">{tx.sunday}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viikonloppuRivit.length === 0 ? (
                            <tr className="border-t border-[hsl(var(--border))]/45">
                              <td className="bg-[hsl(var(--badge-upcoming-bg))]/35 px-1.5 py-1.5 text-[hsl(var(--badge-upcoming-fg))] md:px-2">-</td>
                              <td className="bg-[hsl(var(--badge-ongoing-bg))]/35 px-1.5 py-1.5 text-[hsl(var(--badge-ongoing-fg))] md:px-2">-</td>
                            </tr>
                          ) : (
                            viikonloppuRivit.map((row, idx) => (
                              <tr key={`${group.key}-weekend-${idx}`} className="border-t border-[hsl(var(--border))]/45">
                                <td className="bg-[hsl(var(--badge-upcoming-bg))]/35 px-1.5 py-1.5 align-top md:px-2">
                                  {row.lauantai ? (
                                    <div className="truncate text-[10px] leading-tight text-[hsl(var(--foreground))] md:text-[11px]">
                                      <span className="font-semibold">{row.lauantai.time || '—'}</span>
                                      <span className="text-[hsl(var(--muted-foreground))]">{` · ${row.lauantai.layoutLabel || '—'}`}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[hsl(var(--muted-foreground))]">-</span>
                                  )}
                                </td>
                                <td className="bg-[hsl(var(--badge-ongoing-bg))]/35 px-1.5 py-1.5 align-top md:px-2">
                                  {row.sunnuntai ? (
                                    <div className="truncate text-[10px] leading-tight text-[hsl(var(--foreground))] md:text-[11px]">
                                      <span className="font-semibold">{row.sunnuntai.time || '—'}</span>
                                      <span className="text-[hsl(var(--muted-foreground))]">{` · ${row.sunnuntai.layoutLabel || '—'}`}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[hsl(var(--muted-foreground))]">-</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--muted))]/15 text-[hsl(var(--muted-foreground))]">
                          <th className="w-12 px-2 py-1 text-left font-semibold">{tx.number}</th>
                          <th className="px-2 py-1 text-left font-semibold">{tx.shooter}</th>
                          {naytaSarjaSarake && <th className="w-14 px-2 py-1 text-left font-semibold">{tx.classLabel}</th>}
                          {naytaSeuraSarake && <th className="w-16 px-2 py-1 text-left font-semibold">{tx.clubLabel}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {group.shooters.map((shooter, idx) => {
                          const highlighted = normalizedSearchQuery
                            && String(shooter.shooter || '').toLowerCase().includes(normalizedSearchQuery);
                          return (
                          <tr key={`${group.key}-shooter-${idx}`} className={`border-t border-[hsl(var(--border))]/45 ${highlighted ? 'bg-[hsl(var(--primary))]/10' : ''}`}>
                            <td className="px-2 py-1.5 font-mono">{shooter.number || '-'}</td>
                            <td className="px-2 py-1.5 font-medium text-[hsl(var(--foreground))]">{shooter.shooter}</td>
                            {naytaSarjaSarake && <td className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">{shooter.className || '—'}</td>}
                            {naytaSeuraSarake && <td className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">{shooter.club || '—'}</td>}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
                );
              })}
            </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                  <div className="border-b border-[hsl(var(--border))]/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {tx.orderOnlyTitle}
                  </div>
                  {ryhmaJarjestysTaulukko.dayTables.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">{tx.noOrderRows}</div>
                  ) : (
                    <div className="space-y-4 p-3">
                      {ryhmaJarjestysTaulukko.dayTables.map((dayTable) => {
                        const dayClasses = getOrderDayClasses(dayTable.dayNumber, dayTable.dayLabel);
                        return (
                        <section key={dayTable.key} className="space-y-2">
                          <h4 className={`text-sm font-semibold ${dayClasses.title}`}>{dayTable.dayLabel}</h4>
                          <div className={`overflow-x-auto rounded-lg border ${dayClasses.container}`}>
                            <table className="w-full min-w-[520px] border-collapse text-xs">
                              <thead>
                                <tr className={dayClasses.header}>
                                  <th className="w-20 px-2 py-1 text-left font-semibold">{tx.time}</th>
                                  {dayTable.layouts.map((layoutLabel, layoutIndex) => {
                                    const layoutClasses = getLayoutColumnClasses(layoutLabel, layoutIndex);
                                    return (
                                    <th key={`${dayTable.key}-${layoutLabel}`} className={`px-2 py-1 text-left font-semibold ${layoutClasses.head}`}>{layoutLabel}</th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {dayTable.rows.length === 0 ? (
                                  <tr className="border-t border-[hsl(var(--border))]/45">
                                    <td colSpan={Math.max(2, dayTable.layouts.length + 1)} className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">-</td>
                                  </tr>
                                ) : (
                                  dayTable.rows.map((row, idx) => (
                                    <tr key={`${dayTable.key}-order-${idx}`} className="border-t border-[hsl(var(--border))]/45">
                                      <td className="px-2 py-1.5 font-semibold text-[hsl(var(--foreground))]">{row.time || '—'}</td>
                                      {row.layouts.map((layoutCell, layoutIndex) => {
                                        const layoutClasses = getLayoutColumnClasses(layoutCell.layoutLabel, layoutIndex);
                                        return (
                                        <td key={`${dayTable.key}-${row.time}-${layoutCell.layoutLabel}`} className={`px-2 py-1.5 ${layoutClasses.cell}`}>
                                          {layoutCell.groups.length > 0
                                            ? (
                                              <div className="flex flex-wrap gap-1">
                                                {layoutCell.groups.map((groupLabel) => (
                                                  <button
                                                    key={`${dayTable.key}-${row.time}-${layoutCell.layoutLabel}-${groupLabel}`}
                                                    type="button"
                                                    onClick={() => avaaRyhmanakyma(groupLabel)}
                                                    className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/45 hover:bg-[hsl(var(--primary))]/10"
                                                    title={tx.openGroup}
                                                  >
                                                    {tx.group} {groupLabel}
                                                  </button>
                                                ))}
                                              </div>
                                            )
                                            : '-'}
                                        </td>
                                        );
                                      })}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
          <div className="space-y-4">
            {visibleDaySections.map((section) => (
              <section key={section.key} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{section.label}</h3>
                {(section.sessionSections || [{ key: `${section.key}-all`, label: '', shortLabel: '', heats: section.heats }]).map((session) => (
                  <div key={session.key} className="space-y-2">
                    {session.shortLabel && session.shortLabel !== section.label && (
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{session.shortLabel}</h4>
                    )}
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {session.heats.map((heat) => (
                    <article key={heat.id} className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                      <header className="border-b border-[hsl(var(--border))]/60 px-3 py-2 bg-[hsl(var(--muted))]/20">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[hsl(var(--foreground))]">
                            {parsed.mode === 'combined-schedule'
                              ? `${heat.layoutLabel || tx.heat}${heat.time ? ` - ${heat.time}` : ''}`
                              : `${tx.heat} ${heat.heatNumber}${heat.time ? ` - ${heat.time}` : ''}`}
                          </h3>
                          <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${getGroupBadgeClass(heat.groupIndex)}`}>
                            {tx.group} {heat.groupLabel ?? (heat.groupIndex + 1)}
                          </span>
                        </div>
                      </header>

                      {heat.shooters.length === 0 ? (
                        <div className="px-3 py-3 text-xs italic text-[hsl(var(--muted-foreground))]">{tx.noShooter}</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-xs">
                            <thead>
                              <tr className="bg-[hsl(var(--muted))]/15 text-[hsl(var(--muted-foreground))]">
                                <th className="w-12 px-2 py-1 text-left font-semibold">{tx.number}</th>
                                <th className="px-2 py-1 text-left font-semibold">{tx.shooter}</th>
                                {naytaSarjaSarake && <th className="w-14 px-2 py-1 text-left font-semibold">{tx.classLabel}</th>}
                                {naytaSeuraSarake && <th className="w-16 px-2 py-1 text-left font-semibold">{parsed.mode === 'combined-schedule' || parsed.mode === 'group-sheet' ? tx.clubLabel : tx.lane}</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {heat.shooters.map((shooter, idx) => {
                                const laneLogo = laneLogoMap.get(shooter.lane);
                                const highlighted = normalizedSearchQuery
                                  && String(shooter.shooter || '').toLowerCase().includes(normalizedSearchQuery);
                                return (
                                  <tr key={`${heat.id}-row-${idx}`} className={`border-t border-[hsl(var(--border))]/45 ${highlighted ? 'bg-[hsl(var(--primary))]/10' : ''}`}>
                                    <td className="px-2 py-1.5 font-mono">{shooter.number || '-'}</td>
                                    <td className="px-2 py-1.5 font-medium text-[hsl(var(--foreground))]">{shooter.shooter}</td>
                                    {naytaSarjaSarake && <td className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">{shooter.className || '—'}</td>}
                                    {naytaSeuraSarake && <td className="px-2 py-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="truncate">{shooter.club || shooter.lane || '-'}</span>
                                        {(!shooter.club && laneLogo) && (
                                          laneLogo.href ? (
                                            <a href={laneLogo.href} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:opacity-75 transition-opacity">
                                              <img src={laneLogo.src} alt={laneLogo.alt} loading="lazy" decoding="async" className="h-4 max-w-[46px] object-contain opacity-80" />
                                            </a>
                                          ) : (
                                            <img src={laneLogo.src} alt={laneLogo.alt} loading="lazy" decoding="async" className="h-4 max-w-[46px] object-contain opacity-80 shrink-0" />
                                          )
                                        )}
                                      </div>
                                    </td>}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </article>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
