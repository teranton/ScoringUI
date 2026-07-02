import { useMemo, useState, useRef } from 'react';
import { parseCsvRows } from './utils/csv'; // Varmista oikea polku projektissasi
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

// --- APUFUNKTIOT ---

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
  return { backgroundColor: style.bg, borderLeftColor: style.border };
}

let laneNameMeasureCanvas = null;
function measureShooterTextWidth(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  if (typeof document === 'undefined') return value.length * 6.5;
  if (!laneNameMeasureCanvas) {
    laneNameMeasureCanvas = document.createElement('canvas');
  }
  const context = laneNameMeasureCanvas.getContext('2d');
  if (!context) return value.length * 6.5;
  context.font = '500 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  return context.measureText(value).width;
}

// --- PÄÄKOMPONENTTI ---

export default function AikatauluNakyma({ rawCsv, locale = 'fi' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileViewMode, setMobileViewMode] = useState('lanes');
  
  // Ref vain yläreunan rataotsikoiden synkronointiin
  const headerRef = useRef(null);

  const tx = locale === 'en'
    ? {
      title: 'Timetable', empty: 'No timetable rows found.', lane: 'Lane', time: 'Time',
      group: 'Group', end: 'End', event: 'Event', location: 'Location', notes: 'Notes'
    }
    : {
      title: 'Aikataulu', empty: 'Aikataulurivejä ei löytynyt.', lane: 'Rata', time: 'Aika',
      group: 'Ryhmä', end: 'Loppu', event: 'Tapahtuma', location: 'Paikka', notes: 'Lisätieto'
    };

  const txSearch = locale === 'en'
    ? { placeholder: 'Search shooter...', results: 'Shooter schedules', noResults: 'No matches found' }
    : { placeholder: 'Hae ampujaa...', results: 'Ampujan aikataulu', noResults: 'Ei osumia' };

  const txMobile = locale === 'en'
    ? {
      lanes: 'Lanes',
      largeTable: 'Large table'
    }
    : {
      lanes: 'Ratat',
      largeTable: 'Taulukkonakyma'
    };

  // DATA PARSINTA
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
        laneColumns.push({ label: String(laneHeaderRow[i]).trim(), startIndex });
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
          return { lane: lane.label, time: rawTime, number, shooter };
        });

        const hasAnyShooter = laneSlots.some((slot) => slot.shooter);
        const globalTimeSlot = laneSlots.find((slot) => isTimeLike(slot.time));
        if (!hasAnyShooter || !globalTimeSlot) return;

        const rowTime = globalTimeSlot.time;
        const finalizedSlots = laneSlots.map(slot => ({
          ...slot,
          time: isTimeLike(slot.time) ? slot.time : rowTime
        }));

        laneRows.push({ id: `${rowIndex}-${rowTime}`, time: rowTime, slots: finalizedSlots });
      });

      laneRows.sort((a, b) => toSortValue(a.time) - toSortValue(b.time));
      const { numberGroupMap, groupCount, groupRanges } = buildGroupMeta(laneRows, laneColumns.length);
      return { mode: 'lane-grid', titleSuffix, events: [], laneColumns, laneRows, numberGroupMap, groupCount, groupRanges };
    }

    // Standardi Tapahtumanäkymä
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
    const idxEvent = findIndex([(h) => h === 'TAPAHTUMA', (h) => h === 'NIMI', (h) => h === 'OHJELMA', (h) => h === 'EVENT', (h) => h === 'NAME', (h) => h === 'LAJI']);
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
      events.push({ id: `${i}-${time}-${event}`, time, end, event, location, notes });
    }

    events.sort((a, b) => toSortValue(a.time) - toSortValue(b.time));
    return { mode: 'events', titleSuffix, events, laneColumns: [], laneRows: [], numberGroupMap: new Map(), groupCount: 0, groupRanges: [] };
  }, [rawCsv]);

  // HAKUTOIMINTO
  const shooterMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || parsed.mode !== 'lane-grid') return [];
    const matches = [];
    for (const row of parsed.laneRows) {
      for (const slot of row.slots || []) {
        if (slot.shooter && slot.shooter.toLowerCase().includes(query)) {
          matches.push({ time: row.time, lane: slot.lane, number: slot.number, shooter: slot.shooter });
        }
      }
    }
    return matches;
  }, [searchQuery, parsed]);

  const mobileLaneTimelines = useMemo(() => {
    if (parsed.mode !== 'lane-grid') return [];

    return parsed.laneColumns.map((lane, laneIdx) => {
      const entries = [];

      for (const row of parsed.laneRows) {
        const slot = row.slots?.[laneIdx];
        if (!slot) continue;

        const shooter = String(slot.shooter || '').trim();
        if (!shooter) continue;

        const shooterNumber = toShooterNumber(slot.number);
        const groupIndex = shooterNumber !== null ? parsed.numberGroupMap.get(shooterNumber) : undefined;
        const hasGroupColor = Number.isInteger(groupIndex);

        entries.push({
          id: `${row.id}-${lane.label}`,
          time: row.time || '-',
          number: slot.number,
          shooter,
          style: hasGroupColor ? getGroupCellStyle(groupIndex) : undefined
        });
      }

      return {
        laneLabel: lane.label,
        entries
      };
    });
  }, [parsed]);

  if (parsed.mode === 'empty' || (parsed.mode === 'events' && parsed.events.length === 0) || (parsed.mode === 'lane-grid' && parsed.laneRows.length === 0)) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.empty}</div>;
  }

  const title = parsed.titleSuffix ? `${tx.title} | ${parsed.titleSuffix}` : tx.title;

  // LEVEYDET JA GRIDIT
  const laneNameColumnWidth = parsed.mode === 'lane-grid'
    ? (() => {
        let maxShooterWidth = 0;
        for (const row of parsed.laneRows) {
          for (const slot of row.slots || []) {
            const width = measureShooterTextWidth(slot?.shooter);
            if (width > maxShooterWidth) maxShooterWidth = width;
          }
        }
        const horizontalPadding = 18; 
        const numberBadgeReserve = 28; 
        const safetyMargin = 16; 
        const computed = Math.ceil(maxShooterWidth + horizontalPadding + numberBadgeReserve + safetyMargin);
        return Math.max(120, computed);
      })()
    : 0;

  const timeColumnWidth = 65; 
  const lanesTotalWidth = parsed.laneColumns.length * laneNameColumnWidth;
  
  // Rakennetaan yhtenäinen master-grid, jossa aika ja radat ovat samassa pöydässä
  const masterGridTemplate = `${timeColumnWidth}px repeat(${parsed.laneColumns.length}, ${laneNameColumnWidth}px)`;
  const lanesOnlyGridTemplate = `repeat(${parsed.laneColumns.length}, ${laneNameColumnWidth}px)`;

  // REALIAIKAINEN SIVUTTAISOTSIKOIDEN LUKITUSSYNKRONEINTI
  const handleTransform = (ref) => {
    const { positionX, scale } = ref.state;
    // Liikutetaan yläreunan rataotsikoita täsmälleen saman verran kuin datakangas liikkuu X-suunnassa
    if (headerRef.current) {
      headerRef.current.style.transform = `translate3d(${positionX}px, 0px, 0px) scale(${scale})`;
    }
  };

  return (
    <div className="space-y-3">
      {/* HAKUKENTTÄ */}
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
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] px-1.5 py-0.5 rounded bg-[hsl(var(--muted))]/50">
              Tyhjennä
            </button>
          )}
        </div>
      )}

      {/* HAKUTULOKSET */}
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
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {shooterMatches.map((match, idx) => (
                  <div key={`match-${idx}`} className="flex items-center justify-between gap-3 p-2 rounded-md border border-[hsl(var(--border))]/60 bg-[hsl(var(--card))] text-xs shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded shrink-0">{match.time}</span>
                      <span className="font-medium truncate text-[hsl(var(--foreground))]">{match.shooter}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {match.number && <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]/60 px-1 py-0.5 rounded">Nro {match.number}</span>}
                      <span className="font-semibold text-[hsl(var(--foreground))] bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 px-2 py-0.5 rounded-sm text-[11px]">{match.lane}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AIKATAULUKORTTI */}
      <Card className="w-full shadow-sm">
        <CardHeader className="pb-3 bg-[hsl(var(--muted))]/20 border-b">
          <CardTitle className="text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {parsed.mode === 'lane-grid' ? (
            <>
              <div className="flex gap-2 p-2 pb-0 md:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant={mobileViewMode === 'lanes' ? 'default' : 'outline'}
                  onClick={() => setMobileViewMode('lanes')}
                >
                  {txMobile.lanes}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mobileViewMode === 'table' ? 'default' : 'outline'}
                  onClick={() => setMobileViewMode('table')}
                >
                  {txMobile.largeTable}
                </Button>
              </div>

              <div className={`${mobileViewMode === 'lanes' ? 'block' : 'hidden'} space-y-2 p-2 md:hidden`}>
                <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 px-2.5 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                  {locale === 'en'
                    ? 'Swipe left/right to switch lanes. Scroll up/down inside a lane to see earlier and next shooters.'
                    : 'Pyyhkäise vasen/oikea vaihtaaksesi rataa. Vieritä ylös/alas radan sisällä nähdäksesi aiemmat ja seuraavat ampujat.'}
                </div>

                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {mobileLaneTimelines.map((lane) => (
                    <section
                      key={`lane-mobile-${lane.laneLabel}`}
                      className="w-[86vw] max-w-[30rem] shrink-0 snap-start overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
                    >
                      <div className="flex items-center justify-between border-b border-[hsl(var(--border))]/60 bg-[hsl(var(--muted))]/25 px-3 py-2">
                        <span className="text-sm font-bold tracking-wide text-[hsl(var(--foreground))]">{lane.laneLabel}</span>
                        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{lane.entries.length} {locale === 'en' ? 'shooters' : 'ampujaa'}</span>
                      </div>

                      <div className="max-h-[62vh] overflow-y-auto divide-y divide-[hsl(var(--border))]/60">
                        {lane.entries.length === 0 ? (
                          <div className="px-3 py-3 text-xs italic text-[hsl(var(--muted-foreground))]">{locale === 'en' ? 'No shooters on this lane.' : 'Ei ampujia tällä radalla.'}</div>
                        ) : lane.entries.map((entry) => (
                          <div key={entry.id} className="flex items-start gap-2 px-3 py-2.5" style={entry.style}>
                            <span className="mt-0.5 inline-flex min-w-[52px] justify-center rounded bg-[hsl(var(--muted))]/85 px-1.5 py-0.5 font-mono text-xs font-bold text-[hsl(var(--foreground))]">
                              {entry.time}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium leading-tight text-[hsl(var(--foreground))]">{entry.shooter}</div>
                              {entry.number && (
                                <div className="mt-0.5 text-[11px] font-mono text-[hsl(var(--muted-foreground))]">#{entry.number}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              <div className={`${mobileViewMode === 'table' ? 'block' : 'hidden'} relative h-[68vh] w-full select-none overflow-hidden rounded-b-xl border bg-[hsl(var(--card))] md:block`}>
                <div
                  className="absolute left-0 top-0 z-50 flex items-center justify-center border-b border-r bg-[hsl(var(--muted))] text-xs font-bold shadow-sm"
                  style={{ width: `${timeColumnWidth}px`, height: '36px' }}
                >
                  {tx.time}
                </div>

                <div
                  className="absolute left-0 top-0 z-40 h-[36px] w-full overflow-hidden border-b bg-[hsl(var(--muted))]"
                  style={{ paddingLeft: `${timeColumnWidth}px` }}
                >
                  <div
                    ref={headerRef}
                    className="grid h-full items-center text-xs font-bold will-change-transform"
                    style={{ gridTemplateColumns: lanesOnlyGridTemplate, width: `${lanesTotalWidth}px`, transformOrigin: '0 0' }}
                  >
                    {parsed.laneColumns.map((lane) => (
                      <div key={lane.label} className="truncate border-l border-[hsl(var(--border))] px-5 text-xs font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">
                        {lane.label}
                      </div>
                    ))}
                  </div>
                </div>

                <TransformWrapper
                  initialScale={1}
                  minScale={0.3}
                  maxScale={3}
                  centerOnInit={false}
                  onTransformed={handleTransform}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      <TransformComponent wrapperClass="!w-full !h-full cursor-grab active:cursor-grabbing">
                        <div
                          className="divide-y divide-[hsl(var(--border))]/60 bg-[hsl(var(--card))]"
                          style={{ paddingTop: '36px', width: `${timeColumnWidth + lanesTotalWidth}px` }}
                        >
                          {parsed.laneRows.map((row) => (
                            <div
                              key={row.id}
                              className="grid items-stretch transition-colors hover:bg-[hsl(var(--muted))]/5"
                              style={{ gridTemplateColumns: masterGridTemplate, height: '38px' }}
                            >
                              <div
                                className="flex shrink-0 items-center justify-center border-b border-r border-[hsl(var(--border))]/60 bg-[hsl(var(--muted))]/40 font-mono text-xs font-bold tracking-wide text-[hsl(var(--foreground))] md:text-sm"
                                style={{ width: `${timeColumnWidth}px` }}
                              >
                                {row.time || '-'}
                              </div>

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
                                    className={`flex h-full flex-col justify-center border-b border-l border-[hsl(var(--border))]/60 px-5 py-0.5 ${!hasGroupColor && onParillinenSarake ? 'bg-[hsl(var(--muted))]/20' : ''}`}
                                    style={cellStyle}
                                  >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      {slot.number && (
                                        <span className="shrink-0 rounded bg-[hsl(var(--muted))]/80 px-1 py-0.5 font-mono text-[10px] font-bold leading-none text-[hsl(var(--muted-foreground))]">
                                          {slot.number}
                                        </span>
                                      )}
                                      <span className={`truncate whitespace-nowrap text-xs tracking-wide ${isAssigned ? 'font-medium text-[hsl(var(--foreground))]' : 'italic text-[hsl(var(--muted-foreground))] opacity-35'}`}>
                                        {slot.shooter || '-'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </TransformComponent>

                      <div className="absolute bottom-4 right-4 z-50 flex gap-2 rounded-lg border bg-[hsl(var(--background))]/95 p-1.5 shadow-sm backdrop-blur-sm">
                        <button onClick={() => zoomIn()} className="flex h-8 w-8 items-center justify-center rounded text-lg font-bold transition-transform hover:bg-[hsl(var(--muted))] active:scale-95">+</button>
                        <button onClick={() => zoomOut()} className="flex h-8 w-8 items-center justify-center rounded text-lg font-bold transition-transform hover:bg-[hsl(var(--muted))] active:scale-95">−</button>
                        <button onClick={() => resetTransform()} className="flex h-8 items-center justify-center rounded px-2.5 text-xs font-semibold font-sans transition-transform hover:bg-[hsl(var(--muted))] active:scale-95">Nollaa</button>
                      </div>
                    </>
                  )}
                </TransformWrapper>
              </div>
            </>
          ) : (
            /* TAVALLINEN LISTANÄKYMÄ (EVENTS MODE) */
            <div className="overflow-x-auto">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}