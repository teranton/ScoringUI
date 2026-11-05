// src/FinaaliKaavio.jsx
// Pudotuspelifinaalin kaavio FINAALI-välilehdeltä: kierrokset sarakkeina vasemmalta oikealle,
// pronssiottelu viimeisen kierroksen (finaalin) alla. Yksi kaavio per sarja.
import { Medal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { cn } from './lib/utils';
import { haeTekstit } from './i18n';
import { haeLoppuottelu } from './utils/finaali';

function AmpujaRivi({ ampuja, voitti, ratkennut, tx }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 text-sm',
        voitti && 'font-semibold',
        ratkennut && !voitti && 'text-[hsl(var(--muted-foreground))]'
      )}
    >
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[hsl(var(--muted-foreground))]" title={tx.seed}>
        {ampuja.sija}
      </span>
      <span className="min-w-0 flex-1 truncate">{ampuja.nimi || tx.tbd}</span>
      <span className="shrink-0 tabular-nums">{ampuja.tulos ?? ''}</span>
    </div>
  );
}

// Kulta- ja pronssiottelulla on teeman sijavärin (--rank-1 / --rank-3, kuten henkilötuloksissa) läpikuultava sävy.
const MITALI_SIJA = { kulta: 1, pronssi: 3 };
const mitaliTyyli = (mitali) => (MITALI_SIJA[mitali]
  ? { borderColor: `hsl(var(--rank-${MITALI_SIJA[mitali]}) / 0.6)`, backgroundColor: `hsl(var(--rank-${MITALI_SIJA[mitali]}) / 0.12)` }
  : undefined);

function OtteluKortti({ ottelu, tx, otsikko, mitali }) {
  const ratkennut = ottelu.voittaja !== null;
  return (
    <div className="w-56">
      {otsikko && <div className="mb-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">{otsikko}</div>}
      <div
        className={cn(
          'divide-y divide-[hsl(var(--border))] overflow-hidden rounded-lg border',
          !MITALI_SIJA[mitali] && 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'
        )}
        style={mitaliTyyli(mitali)}
      >
        <AmpujaRivi ampuja={ottelu.a} voitti={ottelu.voittaja === 'A'} ratkennut={ratkennut} tx={tx} />
        <AmpujaRivi ampuja={ottelu.b} voitti={ottelu.voittaja === 'B'} ratkennut={ratkennut} tx={tx} />
      </div>
      {ottelu.ratko && (
        <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{tx.shootOff}: {ottelu.ratko}</div>
      )}
    </div>
  );
}

function voittajaJaHaviaja(ottelu) {
  if (!ottelu || ottelu.voittaja === null) return ['', ''];
  return ottelu.voittaja === 'A' ? [ottelu.a.nimi, ottelu.b.nimi] : [ottelu.b.nimi, ottelu.a.nimi];
}

// Mitalistit finaalista (haeLoppuottelu) ja pronssiottelusta, kun ne ovat ratkenneet.
function mitalistit(kaavio, tx) {
  const [kulta, hopea] = voittajaJaHaviaja(haeLoppuottelu(kaavio));
  const [pronssi] = voittajaJaHaviaja(kaavio.pronssi);
  return [
    { sija: 1, nimi: kulta, otsikko: tx.gold },
    { sija: 2, nimi: hopea, otsikko: tx.silver },
    { sija: 3, nimi: pronssi, otsikko: tx.bronzeMedal }
  ].filter((m) => m.nimi);
}

function SarjanKaavio({ kaavio, tx }) {
  const mitalit = mitalistit(kaavio, tx);
  const loppuottelu = haeLoppuottelu(kaavio);
  const otsikko = kaavio.sarja ? tx.classTitle.replace('{sarja}', kaavio.sarja) : tx.title;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{otsikko}</CardTitle>
        {mitalit.length > 0 && (
          // Mitalistit laatikoina kuten henkilötuloksissa: sijan väri vasemmassa reunassa (teeman --rank-N).
          <ol className="grid gap-2 pt-1 sm:grid-cols-3">
            {mitalit.map((m) => (
              <li key={m.sija}>
                <Card
                  className="flex h-full min-h-[52px] items-center border-l-4 px-3 py-2"
                  style={{ borderLeftColor: `hsl(var(--rank-${m.sija}))` }}
                >
                  <div className="mr-3 flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-slate-100 text-base font-extrabold text-slate-700">
                    {m.sija}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words text-base font-bold leading-tight" translate="no">{m.nimi}</span>
                    <span className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                      <Medal className="h-3.5 w-3.5" style={{ color: `hsl(var(--rank-${m.sija}))` }} aria-hidden="true" />
                      {m.otsikko}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </CardHeader>
      <CardContent>
        <div className="-mx-2 overflow-x-auto px-2 pb-2">
          <div className="flex min-w-max gap-6">
            {kaavio.kierrokset.map((kierros, k) => (
              <div key={kierros.nimi} className="flex flex-col">
                <div className="mb-2 text-sm font-semibold">{kierros.nimi}</div>
                <div className="flex flex-1 flex-col justify-around gap-4">
                  {kierros.ottelut.map((ottelu, i) => (
                    <OtteluKortti key={`${kierros.nimi}-${i}`} ottelu={ottelu} tx={tx} mitali={ottelu === loppuottelu ? 'kulta' : undefined} />
                  ))}
                  {k === kaavio.kierrokset.length - 1 && kaavio.pronssi && (
                    <OtteluKortti ottelu={kaavio.pronssi} tx={tx} otsikko={tx.bronze} mitali="pronssi" />
                  )}
                </div>
              </div>
            ))}
            {kaavio.kierrokset.length === 0 && kaavio.pronssi && (
              <OtteluKortti ottelu={kaavio.pronssi} tx={tx} otsikko={tx.bronze} mitali="pronssi" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinaaliKaavio({ finaalit, locale }) {
  const tx = haeTekstit('finaali', locale);
  return (
    <div className="space-y-4">
      {finaalit.map((kaavio) => (
        <SarjanKaavio key={kaavio.sarja || '-'} kaavio={kaavio} tx={tx} />
      ))}
    </div>
  );
}
