// src/RankingTulokset.jsx
// Kauden ranking: kokonaispisteet ja kisakohtaiset pisteet, suodatus yhdistetyillä sarjoilla.
import { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import { RANKING_KAIKKI, parsiRanking, rankingSarjatAmpujille, suodataRanking } from './utils/rankingTulokset';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { cn } from './lib/utils';
import { haeTekstit } from './i18n';

// Taulukon tila (1-3) värinä, kuten RANKING-välilehden rivien värit.
const TILA_VARIT = {
  1: 'bg-emerald-500',
  2: 'bg-sky-500',
  3: 'bg-amber-500'
};

export default function RankingTulokset({ rawCsv, locale = 'fi' }) {
  const tx = haeTekstit('rankingTulokset', locale);
  const [sarjaSuodatin, setSarjaSuodatin] = useState(RANKING_KAIKKI);
  const [valittuId, setValittuId] = useState(null);

  const ranking = useMemo(() => parsiRanking(parseCsvRows(rawCsv || '')), [rawCsv]);
  const sarjat = useMemo(() => rankingSarjatAmpujille(ranking.ampujat), [ranking.ampujat]);
  // Jos valitun sarjan viimeinen ampuja poistuu päivityksessä, näytetään Open.
  const valittuSarja = sarjat.some((s) => s.avain === sarjaSuodatin) ? sarjaSuodatin : RANKING_KAIKKI;
  const naytettavat = useMemo(() => suodataRanking(ranking.ampujat, valittuSarja), [ranking.ampujat, valittuSarja]);

  if (ranking.ampujat.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-500">{tx.noResults}</div>;
  }

  const tilaTeksti = (tila) => tx[`tila${tila}`] || '';

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap gap-2">
        {sarjat.map((sarja) => (
          <Button
            key={sarja.avain}
            type="button"
            size="sm"
            className="shrink-0"
            variant={valittuSarja === sarja.avain ? 'default' : 'outline'}
            title={sarja.sarjat ? sarja.sarjat.join(', ') : undefined}
            onClick={() => { setSarjaSuodatin(sarja.avain); setValittuId(null); }}
          >
            {tx[`sarja${sarja.avain}`]}
            {sarja.sarjat && <span className="ml-1 font-normal opacity-70">({sarja.sarjat.join(', ')})</span>}
          </Button>
        ))}
      </div>

      <p className="mb-3 text-xs text-slate-500">{tx.explanation}</p>

      <div className="flex flex-col gap-2">
        {naytettavat.map((ampuja) => {
          const onAuki = valittuId === ampuja.id;
          const sijoitus = parseInt(ampuja.laskettuSija || '0', 10);
          const sijoitusKorostusLuokka = sijoitus === 1
            ? 'border-l-4 border-l-[hsl(var(--rank-1))]'
            : sijoitus === 2
              ? 'border-l-4 border-l-[hsl(var(--rank-2))]'
              : sijoitus === 3
                ? 'border-l-4 border-l-[hsl(var(--rank-3))]'
                : 'border-l-4 border-l-transparent';

          return (
            <Card key={ampuja.id} className={cn('overflow-hidden border-[hsl(var(--border))]', sijoitusKorostusLuokka)}>
              <button
                type="button"
                aria-expanded={onAuki}
                className={cn(
                  'flex min-h-[52px] w-full items-center px-3 py-3 text-left transition-colors',
                  onAuki ? 'bg-slate-50' : 'bg-white'
                )}
                onClick={() => setValittuId(onAuki ? null : ampuja.id)}
              >
                <div className="mr-3 flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-slate-100 text-base font-extrabold text-slate-700">
                  {ampuja.laskettuSija}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-2">
                  <div className="flex items-center gap-1.5 break-words text-base font-bold text-slate-900">
                    <span translate="no">{ampuja.nimi}</span>
                    {TILA_VARIT[ampuja.tila] && (
                      <span
                        className={cn('inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10', TILA_VARIT[ampuja.tila])}
                        title={tilaTeksti(ampuja.tila)}
                        aria-label={tilaTeksti(ampuja.tila)}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="default" className="px-2 py-0.5 text-[11px]">{ampuja.sarja || '—'}</Badge>
                    <span translate="no" className="font-medium text-slate-500">{ampuja.seura || '—'}</span>
                  </div>
                </div>

                <div className="flex min-w-20 shrink-0 flex-col items-center justify-center text-center">
                  <div className="text-xl font-black leading-none text-slate-900">{ampuja.yhteensa || '—'}</div>
                  {ampuja.tuloksia && (
                    <div className="mt-1 text-[10px] font-semibold text-slate-500">{ampuja.tuloksia} {tx.resultsCount}</div>
                  )}
                </div>
              </button>

              {onAuki && ampuja.tulokset.length > 0 && (
                <CardContent className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
                  <div className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3">
                    {ampuja.tulokset.map((tulos) => (
                      <div
                        key={`${ampuja.id}-${tulos.koodi}`}
                        className={cn(
                          'flex min-w-0 items-center justify-between gap-2 rounded border px-2 py-1',
                          tulos.mukana
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'
                        )}
                        title={tulos.mukana ? tx.counted : undefined}
                      >
                        <div className="min-w-0">
                          <div translate="no" className="truncate text-[11px] font-semibold text-slate-700">{tulos.koodi}</div>
                          {tulos.taso && <div className="text-[10px] text-slate-500">{tulos.taso}</div>}
                        </div>
                        <div className={cn('text-sm text-slate-900', tulos.mukana ? 'font-black' : 'font-semibold')}>
                          {tulos.tulos}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {[1, 2, 3].map((tila) => (
          <span key={`tila-${tila}`} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10', TILA_VARIT[tila])} />
            {tilaTeksti(tila)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-amber-300 bg-amber-50" />
          {tx.counted}
        </span>
      </div>
    </div>
  );
}
