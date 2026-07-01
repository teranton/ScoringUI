import { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';


let laneNameMeasureCanvas = null;

function measureShooterTextWidth(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  if (typeof document === 'undefined') return value.length * 6.2;

  if (!laneNameMeasureCanvas) {
    laneNameMeasureCanvas = document.createElement('canvas');
  }
  const context = laneNameMeasureCanvas.getContext('2d');
  if (!context) return value.length * 6.2;

  // TÄRKEÄÄ: Tämän fonttimäärityksen täytyy vastata täsmälleen taulukon solujen fonttia
  context.font = '500 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'; return context.measureText(value).width;
}

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
  const [searchQuery, setSearchQuery] = useState('');

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

        let startIndex = i;
        if (i > 0 && !isLaneHeader(laneHeaderRow[i - 1])) {
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
          const rawTime = String(row[lane.startIndex] || '').trim();
          const number = String(row[lane.startIndex + 1] || '').trim();
          const shooter = String(row[lane.startIndex + 2] || '').trim();

          return {
            lane: lane.label,
            time: rawTime,
            number,
            shooter
          };
        });

        const hasAnyShooter = laneSlots.some((slot) => slot.shooter);
        const globalTimeSlot = laneSlots.find((slot) => isTimeLike(slot.time));

        if (!hasAnyShooter || !globalTimeSlot) return;

        const rowTime = globalTimeSlot.time;
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

  const txSearch = locale === 'en'
    ? { placeholder: 'Search shooter...', results: 'Shooter schedules', noResults: 'No matches found' }
    : { placeholder: 'Hae ampujaa...', results: 'Ampujan aikataulu', noResults: 'Ei osumia' };

  const shooterMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || parsed.mode !== 'lane-grid') return [];

    const matches = [];
    for (const row of parsed.laneRows) {
      for (const slot of row.slots || []) {
        if (slot.shooter && slot.shooter.toLowerCase().includes(query)) {
          matches.push({
            time: row.time,
            lane: slot.lane,
            number: slot.number,
            shooter: slot.shooter
          });
        }
      }
    }
    return matches;
  }, [searchQuery, parsed]);

  if (parsed.mode === 'empty' || (parsed.mode === 'events' && parsed.events.length === 0) || (parsed.mode === 'lane-grid' && parsed.laneRows.length === 0)) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.empty}</div>;
  }

  const title = parsed.titleSuffix ? `${tx.title} | ${parsed.titleSuffix}` : tx.title;
  const laneNameColumnWidth = parsed.mode === 'lane-grid'
    ? (() => {
      let maxShooterWidth = 0;

      for (const row of parsed.laneRows) {
        for (const slot of row.slots || []) {
          const width = measureShooterTextWidth(slot?.shooter);
          if (width > maxShooterWidth) {
            maxShooterWidth = width;
          }
        }
      }

      // Korjataan marginaalit:
      const horizontalPadding = 16;  // px-5 molemmin puolin (yhteensä vähintään 16-20px tilaa)
      const numberBadgeReserve = 28; // Numerolapun viemä tila

      // NOSTETAAN TÄMÄÄ: Lisätään 16px "varmuusilmaa", jotta pisinkään nimi ei 
      // missään olosuhteissa hypää seuraavan sarakkeen päälle.
      const tinySafetyMargin = 16;

      const computed = Math.ceil(maxShooterWidth + horizontalPadding + numberBadgeReserve + tinySafetyMargin);

      return Math.max(120, computed);
    })()
    : 0;
  /* MUUTOS: Jokainen rata-sarake mukautuu itsenäisesti oman maksimisisältönsä mukaan (max-content).
    Aika-sarake käyttää pientä minimiväliä (minmax). Tämä poistaa ylimääräisen tyhjän tilan kokonaan!
  */
  const laneGridTemplate = parsed.mode === 'lane-grid'
    ? `minmax(50px, max-content) repeat(${parsed.laneColumns.length}, ${laneNameColumnWidth}px)`
    : '';

  return (
    <div className="space-y-3">

      {/* HAKUKENTTÄ (Näkyy vain jos ollaan rata-näkymässä) */}
      {parsed.mode === 'lane-grid' && (
        <div className="relative w-full">
          <input
            type="text"
            placeholder={txSearch.placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] px-1.5 py-0.5 rounded bg-[hsl(var(--muted))]/50"
            >
              Tyhjennä
            </button>
          )}
        </div>
      )}

      {/* HAKUTULOSKORTTI */}
      {searchQuery.trim() !== '' && parsed.mode === 'lane-grid' && (
        <Card className="w-full shadow-sm border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5">
          <CardHeader className="py-2.5 border-b border-[hsl(var(--border))]/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              {txSearch.results} ({shooterMatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {shooterMatches.length === 0 ? (
              <p className="text-xs italic text-[hsl(var(--muted-foreground))] py-1">{txSearch.noResults}</p>
            ) : (
              // Lista aikajärjestyksessä (aikaisimmasta myöhäisimpään)
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {shooterMatches.map((match, idx) => (
                  <div
                    key={`match-${idx}`}
                    className="flex items-center justify-between gap-3 p-2 rounded-md border border-[hsl(var(--border))]/60 bg-[hsl(var(--card))] text-xs shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded shrink-0">
                        {match.time}
                      </span>
                      <span className="font-medium truncate text-[hsl(var(--foreground))]">
                        {match.shooter}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {match.number && (
                        <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]/60 px-1 py-0.5 rounded">
                          Nro {match.number}
                        </span>
                      )}
                      <span className="font-semibold text-[hsl(var(--foreground))] bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 px-2 py-0.5 rounded-sm text-[11px]">
                        {match.lane}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card className="w-full shadow-sm">
        <CardHeader className="pb-3 bg-[hsl(var(--muted))]/20 border-b">
          <CardTitle className="text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {parsed.mode === 'lane-grid' ? (
            <>
              {/* ZOOMATTAVA JA RAAHATTAVA KANGASALUSTA */}
              <div className="relative w-full border rounded-b-xl overflow-hidden bg-[hsl(var(--card))] select-none">

                {/* ZOOM-PAINIKKEET */}
                <div className="absolute bottom-4 right-4 z-50 flex gap-2 bg-[hsl(var(--background))]/95 backdrop-blur-sm p-1.5 rounded-lg border shadow-sm">
                  <button
                    onClick={() => document.getElementById('z-in')?.click()}
                    className="w-8 h-8 flex items-center justify-center font-bold text-lg rounded hover:bg-[hsl(var(--muted))] active:scale-95 transition-transform"
                  >
                    +
                  </button>
                  <button
                    onClick={() => document.getElementById('z-out')?.click()}
                    className="w-8 h-8 flex items-center justify-center font-bold text-lg rounded hover:bg-[hsl(var(--muted))] active:scale-95 transition-transform"
                  >
                    −
                  </button>
                  <button
                    onClick={() => document.getElementById('z-res')?.click()}
                    className="px-2.5 h-8 flex items-center justify-center text-xs font-semibold rounded hover:bg-[hsl(var(--muted))] active:scale-95 transition-transform"
                  >
                    Nollaa
                  </button>
                </div>

                <TransformWrapper
                  initialScale={1}
                  minScale={0.4}
                  maxScale={3}
                  doubleClick={{ mode: "reset" }}
                  panning={{ velocityDisabled: false }}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      <button id="z-in" onClick={() => zoomIn()} className="hidden" />
                      <button id="z-out" onClick={() => zoomOut()} className="hidden" />
                      <button id="z-res" onClick={() => resetTransform()} className="hidden" />

                      <TransformComponent wrapperClass="!w-full !max-h-[70vh] cursor-grab active:cursor-grabbing">

                        {/* KANGAS: Leveys määräytyy nyt täysin solujen max-content-leveyden summana (w-max).
                          Ei enää keinotekoisia pikselirajoja tai tyhjää tilaa nimien perässä.
                        */}
                        <div className="w-max divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">

                          {/* RYHMÄLEGENDAT */}
                          {parsed.groupCount > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 text-[11px] bg-[hsl(var(--muted))]/10 border-b">
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
                            className="grid bg-[hsl(var(--muted))] font-bold text-xs items-center py-2.5"
                            style={{ gridTemplateColumns: laneGridTemplate }}
                          >
                            <div className="text-center font-bold text-xs text-[hsl(var(--foreground))] px-4">
                              {tx.time}
                            </div>
                            {parsed.laneColumns.map((lane) => (
                              <div key={lane.label} className="border-l border-[hsl(var(--border))] px-5 font-bold text-xs text-[hsl(var(--foreground))] uppercase tracking-wider">
                                {lane.label}
                              </div>
                            ))}
                          </div>

                          {/* DATARIVIT */}
                          <div className="divide-y divide-[hsl(var(--border))]/60">
                            {parsed.laneRows.map((row) => (
                              <div
                                key={row.id}
                                className="grid items-stretch hover:bg-[hsl(var(--muted))]/5 transition-colors"
                                style={{ gridTemplateColumns: laneGridTemplate }}
                              >
                                {/* Kellonaika */}
                                <div className="text-center font-bold text-xs md:text-sm tracking-wide text-[hsl(var(--foreground))] py-3 bg-[hsl(var(--muted))]/10 font-mono px-4 flex items-center justify-center">
                                  {row.time || '-'}
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
                                      className={`border-l border-[hsl(var(--border))] px-5 py-2 h-full flex flex-col justify-center ${!hasGroupColor && onParillinenSarake ? 'bg-[hsl(var(--muted))]/20' : ''}`}
                                      style={cellStyle}
                                    >
                                      {/* whitespace-nowrap pitää nimen siististi yhdellä rivillä ilman turhaa pystyrivitystä */}
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {slot.number && (
                                          <span className="font-mono text-[10px] md:text-[11px] font-bold text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]/80 px-1 py-0.5 rounded shrink-0 leading-none">
                                            {slot.number}
                                          </span>
                                        )}
                                        <span className={`text-xs whitespace-nowrap tracking-wide ${isAssigned
                                          ? 'font-medium text-[hsl(var(--foreground))]'
                                          : 'text-[hsl(var(--muted-foreground))] italic opacity-35'
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
                      </TransformComponent>
                    </>
                  )}
                </TransformWrapper>
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