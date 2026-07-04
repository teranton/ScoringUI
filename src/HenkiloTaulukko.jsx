import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import {
  laskeHenkilosijoitukset,
  muodostaRatkoNakyma,
  parseAsemaSpeksitCsv
} from './utils/henkiloTulokset';
import { getStatusLabelSizeClass, getStatusLabelToneClass } from './utils/statusLabels';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { cn } from './lib/utils';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

function isPerfLoggingEnabled() {
  const envValue = String(import.meta.env.VITE_SCORINGUI_PERF || '').trim().toLowerCase();
  const envEnabled = envValue === '1' || envValue === 'true' || envValue === 'yes' || envValue === 'on';
  const envDisabled = envValue === '0' || envValue === 'false' || envValue === 'no' || envValue === 'off';

  if (typeof window === 'undefined') {
    if (envEnabled) return true;
    if (envDisabled) return false;
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search || '');
    const qp = String(params.get('perf') || '').trim().toLowerCase();
    if (qp === '1' || qp === 'true' || qp === 'yes' || qp === 'on') return true;
    if (qp === '0' || qp === 'false' || qp === 'no' || qp === 'off') return false;
  } catch {
    // Ignore URL parsing failures.
  }

  if (window.__SCORINGUI_PERF__ === true) return true;
  if (window.__SCORINGUI_PERF__ === false) return false;

  try {
    const stored = String(window.localStorage?.getItem('scoringui:perf') || '').trim().toLowerCase();
    if (stored === '1' || stored === 'true' || stored === 'yes' || stored === 'on') return true;
    if (stored === '0' || stored === 'false' || stored === 'no' || stored === 'off') return false;
  } catch {
    // Ignore storage access errors.
  }

  if (envEnabled) return true;
  if (envDisabled) return false;

  return false;
}

function logPerf(scope, startTime, details = {}) {
  if (!isPerfLoggingEnabled() || typeof performance === 'undefined') return;
  const ms = performance.now() - startTime;
  console.log(`[HenkiloTaulukkoPerf] ${scope}: ${ms.toFixed(1)}ms`, details);
}

export default function HenkiloTaulukko({ data, parsedRows, parsedSpeksit, kisaStatus, locale = 'fi' }) {
  const onMobiili = typeof window !== 'undefined' && window.innerWidth < 760;
  const [onkoKompaktiTila, setOnkoKompaktiTila] = useState(true);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('OPEN (Y)');
  const sarjaScrollRef = useRef(null);
  
  const sarjaDragRef = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false
  });
  
  const kaytaKompaktiTilaa = onMobiili && onkoKompaktiTila;

  // 1. PARSITAAN KISASPEKSIT
  const speksit = useMemo(() => {
    const perfStart = typeof performance !== 'undefined' ? performance.now() : 0;
    const parsed = (parsedSpeksit?.asemaMaksimit && parsedSpeksit?.asemaToiseksiParasKaytossa)
      ? parsedSpeksit
      : parseAsemaSpeksitCsv(data?.speksitCsvRaw);
    const result = {
      ...parsed,
      ratojenMaara: Object.keys(parsed.asemaMaksimit).length > 0 ? Object.keys(parsed.asemaMaksimit).length : 8
    };
    logPerf('speksit', perfStart, {
      ratojenMaara: result.ratojenMaara,
      kayttaaValmistaSpeksia: Boolean(parsedSpeksit?.asemaMaksimit && parsedSpeksit?.asemaToiseksiParasKaytossa)
    });
    return result;
  }, [data, parsedSpeksit]);

  // 2. PARSITAAN AMPUJIEN TULOKSET
  const ampujat = useMemo(() => {
    const perfStart = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!data?.henkilotCsvRaw) return [];

    try {
      const raakaRivit = Array.isArray(parsedRows?.henkilotRows)
        ? parsedRows.henkilotRows
        : parseCsvRows(data.henkilotCsvRaw);
      if (!Array.isArray(raakaRivit) || raakaRivit.length < 2) return [];

      const otsikot = (raakaRivit[0] || []).map((o) => String(o || '').toUpperCase());
      const otsikotNormalisoitu = otsikot.map((o) => o.replace(/[^A-Z0-9]/g, ''));

      const etsiSarakkeenIndeksi = (ehdot) => {
        for (const ehto of ehdot) {
          const idx = otsikotNormalisoitu.findIndex((h) => ehto(h));
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const idxNimi = etsiSarakkeenIndeksi([(h) => h === 'NIMI', (h) => h.includes('NIMI')]);
      const idxSarja = etsiSarakkeenIndeksi([(h) => h === 'SARJA', (h) => h.includes('SARJA')]);
      const idxSeura = etsiSarakkeenIndeksi([(h) => h === 'SEURA', (h) => h.includes('SEURA')]);
      const idxRata1 = otsikot.findIndex((o) => o.trim() === '1');

      const nimiFallback = 0;
      const sarjaFallback = 1;
      const yhteistulosFallback = 3;
      const rata1Fallback = 6;

      const nimiIndeksi = idxNimi !== -1 ? idxNimi : nimiFallback;
      const sarjaIndeksi = idxSarja !== -1 ? idxSarja : sarjaFallback;
      const aloitusIndeksi = idxRata1 !== -1 ? idxRata1 : rata1Fallback;
      const idxRatko = aloitusIndeksi + speksit.ratojenMaara + 1;
      const idxRatko2 = idxRatko !== -1 ? idxRatko + 1 : -1;

      let idxTulos = etsiSarakkeenIndeksi([(h) => h === 'TULOS', (h) => h.startsWith('TULOS'), (h) => h === 'YHT', (h) => h.startsWith('YHT')]);
      if (idxTulos === -1 && idxSeura !== -1) {
        idxTulos = idxSeura + 1;
      }
      if (idxTulos === -1) {
        idxTulos = yhteistulosFallback;
      }

      const lista = [];

      for (let i = 1; i < raakaRivit.length; i++) {
        const row = raakaRivit[i];
        if (!row || !row[nimiIndeksi]) continue;

        const name = row[nimiIndeksi] || '';
        const category = row[sarjaIndeksi] || '';
        const yhteistulos = row[idxTulos] || '0';
        const ratko = idxRatko !== -1 ? row[idxRatko] || '' : '';
        const ratko2 = idxRatko2 !== -1 ? row[idxRatko2] || '' : '';
        const ratkoNaytto = muodostaRatkoNakyma(ratko, ratko2);

        const eratMap = {};
        for (let col = aloitusIndeksi; col <= aloitusIndeksi + speksit.ratojenMaara - 1; col++) {
          const eraNum = (col - aloitusIndeksi) + 1;
          eratMap[eraNum] = row[col] !== undefined ? row[col] : '';
        }

        lista.push({
          id: `${name}|${i}`,
          nimi: name,
          sarja: category,
          tulos: yhteistulos,
          kokonaistulos: yhteistulos,
          ratko,
          ratko2,
          ratkoNaytto,
          erat: eratMap
        });
      }
      logPerf('ampujat', perfStart, {
        rows: raakaRivit.length,
        ampujat: lista.length,
        ratojenMaara: speksit.ratojenMaara
      });
      return lista;
    } catch (e) {
      console.error("Virhe taulukko-ampujien parsinnoissa:", e);
      return [];
    }
  }, [data, parsedRows, speksit.ratojenMaara]);

  const onkoDataPuuttuu = !data || !data.henkilotCsvRaw;
  const radatList = useMemo(() => Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1), [speksit.ratojenMaara]);
  
  const loydetytSarjat = useMemo(
    () => Array.from(new Set(ampujat.map((a) => String(a.sarja || '').trim()).filter(Boolean))).sort(),
    [ampujat]
  );
  
  const naytettavatAmpujat = useMemo(() => {
    const perfStart = typeof performance !== 'undefined' ? performance.now() : 0;
    const result = laskeHenkilosijoitukset(ampujat, sarjaSuodatin);
    logPerf('naytettavatAmpujat', perfStart, {
      sarja: sarjaSuodatin,
      source: ampujat.length,
      shown: result.length
    });
    return result;
  }, [ampujat, sarjaSuodatin]);

  const openRatkoRajatulos = useMemo(() => {
    const perfStart = typeof performance !== 'undefined' ? performance.now() : 0;
    if (sarjaSuodatin !== 'OPEN (Y)' || naytettavatAmpujat.length < 3) {
      return null;
    }
    const kolmasTulos = parseInt(naytettavatAmpujat[2]?.tulos, 10);
    const result = Number.isNaN(kolmasTulos) ? null : kolmasTulos;
    logPerf('openRatkoRajatulos', perfStart, {
      sarja: sarjaSuodatin,
      shown: naytettavatAmpujat.length,
      raja: result
    });
    return result;
  }, [naytettavatAmpujat, sarjaSuodatin]);

  const onkoRatkoSallittuAmpujalle = (ampuja) => {
    if (sarjaSuodatin !== 'OPEN (Y)' || openRatkoRajatulos === null) return true;
    const tulosNum = parseInt(ampuja?.tulos, 10);
    if (Number.isNaN(tulosNum)) return false;
    return tulosNum >= openRatkoRajatulos;
  };

  const naytaRatkoSarake = naytettavatAmpujat.some(
    (a) => onkoRatkoSallittuAmpujalle(a) && (a.ratkoNaytto?.statusEtiketit?.length > 0 || a.ratkoNaytto?.teksti)
  );

  useEffect(() => {
    if (!isPerfLoggingEnabled() || typeof performance === 'undefined') return;
    const start = performance.now();
    requestAnimationFrame(() => {
      logPerf('filterOrModePaint', start, {
        sarja: sarjaSuodatin,
        onMobiili,
        mode: onMobiili ? (onkoKompaktiTila ? 'compact' : 'normal') : 'desktop',
        shown: naytettavatAmpujat.length,
        rendered: naytettavatAmpujat.length,
        stages: radatList.length
      });
    });
  }, [sarjaSuodatin, onkoKompaktiTila, onMobiili, naytettavatAmpujat.length, radatList.length]);

  const tx = locale === 'en'
    ? {
      loading: 'Loading table data...',
      title: 'All Results (Table)',
      normal: 'Normal',
      compact: 'Compact',
      rank: 'Rank',
      name: 'Name',
      classLabel: 'Class',
      total: 'Total',
      allStagesReady: 'All stage scores are complete',
      stagesMissing: 'Some stage scores are missing',
      zoomReset: 'Reset Zoom'
    }
    : {
      loading: 'Ladataan taulukkodataa...',
      title: 'Kaikki tulokset taulukkona',
      normal: 'Normaali',
      compact: 'Kompakti',
      rank: 'Sija',
      name: 'Nimi',
      classLabel: 'Sarja',
      total: 'Yht',
      allStagesReady: 'Kaikki alitulokset valmiit',
      stagesMissing: 'Alituloksia puuttuu',
      zoomReset: 'Nollaa zoom'
    };

  if (onkoDataPuuttuu) {
    return <div className="py-6 text-sm text-slate-500">{tx.loading}</div>;
  }

  const muotoileNimiTaulukkoon = (nimi) => {
    if (!onMobiili) return nimi;
    const osat = String(nimi || '').trim().split(/\s+/).filter(Boolean);
    if (osat.length <= 1) return nimi;
    if (!kaytaKompaktiTilaa) return nimi;
    return osat
      .map((osa, idx) => (idx === 0 ? osa : `${osa.charAt(0)}.`))
      .join(' ');
  };

  const onkoAliTulosPuuttuu = (arvo) => {
    const teksti = String(arvo ?? '').trim().toUpperCase();
    return teksti === '' || teksti === '-' || teksti === '—' || teksti === 'N/A';
  };

  const onkoAmpujaValmis = (ampuja) => {
    return radatList.every((n) => !onkoAliTulosPuuttuu(ampuja.erat[n]));
  };

  const naytaValmiusIndikaattori = kisaStatus === 'kaynnissa';

  const onSarjaPointerDown = (event) => {
    const container = sarjaScrollRef.current;
    if (!container) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    sarjaDragRef.current.isDown = true;
    sarjaDragRef.current.startX = event.clientX;
    sarjaDragRef.current.scrollLeft = container.scrollLeft;
    sarjaDragRef.current.moved = false;
  };

  const onSarjaPointerMove = (event) => {
    const container = sarjaScrollRef.current;
    const state = sarjaDragRef.current;
    if (!container || !state.isDown) return;

    const deltaX = event.clientX - state.startX;
    if (Math.abs(deltaX) > 4) {
      state.moved = true;
    }
    container.scrollLeft = state.scrollLeft - deltaX;
  };

  const onSarjaPointerUp = () => {
    sarjaDragRef.current.isDown = false;
  };

  const onSarjaClickCapture = (event) => {
    if (!sarjaDragRef.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    sarjaDragRef.current.moved = false;
  };

  // --- DYNAMIC WIDTH CALCULATIONS ---
  const rankColWidth = kaytaKompaktiTilaa ? 32 : (onMobiili ? 42 : 52);
  const nameColWidth = kaytaKompaktiTilaa ? 118 : (onMobiili ? 154 : 240);
  const totalColWidth = kaytaKompaktiTilaa ? 38 : (onMobiili ? 44 : 56);
  const ratkoColWidth = kaytaKompaktiTilaa ? 46 : (onMobiili ? 58 : 84);
  const stageColWidth = kaytaKompaktiTilaa ? 28 : (onMobiili ? 34 : 44);

  const stickyRankStyle = {
    left: 0,
    width: `${rankColWidth}px`,
    minWidth: `${rankColWidth}px`,
    maxWidth: `${rankColWidth}px`
  };
  const stickyNameStyle = {
    left: `${rankColWidth}px`,
    width: `${nameColWidth}px`,
    minWidth: `${nameColWidth}px`,
    maxWidth: `${nameColWidth}px`
  };

  const kokoLuokka = onMobiili ? (kaytaKompaktiTilaa ? 'compact' : 'mobile') : 'desktop';

  const otsikkoLuokka = (tyyppi) => {
    if (tyyppi === 'fixed') {
      if (kokoLuokka === 'compact') return 'bg-slate-100 text-center text-[11px] font-bold text-slate-700 border-b border-r border-slate-200';
      if (kokoLuokka === 'mobile') return 'bg-slate-100 text-center text-xs font-bold text-slate-700 border-b border-r border-slate-200';
      return 'bg-slate-100 text-center text-sm font-bold text-slate-700 border-b border-r border-slate-200';
    }
    if (tyyppi === 'sum') {
      if (kokoLuokka === 'compact') return 'bg-slate-200 text-center text-[11px] font-bold text-slate-800 border-b border-r border-slate-300';
      if (kokoLuokka === 'mobile') return 'bg-slate-200 text-center text-xs font-bold text-slate-800 border-b border-r border-slate-300';
      return 'bg-slate-200 text-center text-sm font-bold text-slate-800 border-b border-r border-slate-300';
    }
    if (tyyppi === 'ratko') {
      if (kokoLuokka === 'compact') return 'bg-amber-100 text-amber-900 text-center text-[10px] font-bold border-b border-r border-amber-200';
      if (kokoLuokka === 'mobile') return 'bg-amber-100 text-amber-900 text-center text-xs font-bold border-b border-r border-amber-200';
      return 'bg-amber-100 text-amber-900 text-center text-sm font-bold border-b border-r border-amber-200';
    }
    if (kokoLuokka === 'compact') return 'bg-slate-50 text-center text-[11px] font-semibold text-slate-600 border-b border-r border-slate-200/60';
    if (kokoLuokka === 'mobile') return 'bg-slate-50 text-center text-xs font-semibold text-slate-600 border-b border-r border-slate-200/60';
    return 'bg-slate-50 text-center text-sm font-semibold text-slate-600 border-b border-r border-slate-200/60';
  };

  const soluLuokka = (tyyppi) => {
    if (tyyppi === 'rank') {
      if (kokoLuokka === 'compact') return 'text-center text-[11px] font-medium text-slate-500 border-r border-slate-200';
      if (kokoLuokka === 'mobile') return 'text-center text-xs font-medium text-slate-500 border-r border-slate-200';
      return 'text-center text-sm font-medium text-slate-500 border-r border-slate-200';
    }
    if (tyyppi === 'name') {
      if (kokoLuokka === 'compact') return 'truncate px-1.5 text-[11px] font-semibold text-slate-900 border-r border-slate-200';
      if (kokoLuokka === 'mobile') return 'truncate px-2 text-xs font-semibold text-slate-900 border-r border-slate-200';
      return 'px-3 text-sm font-semibold text-slate-900 border-r border-slate-200';
    }
    if (tyyppi === 'series') {
      if (kokoLuokka === 'mobile') return 'text-center text-xs text-slate-600 border-r border-slate-200/60';
      return 'text-center text-sm text-slate-600 border-r border-slate-200/60';
    }
    if (tyyppi === 'sum') {
      if (kokoLuokka === 'compact') return 'text-center font-mono text-[11px] font-bold text-slate-900 border-r border-slate-300 bg-slate-100/60';
      if (kokoLuokka === 'mobile') return 'text-center font-mono text-xs font-bold text-slate-900 border-r border-slate-300 bg-slate-100/60';
      return 'text-center font-mono text-sm font-bold text-slate-900 border-r border-slate-300 bg-slate-100/60';
    }
    if (tyyppi === 'ratko') {
      if (kokoLuokka === 'compact') return 'text-center text-[10px] border-r border-amber-200/60 bg-amber-50/40 text-amber-900';
      if (kokoLuokka === 'mobile') return 'text-center text-xs border-r border-amber-200/60 bg-amber-50/40 text-amber-900';
      return 'text-center text-sm border-r border-amber-200/60 bg-amber-50/40 text-amber-900';
    }
    if (kokoLuokka === 'compact') return 'text-center font-mono text-[11px] border-r border-slate-200/40';
    if (kokoLuokka === 'mobile') return 'text-center font-mono text-xs border-r border-slate-200/40';
    return 'text-center font-mono text-sm border-r border-slate-200/40';
  };

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="gap-3 px-4 pb-3 pt-4 md:p-6 md:pb-4 border-b bg-slate-50/50">
        <CardTitle className="text-lg font-bold text-slate-800">{tx.title}</CardTitle>

        {/* Categories Toolbar Container */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div
            ref={sarjaScrollRef}
            className="flex cursor-grab gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [touch-action:pan-y] active:cursor-grabbing [&::-webkit-scrollbar]:hidden py-0.5"
            onPointerDown={onSarjaPointerDown}
            onPointerMove={onSarjaPointerMove}
            onPointerUp={onSarjaPointerUp}
            onPointerCancel={onSarjaPointerUp}
            onPointerLeave={onSarjaPointerUp}
            onClickCapture={onSarjaClickCapture}
          >
            <Button
              type="button"
              onClick={() => setSarjaSuodatin('OPEN (Y)')}
              size="sm"
              className="shrink-0 rounded-lg h-8 px-3 text-xs font-semibold shadow-none"
              variant={sarjaSuodatin === 'OPEN (Y)' ? 'default' : 'outline'}
            >
              OPEN (Y)
            </Button>
            {loydetytSarjat
              .filter((sarja) => sarja.toUpperCase() !== 'Y')
              .map((sarja) => (
                <Button
                  key={sarja}
                  type="button"
                  onClick={() => setSarjaSuodatin(sarja)}
                  size="sm"
                  className="shrink-0 rounded-lg h-8 px-3 text-xs font-semibold shadow-none"
                  variant={sarjaSuodatin === sarja ? 'default' : 'outline'}
                >
                  {sarja}
                </Button>
              ))}
          </div>

          {onMobiili && (
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setOnkoKompaktiTila(false)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  !onkoKompaktiTila ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {tx.normal}
              </button>
              <button
                type="button"
                onClick={() => setOnkoKompaktiTila(true)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  onkoKompaktiTila ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {tx.compact}
              </button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        <TransformWrapper initialScale={1} minScale={0.6} maxScale={2.5}>
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Native Scroll Canvas Area */}
              <div className="w-full h-[60vh] md:h-[68vh] overflow-auto select-none bg-white">
                <TransformComponent wrapperClass="!w-full !h-full cursor-grab active:cursor-grabbing">
                  
                  {/* Performance-Enhanced Table Layout */}
                  <table className="border-separate border-spacing-0 table-fixed min-w-max text-left border-collapse">
                    <thead>
                      <tr className="h-9 md:h-11">
                        
                        {/* Sticky Header Box: Rank */}
                        <th
                          className={cn(otsikkoLuokka('fixed'), 'sticky left-0 top-0 z-45 shadow-[1px_0_0_0_rgba(226,232,240,1)]')}
                          style={stickyRankStyle}
                        >
                          {tx.rank}
                        </th>
                        
                        {/* Sticky Header Box: Name */}
                        <th
                          className={cn(otsikkoLuokka('fixed'), 'sticky top-0 z-45 text-left px-2 md:px-3 shadow-[1px_0_0_0_rgba(226,232,240,1)]')}
                          style={stickyNameStyle}
                        >
                          {tx.name}
                        </th>
                        
                        {!kaytaKompaktiTilaa && (
                          <th className={cn(otsikkoLuokka('fixed'), 'sticky top-0 z-30')} style={{ width: '60px' }}>
                            {tx.classLabel}
                          </th>
                        )}
                        
                        <th className={cn(otsikkoLuokka('sum'), 'sticky top-0 z-30')} style={{ width: `${totalColWidth}px` }}>
                          {tx.total}
                        </th>
                        
                        {naytaRatkoSarake && (
                          <th className={cn(otsikkoLuokka('ratko'), 'sticky top-0 z-30')} style={{ width: `${ratkoColWidth}px` }}>
                            Ratko
                          </th>
                        )}
                        
                        {radatList.map(n => (
                          <th
                            key={n}
                            className={cn(otsikkoLuokka('stage'), 'sticky top-0 z-30')}
                            style={{ width: `${stageColWidth}px` }}
                          >
                            R{n}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    
                    <tbody className="divide-y divide-slate-100">
                      {naytettavatAmpujat.map((ampuja) => (
                        <tr
                          key={ampuja.id}
                          className="h-9 md:h-11 hover:bg-slate-50/60 transition-colors group"
                          style={{
                            contentVisibility: 'auto',
                            containIntrinsicSize: kaytaKompaktiTilaa ? '36px' : (onMobiili ? '44px' : '44px')
                          }}
                        >
                          {/* Sticky Cell: Numerical Placement */}
                          <td
                            className={cn(soluLuokka('rank'), 'sticky left-0 z-25 bg-slate-50 group-hover:bg-slate-100 transition-colors shadow-[1px_0_0_0_rgba(226,232,240,1)]')}
                            style={stickyRankStyle}
                          >
                            {ampuja.laskettuSija}
                          </td>
                          
                          {/* Sticky Cell: Full/Shortened Name Display */}
                          <td
                            className={cn(soluLuokka('name'), 'sticky z-25 bg-white group-hover:bg-slate-50 transition-colors shadow-[1px_0_0_0_rgba(226,232,240,1)]')}
                            style={stickyNameStyle}
                          >
                            <div className="flex items-center gap-1.5 overflow-hidden w-full h-full align-middle">
                              <span className="truncate">{muotoileNimiTaulukkoon(ampuja.nimi)}</span>
                              {naytaValmiusIndikaattori && (
                                <span
                                  className={cn(
                                    'inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/5',
                                    onkoAmpujaValmis(ampuja) ? 'bg-emerald-500' : 'bg-amber-400'
                                  )}
                                  title={onkoAmpujaValmis(ampuja) ? tx.allStagesReady : tx.stagesMissing}
                                />
                              )}
                            </div>
                          </td>
                          
                          {!kaytaKompaktiTilaa && (
                            <td className={cn(soluLuokka('series'), 'bg-white group-hover:bg-slate-50/30')} style={{ width: '60px' }}>
                              {ampuja.sarja}
                            </td>
                          )}
                          
                          <td className={soluLuokka('sum')} style={{ width: `${totalColWidth}px` }}>
                            {ampuja.kokonaistulos}
                          </td>
                          
                          {naytaRatkoSarake && (
                            <td
                              className={cn(soluLuokka('ratko'), 'align-middle px-1')}
                              style={{ width: `${ratkoColWidth}px` }}
                              title={[...ampuja.ratkoNaytto.statusEtiketit, ampuja.ratkoNaytto.teksti].filter(Boolean).join(' | ')}
                            >
                              {(() => {
                                const onkoRatkoSallittu = onkoRatkoSallittuAmpujalle(ampuja);
                                const naytaRatko = onkoRatkoSallittu && Boolean(ampuja.ratkoNaytto.teksti);
                                const naytaRatkoStatus = onkoRatkoSallittu && ampuja.ratkoNaytto.statusEtiketit.length > 0;

                                if (!(naytaRatkoStatus || (naytaRatko && ampuja.ratkoNaytto.teksti))) {
                                  return <span className="text-slate-300">—</span>;
                                }

                                if (kaytaKompaktiTilaa) {
                                  const compactText = naytaRatkoStatus
                                    ? ampuja.ratkoNaytto.statusEtiketit.join('/')
                                    : ampuja.ratkoNaytto.teksti;

                                  return (
                                    <span className="block truncate text-[9px] font-bold tracking-tight leading-none text-[hsl(var(--ratko-fg))] text-center" title={compactText}>
                                      {compactText}
                                    </span>
                                  );
                                }

                                return (
                                  <div className="flex flex-wrap items-center justify-center gap-0.5 max-w-full">
                                    {naytaRatkoStatus && ampuja.ratkoNaytto.statusEtiketit.map((status) => (
                                      <span
                                        key={`${ampuja.id}-${status}`}
                                        className={cn(
                                          getStatusLabelSizeClass(),
                                          getStatusLabelToneClass(status),
                                          "text-[9px] px-1 py-0 rounded font-bold scale-95"
                                        )}
                                      >
                                        {status}
                                      </span>
                                    ))}
                                    {naytaRatko && ampuja.ratkoNaytto.teksti && (
                                      <span className="font-bold text-xs text-[hsl(var(--ratko-fg))]">{ampuja.ratkoNaytto.teksti}</span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          )}

                          {/* Individual Score Cells mapped to High/Second Best Tones */}
                          {radatList.map(n => {
                            const pisteArvo = ampuja.erat[n] || '-';
                            const pisteNum = parseInt(pisteArvo, 10);
                            const maksimiTulos = speksit.asemaMaksimit[n] || speksit.asemaMaksimit[`${n}`];
                            const naytaToiseksiParas = Boolean(speksit.asemaToiseksiParasKaytossa[n] ?? speksit.asemaToiseksiParasKaytossa[`${n}`]);
                            const onkoMaksimi = !isNaN(pisteNum) && maksimiTulos !== undefined && pisteNum === maksimiTulos;
                            const onkoToiseksiParas = !isNaN(pisteNum) && maksimiTulos !== undefined && naytaToiseksiParas && pisteNum === (maksimiTulos - 1);

                            return (
                              <td
                                key={n}
                                style={{ width: `${stageColWidth}px` }}
                                className={cn(
                                  soluLuokka('stage'),
                                  'bg-white group-hover:bg-slate-50/30 transition-colors',
                                  onkoMaksimi
                                    ? 'font-bold text-[hsl(var(--score-best-fg))]'
                                    : onkoToiseksiParas
                                      ? 'font-bold text-[hsl(var(--score-second-fg))]'
                                      : 'text-slate-600',
                                  pisteArvo === '-' && 'text-slate-300'
                                )}
                              >
                                {pisteArvo}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                </TransformComponent>
              </div>

              {/* Float Interface Action Elements for Canvas Zoom Control */}
              <div className="absolute bottom-3 right-3 z-45 flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-md">
                <button 
                  type="button"
                  onClick={() => zoomIn()} 
                  className="w-7 h-7 flex items-center justify-center font-bold text-sm text-slate-700 rounded-lg hover:bg-slate-100 active:scale-90 transition-all select-none"
                >
                  ＋
                </button>
                <button 
                  type="button"
                  onClick={() => zoomOut()} 
                  className="w-7 h-7 flex items-center justify-center font-bold text-sm text-slate-700 rounded-lg hover:bg-slate-100 active:scale-90 transition-all select-none"
                >
                  －
                </button>
                <div className="w-px h-4 bg-slate-200 mx-0.5" />
                <button 
                  type="button"
                  onClick={() => resetTransform()} 
                  className="px-2.5 h-7 flex items-center justify-center text-[10px] font-bold tracking-wider uppercase text-slate-600 rounded-lg hover:bg-slate-100 active:scale-95 transition-all select-none"
                >
                  {tx.zoomReset}
                </button>
              </div>
            </>
          )}
        </TransformWrapper>
      </CardContent>
    </Card>
  );
}