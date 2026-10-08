// src/utils/aikatauluRyhmat.js
import { parseCsvRows } from './csv.js';
import { parsiPaivamaara } from './kisaStatus.js';

export function toSortValue(timeText) {
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

function sanitizeName(value) {
  return String(value || '').replace(/\u200B/g, '').trim();
}

export function onkoEnsimmainenPaivaOhitettu(competitionStartDate, nyt = new Date()) {
  const start = parsiPaivamaara(competitionStartDate);
  if (!start) return false;

  const paivanLoppu = new Date(start.getTime());
  paivanLoppu.setHours(23, 59, 59, 999);
  return nyt.getTime() > paivanLoppu.getTime();
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


export function parseAikatauluRyhmat(rawCsv, defaultGroupingMode, tx) {
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
}

export function suodataNakyvatPaivaosiot(daySections, mode, competitionStartDate, nyt = new Date()) {
  if (!Array.isArray(daySections) || daySections.length === 0) return [];
  if (mode === 'group-sheet') return daySections;
  if (daySections.length < 2) return daySections;
  if (!onkoEnsimmainenPaivaOhitettu(competitionStartDate, nyt)) return daySections;

  const withoutDayOne = daySections.filter((section) => section.dayNumber !== 1);
  return withoutDayOne.length > 0 ? withoutDayOne : daySections;
}

export function muodostaYhdistetytRyhmaKortit(mode, visibleDaySections) {
  if (mode !== 'combined-schedule') return [];

  const byGroup = new Map();
  // Vuorot järjestetään taulukon järjestyksessä: päivän nimi ei kerro järjestystä, ja
  // perjantai, lauantai ja maanantai saavat kaikki päivänumeron 1.
  let sessionOrder = 0;
  for (const section of visibleDaySections) {
    for (const session of section.sessionSections || []) {
      sessionOrder += 1;
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
          dayKey: heat.dayKey,
          dayNumber: section.dayNumber,
          dayLabel: section.label,
          sessionLabel: session.shortLabel || session.label || '',
          time: heat.time || '',
          layoutLabel: heat.layoutLabel || '',
          sessionOrder
        });
      }
    }
  }

  return Array.from(byGroup.values())
    .map((group) => ({
      ...group,
      scheduleRows: group.scheduleRows.sort((a, b) => {
        if (a.sessionOrder !== b.sessionOrder) return a.sessionOrder - b.sessionOrder;
        const timeCmp = toSortValue(a.time) - toSortValue(b.time);
        if (timeCmp !== 0) return timeCmp;
        return String(a.layoutLabel).localeCompare(String(b.layoutLabel), 'fi');
      })
    }))
    .sort((a, b) => Number(a.groupLabel) - Number(b.groupLabel));
}

export function muodostaRyhmaJarjestysTaulukko(mode, visibleDaySections) {
  if (mode !== 'combined-schedule') {
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
            groups: Array.from(new Set((row.byLayout.get(layoutLabel) || []).slice().sort((a, b) => Number(a) - Number(b))))
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
}
