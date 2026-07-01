import { useCallback, useMemo, useRef } from 'react';
import { parseCsvRows } from './utils/csv';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';

function normalizeHeader(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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
  return /^RATA\s*\d+$/.test(text) || /^LANE\s*\d+$/.test(text);
}

function toShooterNumber(value) {
  const text = String(value || '').trim();
  const m = text.match(/\d+/);
  if (!m) return null;
  const parsed = parseInt(m[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildGroupMeta(laneRows, laneCount) {
  const numberSet = new Set();

  for (const row of laneRows) {
    for (const slot of row.slots || []) {
      const shooterNumber = toShooterNumber(slot?.number);
      if (shooterNumber === null) continue;
      numberSet.add(shooterNumber);
    }
  }

  if (numberSet.size === 0) {
    return { numberGroupMap: new Map(), groupCount: 0, groupRanges: [] };
  }

  const numbers = Array.from(numberSet).sort((a, b) => a - b);
  const totalCount = numbers.length;
  const groupCount = Math.max(1, Math.min(laneCount || 1, totalCount));
  const baseSize = Math.floor(totalCount / groupCount);
  const extra = totalCount % groupCount;

  const groupRanges = [];
  let cursor = 0;
  for (let groupIdx = 0; groupIdx < groupCount; groupIdx++) {
    const size = baseSize + (groupIdx < extra ? 1 : 0);
    const start = numbers[cursor];
    const end = numbers[cursor + size - 1];
    groupRanges.push({ start, end });
    cursor += size;
  }

  const numberGroupMap = new Map();
  let rangeIdx = 0;
  for (const n of numbers) {
    while (rangeIdx < groupRanges.length - 1 && n > groupRanges[rangeIdx].end) {
      rangeIdx += 1;
    }
    numberGroupMap.set(n, rangeIdx);
  }

  return { numberGroupMap, groupCount, groupRanges };
}

function getGroupCellStyle(groupIndex) {
  const palettes = [
    { bg: 'hsl(var(--primary) / 0.16)', border: 'hsl(var(--primary) / 0.5)' },
    { bg: 'hsl(var(--score-second-fg) / 0.14)', border: 'hsl(var(--score-second-fg) / 0.45)' },
    { bg: 'hsl(var(--status-ready) / 0.14)', border: 'hsl(var(--status-ready) / 0.45)' },
    { bg: 'hsl(var(--rank-1) / 0.18)', border: 'hsl(var(--rank-1) / 0.5)' },
    { bg: 'hsl(var(--rank-3) / 0.16)', border: 'hsl(var(--rank-3) / 0.48)' },
    { bg: 'hsl(var(--ratko-fg) / 0.14)', border: 'hsl(var(--ratko-fg) / 0.44)' }
  ];
  const style = palettes[groupIndex % palettes.length];
  return {
    backgroundColor: style.bg,
    borderLeftColor: style.border
  };
}

export default function AikatauluNakyma({ rawCsv, locale = 'fi' }) {
  const laneScrollRef = useRef(null);
  const laneDragRef = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false
  });

  const handleLanePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const container = laneScrollRef.current;
    if (!container) return;

    const interactive = event.target.closest('button,a,input,textarea,select,label');
    if (interactive) return;

    laneDragRef.current.isDown = true;
    laneDragRef.current.startX = event.clientX;
    laneDragRef.current.scrollLeft = container.scrollLeft;
    laneDragRef.current.moved = false;

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, []);

  const handleLanePointerMove = useCallback((event) => {
    const container = laneScrollRef.current;
    const state = laneDragRef.current;
    if (!container || !state.isDown) return;

    const deltaX = event.clientX - state.startX;
    if (Math.abs(deltaX) > 3) {
      state.moved = true;
    }

    container.scrollLeft = state.scrollLeft - deltaX;
    event.preventDefault();
  }, []);

  const handleLanePointerUp = useCallback((event) => {
    laneDragRef.current.isDown = false;
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore if capture was not active.
      }
    }
  }, []);

  const handleLaneClickCapture = useCallback((event) => {
    if (!laneDragRef.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    laneDragRef.current.moved = false;
  }, []);

  const tx = locale === 'en'
    ? {
      title: 'Timetable',
      empty: 'No timetable rows found.',
      lane: 'Lane',
      time: 'Time',
      group: 'Group',
      end: 'End',
      event: 'Event',
      location: 'Location',
      notes: 'Notes'
    }
    : {
      title: 'Aikataulu',
      empty: 'Aikataulurivejä ei löytynyt.',
      lane: 'Rata',
      time: 'Aika',
      group: 'Ryhmä',
      end: 'Loppu',
      event: 'Tapahtuma',
      location: 'Paikka',
      notes: 'Lisätieto'
    };

  const parsed = useMemo(() => {
    const rows = parseCsvRows(rawCsv || '');
    if (!Array.isArray(rows) || rows.length < 2) {
      return { mode: 'empty', titleSuffix: '', events: [], laneColumns: [], laneRows: [] };
    }

    const titleRow = rows[0] || [];
    const titleSuffix = String(titleRow[1] || '').trim();

    const laneHeaderRow = rows.find((row) => Array.isArray(row) && row.some(isLaneHeader));
    const laneColumns = [];

    if (laneHeaderRow) {
      for (let i = 0; i < laneHeaderRow.length; i++) {
        if (!isLaneHeader(laneHeaderRow[i])) continue;

        // KORJAUS: Koska "RATA X" teksti on aina numeron/ampujan yläpuolella,
        // ja sitä edeltää (tai pitäisi edeltää) aika-sarake,
        // pakotetaan blokin alkukohdaksi i - 1, jos edellinen sarake ei ole edellisen radan aluetta.
        // Turvallisinta on katsoa, onko kyseessä Rata 1 (yleensä alkaa sarakkeesta 0 tai 1)
        // tai laskea indeksit suoraan:
        let startIndex = i;

        // Jos "RATA" otsikon solu on tyhjä sen vasemmalta puolelta (aika), 
        // siirretään aloitusta yksi taaksepäin, jotta saadaan koko 3 sarakkeen paketti [aika, nro, ampuja]
        if (i > 0 && !isLaneHeader(laneHeaderRow[i - 1])) {
          // Tarkistetaan ettei hypätä edellisen radan päälle
          startIndex = i - 1;
        }

        laneColumns.push({
          label: String(laneHeaderRow[i]).trim(),
          startIndex
        });
      }
    }

    if (laneColumns.length >= 2) {
      const laneRows = [];

      rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) return;

        const laneSlots = laneColumns.map((lane) => {
          // Luetaan arvot tiukasti suhteessa lukittuun aloitushakemistoon
          const rawTime = String(row[lane.startIndex] || '').trim();
          const number = String(row[lane.startIndex + 1] || '').trim();
          const shooter = String(row[lane.startIndex + 2] || '').trim();

          // Jos tällä radalla ei ole omaa aikaa (tyhjä solu), se perii sen myöhemmin rivin yleisestä ajasta
          return {
            lane: lane.label,
            time: rawTime,
            number,
            shooter
          };
        });

        const hasAnyShooter = laneSlots.some((slot) => slot.shooter);
        // Etsitään riviltä mikä tahansa validi kellonaika
        const globalTimeSlot = laneSlots.find((slot) => isTimeLike(slot.time));

        if (!hasAnyShooter || !globalTimeSlot) return;

        const rowTime = globalTimeSlot.time;

        // Korjataan sloteille puuttuvat kellonajat, jos sarakkeessa oli tyhjää
        const finalizedSlots = laneSlots.map(slot => ({
          ...slot,
          time: isTimeLike(slot.time) ? slot.time : rowTime
        }));

        laneRows.push({
          id: `${rowIndex}-${rowTime}`,
          time: rowTime,
          slots: finalizedSlots
        });
      });

      laneRows.sort((a, b) => toSortValue(a.time) - toSortValue(b.time));
      const { numberGroupMap, groupCount, groupRanges } = buildGroupMeta(laneRows, laneColumns.length);
      return {
        mode: 'lane-grid',
        titleSuffix,
        events: [],
        laneColumns,
        laneRows,
        numberGroupMap,
        groupCount,
        groupRanges
      };
    }

    const headers = (rows[0] || []).map(normalizeHeader);
    const findIndex = (predicates) => {
      for (const predicate of predicates) {
        const idx = headers.findIndex((h) => predicate(h));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idxTime = findIndex([(h) => h === 'AIKA', (h) => h === 'KLO', (h) => h === 'TIME', (h) => h.includes('START')]);
    const idxEnd = findIndex([(h) => h === 'LOPPU', (h) => h.includes('END')]);
    const idxEvent = findIndex([
      (h) => h === 'TAPAHTUMA',
      (h) => h === 'NIMI',
      (h) => h === 'OHJELMA',
      (h) => h === 'EVENT',
      (h) => h === 'NAME',
      (h) => h === 'LAJI'
    ]);
    const idxLocation = findIndex([(h) => h === 'PAIKKA', (h) => h === 'RATA', (h) => h === 'LOCATION', (h) => h.includes('HALL')]);
    const idxNotes = findIndex([(h) => h === 'HUOM', (h) => h.includes('LISATIETO'), (h) => h === 'NOTES', (h) => h === 'INFO']);

    const events = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const time = idxTime !== -1 ? String(row[idxTime] || '').trim() : '';
      const end = idxEnd !== -1 ? String(row[idxEnd] || '').trim() : '';
      const event = idxEvent !== -1 ? String(row[idxEvent] || '').trim() : String(row[0] || '').trim();
      const location = idxLocation !== -1 ? String(row[idxLocation] || '').trim() : '';
      const notes = idxNotes !== -1 ? String(row[idxNotes] || '').trim() : '';

      if (!time && !event && !location && !notes) continue;

      events.push({
        id: `${i}-${time}-${event}`,
        time,
        end,
        event,
        location,
        notes
      });
    }

    events.sort((a, b) => toSortValue(a.time) - toSortValue(b.time));
    return {
      mode: 'events',
      titleSuffix,
      events,
      laneColumns: [],
      laneRows: [],
      numberGroupMap: new Map(),
      groupCount: 0,
      groupRanges: []
    };
  }, [rawCsv]);

  if (parsed.mode === 'empty' || (parsed.mode === 'events' && parsed.events.length === 0) || (parsed.mode === 'lane-grid' && parsed.laneRows.length === 0)) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.empty}</div>;
  }

  const title = parsed.titleSuffix ? `${tx.title} | ${parsed.titleSuffix}` : tx.title;
  const laneGridTemplate = parsed.mode === 'lane-grid'
    ? `clamp(2.35rem, 9vw, 3rem) repeat(${parsed.laneColumns.length}, minmax(clamp(6.2rem, 29vw, 9rem), 1fr))`
    : '';

  return (
    <div className="space-y-3">
      <Card className="w-full shadow-sm">
        <CardHeader className="pb-3 bg-[hsl(var(--muted))]/20 border-b">
          <CardTitle className="text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {parsed.mode === 'lane-grid' ? (
            <>
              {/* TYÖPÖYTÄ- JA MOBIILINÄKYMÄ (SÄILYTTÄÄ PYSTY- JA SIVUSUUNTAISEN JATKUMON) */}
              <div
                ref={laneScrollRef}
                className="relative isolate w-full max-h-[68vh] overflow-auto overscroll-contain select-none cursor-grab active:cursor-grabbing sidebar-scrollbar"
                style={{ touchAction: 'pan-y' }}
                onPointerDown={handleLanePointerDown}
                onPointerMove={handleLanePointerMove}
                onPointerUp={handleLanePointerUp}
                onPointerCancel={handleLanePointerUp}
                onClickCapture={handleLaneClickCapture}
              >
                {/* KORJAUS 1: Nostettu minimileveys vähintään 850 pikseliin. 
                  Tämä varmistaa, että jokaiselle radalle jää aina ~200px tilaa, jolloin nimet mahtuvat!
                */}
                <div className="min-w-[850px] divide-y divide-[hsl(var(--border))]">

                  {parsed.groupCount > 0 && (
                    <div className="sticky left-0 z-50 flex flex-wrap items-center gap-1.5 px-3 py-2 text-[11px] border-b border-[hsl(var(--border))]/60 bg-[hsl(var(--muted))]/10">
                      {Array.from({ length: parsed.groupCount }).map((_, idx) => {
                        const range = parsed.groupRanges?.[idx];
                        const rangeLabel = range ? ` (${range.start}-${range.end})` : '';
                        return (
                          <span
                            key={`group-legend-${idx}`}
                            className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-[hsl(var(--foreground))]"
                            style={getGroupCellStyle(idx)}
                          >
                            {tx.group} {idx + 1}{rangeLabel}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* OTSIKKORIVI */}
                  <div
                    className="sticky top-0 z-30 grid bg-[hsl(var(--muted))] font-bold text-xs items-center py-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                    style={{ gridTemplateColumns: laneGridTemplate }}
                  >
                    {/* Aika pysyy lukittuna vasempaan reunaan swipatessa */}
                    <div className="sticky left-0 z-40 text-center font-bold text-[11px] md:text-xs text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] border-r border-[hsl(var(--border))] py-1">
                      {tx.time}
                    </div>
                    {/* Radat */}
                    {parsed.laneColumns.map((lane) => {
                      return (
                        <div key={lane.label} className="border-l border-[hsl(var(--border))] pl-3 font-bold text-[11px] md:text-xs text-[hsl(var(--foreground))] uppercase tracking-wider">
                          {lane.label}
                        </div>
                      );
                    })}
                  </div>

                  {/* DATARIVIT */}
                  <div className="divide-y divide-[hsl(var(--border))]/60">
                    {parsed.laneRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid items-stretch hover:bg-[hsl(var(--muted))]/5 transition-colors group"
                        style={{ gridTemplateColumns: laneGridTemplate }}
                      >
                        {/* Kellonaika (Pysyy paikoillaan vasemmassa reunassa) */}
                        <div className="sticky left-0 z-20 h-full text-center font-bold text-xs md:text-sm tracking-wide text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] font-mono border-r border-[hsl(var(--border))] px-1 shadow-[1px_0_0_0_hsl(var(--border))] flex items-center justify-center">
                          <span>{row.time || '-'}</span>
                        </div>

                        {/* Radat rinnakkain */}
                        {row.slots.map((slot, slotIdx) => {
                          const isAssigned = !!slot.shooter;
                          const onParillinenSarake = slotIdx % 2 === 1;
                          const shooterNumber = toShooterNumber(slot.number);
                          const groupIndex = shooterNumber !== null ? parsed.numberGroupMap.get(shooterNumber) : undefined;
                          const hasGroupColor = Number.isInteger(groupIndex);
                          const cellStyle = hasGroupColor ? getGroupCellStyle(groupIndex) : undefined;

                          return (
                            <div
                              key={`${row.id}-${slot.lane}`}
                              className={`border-l border-[hsl(var(--border))] px-3 py-1.5 h-full flex flex-col justify-center transition-all ${!hasGroupColor && onParillinenSarake ? 'bg-[hsl(var(--muted))]/20' : ''}`}
                              style={cellStyle}
                            >
                              {/* KORJAUS 2: items-start ja nimen max-width varmistavat, 
                                että teksti rivittyy kauniisti numeron viereen ilman litistymistä.
                              */}
                              <div className="flex items-start gap-1.5 min-w-0 w-full">
                                {slot.number && (
                                  <span className="font-mono text-[10px] md:text-[11px] font-bold text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]/80 px-1 py-0.5 rounded shrink-0 mt-0.5 leading-none">
                                    {slot.number}
                                  </span>
                                )}
                                <span className={`text-[11px] md:text-xs break-words line-clamp-2 leading-tight flex-1 ${
                                  isAssigned 
                                    ? 'font-medium text-[hsl(var(--foreground))]' 
                                    : 'text-[hsl(var(--muted-foreground))] italic opacity-40'
                                }`}>
                                  {slot.shooter || '-'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            </>
          ) : (
            <>
              {/* VAKIOMUOTOISET TAPAHTUMAT (EVENTS MODE) */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader className="bg-[hsl(var(--muted))]/10">
                    <TableRow>
                      <TableHead className="w-28 font-bold text-[hsl(var(--foreground))]">{tx.time}</TableHead>
                      <TableHead className="w-24 font-bold text-[hsl(var(--foreground))]">{tx.end}</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--foreground))]">{tx.event}</TableHead>
                      <TableHead className="w-40 font-bold text-[hsl(var(--foreground))]">{tx.location}</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--foreground))]">{tx.notes}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.events.map((e) => (
                      <TableRow key={e.id} className="hover:bg-[hsl(var(--muted))]/5 transition-colors">
                        <TableCell className="font-semibold text-[hsl(var(--foreground))]">{e.time || '-'}</TableCell>
                        <TableCell>{e.end || '-'}</TableCell>
                        <TableCell className="font-medium text-[hsl(var(--foreground))]">{e.event || '-'}</TableCell>
                        <TableCell>{e.location || '-'}</TableCell>
                        <TableCell className="text-[hsl(var(--muted-foreground))]">{e.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="p-3 space-y-2 md:hidden">
                {parsed.events.map((e) => (
                  <div key={e.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm">
                    <div className="text-sm font-bold text-[hsl(var(--foreground))]">{e.time || '-'}{e.end ? ` - ${e.end}` : ''}</div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))] mt-0.5">{e.event || '-'}</div>
                    {(e.location || e.notes) && (
                      <div className="mt-1.5 pt-1.5 border-t border-[hsl(var(--border))]/40 text-xs text-[hsl(var(--muted-foreground))] flex flex-wrap gap-x-2">
                        {e.location ? <span><span className="font-medium text-[hsl(var(--foreground))]">{tx.location}:</span> {e.location}</span> : ''}
                        {e.location && e.notes ? <span className="text-[hsl(var(--border))]">|</span> : ''}
                        {e.notes ? <span><span className="font-medium text-[hsl(var(--foreground))]">{tx.notes}:</span> {e.notes}</span> : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}