import { useMemo } from 'react';
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

export default function AikatauluNakyma({ rawCsv, locale = 'fi' }) {
  const tx = locale === 'en'
    ? {
      title: 'Timetable',
      empty: 'No timetable rows found.',
      lane: 'Lane',
      time: 'Time',
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
      return { mode: 'lane-grid', titleSuffix, events: [], laneColumns, laneRows };
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
    return { mode: 'events', titleSuffix, events, laneColumns: [], laneRows: [] };
  }, [rawCsv]);

  if (parsed.mode === 'empty' || (parsed.mode === 'events' && parsed.events.length === 0) || (parsed.mode === 'lane-grid' && parsed.laneRows.length === 0)) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.empty}</div>;
  }

  const title = parsed.titleSuffix ? `${tx.title} | ${parsed.titleSuffix}` : tx.title;

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
              {/* TYÖPÖYTÄNÄKYMÄ (TABLE GRID) */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader className="bg-[hsl(var(--muted))]/10">
                    <TableRow>
                      <TableHead className="w-20 font-bold text-center text-[hsl(var(--foreground))]">{tx.time}</TableHead>
                      {parsed.laneColumns.map((lane) => (
                        <TableHead key={lane.label} className="min-w-44 font-bold text-[hsl(var(--foreground))] border-l">
                          {lane.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.laneRows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-[hsl(var(--muted))]/5 transition-colors">
                        <TableCell className="font-bold text-base text-center tracking-wide text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]/5">
                          {row.time || '-'}
                        </TableCell>
                        {row.slots.map((slot) => {
                          // REAALIAIKAINEN KOROSTUS: Jos ruudussa on ampuja, korostetaan se dynaamisesti keltaisella
                          const isAssigned = !!slot.shooter;

                          return (
                            <TableCell
                              key={`${row.id}-${slot.lane}`}
                              className={`border-l transition-all duration-150 ${isAssigned
                                  ? 'bg-amber-50/60 dark:bg-amber-950/20 border-l-amber-500/60'
                                  : 'border-l-[hsl(var(--border))]'
                                }`}
                            >
                              <div className="flex items-baseline gap-2 max-w-[180px]">
                                {slot.number && (
                                  <span className="text-xs font-mono font-medium text-[hsl(var(--muted-foreground))] w-6 shrink-0">
                                    {slot.number}
                                  </span>
                                )}
                                <div className={`text-sm truncate ${isAssigned ? 'font-semibold text-amber-950 dark:text-amber-200' : 'text-[hsl(var(--muted-foreground))]'}`}>
                                  {slot.shooter || '-'}
                                </div>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* MOBIILINÄKYMÄ (RESPONSIIVISET KORTIT) */}
              <div className="p-3 space-y-2.5 md:hidden">
                {parsed.laneRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm overflow-hidden">
                    <div className="bg-[hsl(var(--muted))]/30 px-3 py-2 text-sm font-bold tracking-wide text-[hsl(var(--foreground))] border-b">
                      {tx.time}: {row.time || '-'}
                    </div>
                    <div className="divide-y divide-[hsl(var(--border))]/50">
                      {row.slots.map((slot) => {
                        const isAssigned = !!slot.shooter;

                        return (
                          <div
                            key={`${row.id}-${slot.lane}`}
                            className={`flex items-center justify-between gap-3 px-3 py-2 text-xs ${isAssigned ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                              }`}
                          >
                            <span className="font-semibold text-[hsl(var(--muted-foreground))]">{slot.lane}</span>
                            <div className="text-right flex items-center gap-1.5">
                              {slot.number && <span className="font-mono text-[hsl(var(--muted-foreground))]">#{slot.number}</span>}
                              <span className={`font-medium ${isAssigned ? 'font-semibold text-amber-950 dark:text-amber-200' : 'text-[hsl(var(--foreground))]'}`}>
                                {slot.shooter || '-'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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