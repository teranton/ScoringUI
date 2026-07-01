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
      const firstDataRow = rows.find((row) => Array.isArray(row) && row.some((cell) => isTimeLike(cell)));

      for (let i = 0; i < laneHeaderRow.length; i++) {
        if (!isLaneHeader(laneHeaderRow[i])) continue;

        // In many sheets the lane label sits above shooter number column,
        // while the actual block starts one cell earlier: [time, number, shooter].
        let startIndex = i;
        const prevCell = i > 0 ? firstDataRow?.[i - 1] : '';
        const currentCell = firstDataRow?.[i];
        if (i > 0 && isTimeLike(prevCell) && !isTimeLike(currentCell)) {
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
          const time = String(row[lane.startIndex] || '').trim();
          const number = String(row[lane.startIndex + 1] || '').trim();
          const shooter = String(row[lane.startIndex + 2] || '').trim();
          return {
            lane: lane.label,
            time,
            number,
            shooter
          };
        });

        const hasAnyShooter = laneSlots.some((slot) => slot.shooter);
        const hasAnyTime = laneSlots.some((slot) => isTimeLike(slot.time));
        if (!hasAnyShooter || !hasAnyTime) return;

        const time = laneSlots.find((slot) => isTimeLike(slot.time))?.time || '';
        laneRows.push({
          id: `${rowIndex}-${time}`,
          time,
          slots: laneSlots
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

  const title = parsed.titleSuffix ? `${tx.title} ${parsed.titleSuffix}` : tx.title;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {parsed.mode === 'lane-grid' ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">{tx.time}</TableHead>
                      {parsed.laneColumns.map((lane) => (
                        <TableHead key={lane.label} className="min-w-44">{lane.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.laneRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-semibold">{row.time || '-'}</TableCell>
                        {row.slots.map((slot) => (
                          <TableCell key={`${row.id}-${slot.lane}`}>
                            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{slot.shooter || '-'}</div>
                            {slot.number && <div className="text-xs text-[hsl(var(--muted-foreground))]">#{slot.number}</div>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 md:hidden">
                {parsed.laneRows.map((row) => (
                  <div key={row.id} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <div className="mb-2 text-sm font-bold text-[hsl(var(--foreground))]">{tx.time}: {row.time || '-'}</div>
                    <div className="space-y-1.5">
                      {row.slots.map((slot) => (
                        <div key={`${row.id}-${slot.lane}`} className="flex items-start justify-between gap-3 text-xs">
                          <span className="font-semibold text-[hsl(var(--muted-foreground))]">{slot.lane}</span>
                          <span className="text-right font-medium text-[hsl(var(--foreground))]">
                            {slot.shooter || '-'}
                            {slot.number ? ` (#${slot.number})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">{tx.time}</TableHead>
                      <TableHead className="w-24">{tx.end}</TableHead>
                      <TableHead>{tx.event}</TableHead>
                      <TableHead className="w-40">{tx.location}</TableHead>
                      <TableHead>{tx.notes}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-semibold">{e.time || '-'}</TableCell>
                        <TableCell>{e.end || '-'}</TableCell>
                        <TableCell>{e.event || '-'}</TableCell>
                        <TableCell>{e.location || '-'}</TableCell>
                        <TableCell>{e.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 md:hidden">
                {parsed.events.map((e) => (
                  <div key={e.id} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <div className="text-sm font-bold text-[hsl(var(--foreground))]">{e.time || '-'}{e.end ? ` - ${e.end}` : ''}</div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{e.event || '-'}</div>
                    {(e.location || e.notes) && (
                      <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {e.location ? `${tx.location}: ${e.location}` : ''}
                        {e.location && e.notes ? ' | ' : ''}
                        {e.notes ? `${tx.notes}: ${e.notes}` : ''}
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
