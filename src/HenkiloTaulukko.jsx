import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import { createPerfLogger, isPerfLoggingEnabled, perfNow } from './utils/perf';
import {
  laskeHenkilosijoitukset,
  laskeNaytettavatRatkoIdt,
  parseAsemaSpeksitCsv
} from './utils/henkiloTulokset';
import {
  jarjestaAmpujat,
  laskeRataTilastot,
  onkoAliTulosPuuttuu,
  parsiTaulukkoAmpujat,
  tunnistaPaivaSarakeNimet
} from './utils/henkiloTaulukko';
import { getStatusLabelSizeClass, getStatusLabelToneClass } from './utils/statusLabels';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { cn } from './lib/utils';
import { haeTekstit } from './i18n';
import { useMediaQuery } from './hooks/useMediaQuery';

const logPerf = createPerfLogger('HenkiloTaulukkoPerf');

// Taulukon luokat kokoluokittain (compact / mobile / desktop).
const TEKSTIKOKO = { compact: 'text-[11px]', mobile: 'text-xs', desktop: 'text-sm' };
const RATKO_TEKSTIKOKO = { compact: 'text-[10px]', mobile: 'text-xs', desktop: 'text-sm' };
const NIMI_ASETTELU = { compact: 'truncate px-1.5', mobile: 'truncate px-2', desktop: 'px-3' };

const OTSIKKO_LUOKAT = {
  fixed: (koko) => `bg-slate-100 text-center ${TEKSTIKOKO[koko]} font-bold text-slate-700 border-b border-r border-slate-200`,
  sum: (koko) => `bg-slate-200 text-center ${TEKSTIKOKO[koko]} font-bold text-slate-800 border-b border-r border-slate-300`,
  ratko: (koko) => `bg-[hsl(var(--ratko-bg))] text-[hsl(var(--ratko-fg))] text-center ${RATKO_TEKSTIKOKO[koko]} font-bold border-b border-r border-[hsl(var(--ratko-fg)/0.25)]`,
  stage: (koko) => `bg-slate-50 text-center ${TEKSTIKOKO[koko]} font-semibold text-slate-600 border-b border-r border-slate-200/60`
};

const SOLU_LUOKAT = {
  rank: (koko) => `text-center ${TEKSTIKOKO[koko]} font-medium text-slate-500 border-r border-slate-200`,
  name: (koko) => `${NIMI_ASETTELU[koko]} ${TEKSTIKOKO[koko]} font-semibold text-slate-900 border-r border-slate-200`,
  series: (koko) => `text-center ${TEKSTIKOKO[koko]} text-slate-600 border-r border-slate-200/60`,
  sum: (koko) => `text-center font-mono ${TEKSTIKOKO[koko]} font-bold text-slate-900 border-r border-slate-300 bg-slate-100/60`,
  ratko: (koko) => `text-center ${RATKO_TEKSTIKOKO[koko]} border-r border-[hsl(var(--ratko-fg)/0.22)] bg-[hsl(var(--ratko-bg)/0.45)] text-[hsl(var(--ratko-fg))]`,
  stage: (koko) => `text-center font-mono ${TEKSTIKOKO[koko]} border-r border-slate-200/40`
};

export default function HenkiloTaulukko({ data, parsedRows, parsedSpeksit, kisaStatus, locale = 'fi' }) {
  const tx = haeTekstit('henkiloTaulukko', locale);
  const onMobiili = useMediaQuery('(max-width: 759px)');
  const [onkoKompaktiTila, setOnkoKompaktiTila] = useState(true);
  const [onkoKokoNaytto, setOnkoKokoNaytto] = useState(false);
  const [naytaRataAnalyysi, setNaytaRataAnalyysi] = useState(false);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('OPEN (Y)');
  const [jarjestysSarake, setJarjestysSarake] = useState('sija');
  const [jarjestysSuunta, setJarjestysSuunta] = useState('asc');
  const sarjaScrollRef = useRef(null);
  const taulukkoScrollRef = useRef(null);
  const [taulukkoReunaVarjot, setTaulukkoReunaVarjot] = useState({ vasen: false, oikea: false });
  const [taulukkoNakymaLeveys, setTaulukkoNakymaLeveys] = useState(0);
  
  const sarjaDragRef = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false
  });

  const taulukkoDragRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    moved: false
  });
  
  const kaytaKompaktiTilaa = onMobiili && onkoKompaktiTila;

  // 1. PARSITAAN KISASPEKSIT
  const speksit = useMemo(() => {
    const perfStart = perfNow();
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
  const henkiloRivit = useMemo(() => {
    if (!data?.henkilotCsvRaw) return null;
    return Array.isArray(parsedRows?.henkilotRows)
      ? parsedRows.henkilotRows
      : parseCsvRows(data.henkilotCsvRaw);
  }, [data, parsedRows]);

  const ampujat = useMemo(() => {
    const perfStart = perfNow();
    if (!henkiloRivit) return [];

    try {
      const raakaRivit = henkiloRivit;
      if (!Array.isArray(raakaRivit) || raakaRivit.length < 2) return [];

      const lista = parsiTaulukkoAmpujat(raakaRivit, speksit.ratojenMaara);
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
  }, [henkiloRivit, speksit.ratojenMaara]);

  const onkoDataPuuttuu = !data || !data.henkilotCsvRaw;
  const radatList = useMemo(() => Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1), [speksit.ratojenMaara]);
  
  const loydetytSarjat = useMemo(
    () => Array.from(new Set(ampujat.map((a) => String(a.sarja || '').trim()).filter(Boolean))).sort(),
    [ampujat]
  );
  
  const sijoitetutAmpujat = useMemo(() => {
    const perfStart = perfNow();
    const result = laskeHenkilosijoitukset(ampujat, sarjaSuodatin, speksit.ratkoPalkintoSija);
    logPerf('sijoitetutAmpujat', perfStart, {
      sarja: sarjaSuodatin,
      source: ampujat.length,
      shown: result.length
    });
    return result;
  }, [ampujat, sarjaSuodatin, speksit.ratkoPalkintoSija]);

  const naytettavatAmpujat = useMemo(() => {
    const perfStart = perfNow();
    const result = jarjestaAmpujat(sijoitetutAmpujat, jarjestysSarake, jarjestysSuunta);

    logPerf('naytettavatAmpujatSorted', perfStart, {
      sarja: sarjaSuodatin,
      sortColumn: jarjestysSarake,
      sortDir: jarjestysSuunta,
      source: sijoitetutAmpujat.length,
      shown: result.length
    });
    return result;
  }, [sijoitetutAmpujat, jarjestysSarake, jarjestysSuunta, sarjaSuodatin]);

  const naytaRatkoIds = useMemo(() => {
    const perfStart = perfNow();
    const result = laskeNaytettavatRatkoIdt(sijoitetutAmpujat, sarjaSuodatin, speksit.ratkoPalkintoSija);
    logPerf('naytaRatkoIds', perfStart, {
      sarja: sarjaSuodatin,
      shown: sijoitetutAmpujat.length,
      ratko: result.size
    });
    return result;
  }, [sijoitetutAmpujat, sarjaSuodatin, speksit.ratkoPalkintoSija]);

  const onkoRatkoSallittuAmpujalle = (ampuja) => naytaRatkoIds.has(ampuja?.id);

  const naytaRatkoSarake = naytettavatAmpujat.some((a) => {
    const onStatus = (a.ratkoNaytto?.statusEtiketit?.length || 0) > 0;
    const onTeksti = Boolean(a.ratkoNaytto?.teksti);
    return onStatus || (onkoRatkoSallittuAmpujalle(a) && onTeksti);
  });

  const paivaSarakeNimet = useMemo(
    () => tunnistaPaivaSarakeNimet(henkiloRivit, locale),
    [henkiloRivit, locale]
  );

  const naytaLaSarake = !kaytaKompaktiTilaa && ampujat.some((a) => a.la !== null);
  const naytaSuSarake = !kaytaKompaktiTilaa && ampujat.some((a) => a.su !== null);

  const rataTilastot = useMemo(() => {
    return laskeRataTilastot(naytettavatAmpujat, radatList, speksit.asemaMaksimit);
  }, [naytettavatAmpujat, radatList, speksit.asemaMaksimit]);

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

  useEffect(() => {
    if (!onkoKokoNaytto || typeof window === 'undefined' || typeof document === 'undefined') return;

    const alkuperainenOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const kasitteleEsc = (event) => {
      if (event.key === 'Escape') {
        setOnkoKokoNaytto(false);
      }
    };

    window.addEventListener('keydown', kasitteleEsc);
    return () => {
      window.removeEventListener('keydown', kasitteleEsc);
      document.body.style.overflow = alkuperainenOverflow;
    };
  }, [onkoKokoNaytto]);


  const muotoileNimiTaulukkoon = (nimi) => {
    if (!onMobiili) return nimi;
    const osat = String(nimi || '').trim().split(/\s+/).filter(Boolean);
    if (osat.length <= 1) return nimi;
    if (!kaytaKompaktiTilaa) return nimi;
    return osat
      .map((osa, idx) => (idx === 0 ? osa : `${osa.charAt(0)}.`))
      .join(' ');
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

  const onTaulukkoPointerDown = (event) => {
    if (!onMobiili) return;
    if (event.pointerType !== 'mouse') return;
    if (event.button !== 0) return;

    const target = event.target;
    if (
      target instanceof Element
      && target.closest('button, a, input, select, textarea, [role="button"]')
    ) {
      return;
    }

    const container = taulukkoScrollRef.current;
    if (!container) return;

    taulukkoDragRef.current.isDown = true;
    taulukkoDragRef.current.startX = event.clientX;
    taulukkoDragRef.current.startY = event.clientY;
    taulukkoDragRef.current.scrollLeft = container.scrollLeft;
    taulukkoDragRef.current.scrollTop = container.scrollTop;
    taulukkoDragRef.current.moved = false;
  };

  const onTaulukkoPointerMove = (event) => {
    if (!onMobiili) return;
    const container = taulukkoScrollRef.current;
    const state = taulukkoDragRef.current;
    if (!container || !state.isDown) return;

    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      state.moved = true;
    }

    container.scrollLeft = state.scrollLeft - deltaX;
    container.scrollTop = state.scrollTop - deltaY;
  };

  const onTaulukkoPointerUp = () => {
    taulukkoDragRef.current.isDown = false;
  };

  const onTaulukkoClickCapture = (event) => {
    if (!taulukkoDragRef.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    taulukkoDragRef.current.moved = false;
  };

  // --- DYNAMIC WIDTH CALCULATIONS ---
  const rankColWidth = kaytaKompaktiTilaa ? 24 : (onMobiili ? 24 : 35);
  const nameColWidth = kaytaKompaktiTilaa ? 90 : (onMobiili ? 154 : 200);
  const totalColWidth = kaytaKompaktiTilaa ? 24 : (onMobiili ? 24 : 35);
  const ratkoColWidth = kaytaKompaktiTilaa ? 30 : (onMobiili ? 42 : 52);
  const stageColWidth = kaytaKompaktiTilaa ? 18 : (onMobiili ? 24 : 30);
  const categoryColWidth = onMobiili ? 20 : 50;
  const clubColWidth = onMobiili ? 30 : 54;
  const paivaColWidth = onMobiili ? 24 : 35;
  const taulukkoKorkeusLuokka = onkoKokoNaytto ? 'h-[calc(100vh-170px)] md:h-[calc(100vh-176px)]' : 'h-[60vh] md:h-[68vh]';
  const laskettuStageColWidth = useMemo(() => {
    if (!kaytaKompaktiTilaa) return stageColWidth;
    if (radatList.length === 0 || taulukkoNakymaLeveys <= 0) return stageColWidth;

    // Fill compact-mode whitespace with stage columns, but cap growth to avoid oversized cells.
    const kiinteaLeveys = rankColWidth + nameColWidth + totalColWidth + (naytaRatkoSarake ? ratkoColWidth : 0);
    const tavoite = Math.floor((taulukkoNakymaLeveys - kiinteaLeveys - 8) / radatList.length);
    return Math.max(stageColWidth, Math.min(26, tavoite));
  }, [
    kaytaKompaktiTilaa,
    stageColWidth,
    radatList.length,
    taulukkoNakymaLeveys,
    rankColWidth,
    nameColWidth,
    totalColWidth,
    naytaRatkoSarake,
    ratkoColWidth
  ]);

  useEffect(() => {
    const container = taulukkoScrollRef.current;
    if (!container) return;

    const paivitaLeveys = () => {
      const seuraava = container.clientWidth || 0;
      setTaulukkoNakymaLeveys((nykyinen) => (nykyinen === seuraava ? nykyinen : seuraava));
    };

    paivitaLeveys();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(paivitaLeveys);
      observer.observe(container);
    } else {
      window.addEventListener('resize', paivitaLeveys);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', paivitaLeveys);
      }
    };
  }, [onkoKokoNaytto, onMobiili]);

  useEffect(() => {
    if (!onMobiili) return;
    const container = taulukkoScrollRef.current;
    if (!container) return;

    const paivitaReunaVarjot = () => {
      const toleranssi = 2;
      const maksimiVasen = container.scrollWidth - container.clientWidth;
      const voiScrollataSivulle = maksimiVasen > toleranssi;
      const vasen = voiScrollataSivulle && container.scrollLeft > toleranssi;
      const oikea = voiScrollataSivulle && container.scrollLeft < (maksimiVasen - toleranssi);
      setTaulukkoReunaVarjot((nykyinen) => (
        nykyinen.vasen === vasen && nykyinen.oikea === oikea ? nykyinen : { vasen, oikea }
      ));
    };

    let frameId = null;
    const paivita = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        paivitaReunaVarjot();
      });
    };
    paivita();

    container.addEventListener('scroll', paivita, { passive: true });
    window.addEventListener('resize', paivita);
    return () => {
      container.removeEventListener('scroll', paivita);
      window.removeEventListener('resize', paivita);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [onMobiili, onkoKokoNaytto, kaytaKompaktiTilaa, naytaRatkoSarake, naytaLaSarake, naytaSuSarake, radatList.length]);

  const muotoilePaivaTulos = (arvo) => {
    const teksti = String(arvo ?? '').trim();
    return teksti || '—';
  };

  const paivitaJarjestys = (sarake) => {
    const onSamaSarake = jarjestysSarake === sarake;
    setJarjestysSuunta((vanha) => (onSamaSarake ? (vanha === 'asc' ? 'desc' : 'asc') : 'desc'));
    setJarjestysSarake(sarake);
  };

  const jarjestysMerkki = (sarake) => {
    if (jarjestysSarake !== sarake) return '';
    return jarjestysSuunta === 'asc' ? ' ▲' : ' ▼';
  };

  const numerotFormatter = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale]
  );
  const prosenttiFormatter = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [locale]
  );

  const muotoileNumero = (arvo) => (arvo == null ? '—' : numerotFormatter.format(arvo));
  const muotoileProsentti = (arvo) => (arvo == null ? '—' : `${prosenttiFormatter.format(arvo)}%`);

  const naytaSarjaSarake = !kaytaKompaktiTilaa && sarjaSuodatin === 'OPEN (Y)';

  const etusarakkeetMaara = 2
    + (naytaSarjaSarake ? 1 : 0)
    + (kaytaKompaktiTilaa ? 0 : 1)
    + (naytaLaSarake ? 1 : 0)
    + (naytaSuSarake ? 1 : 0)
    + 1
    + (naytaRatkoSarake ? 1 : 0);

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

  const otsikkoLuokka = (tyyppi) => (OTSIKKO_LUOKAT[tyyppi] || OTSIKKO_LUOKAT.stage)(kokoLuokka);
  const soluLuokka = (tyyppi) => (SOLU_LUOKAT[tyyppi] || SOLU_LUOKAT.stage)(kokoLuokka);

  // Hookit kutsuttava ennen tätä, jotta niiden järjestys pysyy samana joka renderöinnissä.
  if (onkoDataPuuttuu) {
    return <div className="py-6 text-sm text-slate-500">{tx.loading}</div>;
  }

  return (
    <Card className={cn(
      'border-slate-200 shadow-sm overflow-hidden',
      onkoKokoNaytto && 'fixed inset-0 z-[70] m-0 rounded-none border-0 shadow-none'
    )}>
      <CardHeader className={cn(
        'gap-3 px-4 pb-3 pt-4 md:p-6 md:pb-4 border-b bg-slate-50/50',
        onkoKokoNaytto && 'sticky top-0 z-[71] bg-white/95 backdrop-blur-sm'
      )}>
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

          <div className="flex w-full items-center gap-1.5 self-start overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:self-auto sm:overflow-visible">
            {onMobiili && (
              <div className="flex shrink-0 gap-1.5 rounded-lg bg-slate-100 p-1">
                <Button
                  type="button"
                  onClick={() => setOnkoKompaktiTila(false)}
                  size="sm"
                  variant={!onkoKompaktiTila ? 'default' : 'outline'}
                  className={cn(
                    'h-7 rounded-md px-3 text-xs font-semibold shadow-none'
                  )}
                >
                  {tx.normal}
                </Button>
                <Button
                  type="button"
                  onClick={() => setOnkoKompaktiTila(true)}
                  size="sm"
                  variant={onkoKompaktiTila ? 'default' : 'outline'}
                  className={cn(
                    'h-7 rounded-md px-3 text-xs font-semibold shadow-none'
                  )}
                >
                  {tx.compact}
                </Button>
              </div>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-3 text-xs font-semibold"
              onClick={() => setOnkoKokoNaytto((prev) => !prev)}
            >
              {onkoKokoNaytto ? tx.exitFullscreen : tx.fullscreen}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-3 text-xs font-semibold"
              onClick={() => setNaytaRataAnalyysi((prev) => !prev)}
            >
              {naytaRataAnalyysi ? tx.hideStageAnalytics : tx.showStageAnalytics}
            </Button>
          </div>
        </div>

      </CardHeader>

      <CardContent className="p-0 relative">
        <div
          ref={taulukkoScrollRef}
          className={cn(
            'w-full overflow-auto bg-white',
            taulukkoKorkeusLuokka,
            onMobiili && 'cursor-grab active:cursor-grabbing'
          )}
          style={onMobiili ? { touchAction: 'pan-x pan-y' } : undefined}
          onPointerDown={onMobiili ? onTaulukkoPointerDown : undefined}
          onPointerMove={onMobiili ? onTaulukkoPointerMove : undefined}
          onPointerUp={onMobiili ? onTaulukkoPointerUp : undefined}
          onPointerCancel={onMobiili ? onTaulukkoPointerUp : undefined}
          onPointerLeave={onMobiili ? onTaulukkoPointerUp : undefined}
          onClickCapture={onMobiili ? onTaulukkoClickCapture : undefined}
        >
          <table className="border-separate border-spacing-0 table-fixed min-w-max text-left border-collapse">
                    <thead>
                      <tr className="h-9 md:h-11">
                        
                        {/* Sticky Header Box: Rank */}
                        <th
                          className={cn(otsikkoLuokka('fixed'), 'sticky left-0 top-0 z-45 shadow-[1px_0_0_0_rgba(226,232,240,1)]')}
                          style={stickyRankStyle}
                        >
                          <button type="button" className="w-full" onClick={() => paivitaJarjestys('sija')}>
                            {tx.rank}{jarjestysMerkki('sija')}
                          </button>
                        </th>
                        
                        {/* Sticky Header Box: Name */}
                        <th
                          className={cn(otsikkoLuokka('fixed'), 'sticky top-0 z-45 text-left px-2 md:px-3 shadow-[1px_0_0_0_rgba(226,232,240,1)]')}
                          style={stickyNameStyle}
                        >
                          <button type="button" className="w-full text-left" onClick={() => paivitaJarjestys('nimi')}>
                            {tx.name}{jarjestysMerkki('nimi')}
                          </button>
                        </th>
                        
                        {naytaSarjaSarake && (
                          <th className={cn(otsikkoLuokka('fixed'), 'sticky top-0 z-30')} style={{ width: `${categoryColWidth}px` }}>
                            <button type="button" className="w-full" onClick={() => paivitaJarjestys('sarja')}>
                              {tx.classLabel}{jarjestysMerkki('sarja')}
                            </button>
                          </th>
                        )}

                        {!kaytaKompaktiTilaa && (
                          <th className={cn(otsikkoLuokka('fixed'), 'sticky top-0 z-30 text-left px-2 md:px-3')} style={{ width: `${clubColWidth}px` }}>
                            <button type="button" className="w-full text-left" onClick={() => paivitaJarjestys('seura')}>
                              {tx.clubLabel}{jarjestysMerkki('seura')}
                            </button>
                          </th>
                        )}

                        {naytaLaSarake && (
                          <th className={cn(otsikkoLuokka('stage'), 'sticky top-0 z-30')} style={{ width: `${paivaColWidth}px` }}>
                            <button type="button" className="w-full" onClick={() => paivitaJarjestys('la')}>
                              {paivaSarakeNimet.laLabel}{jarjestysMerkki('la')}
                            </button>
                          </th>
                        )}

                        {naytaSuSarake && (
                          <th className={cn(otsikkoLuokka('stage'), 'sticky top-0 z-30')} style={{ width: `${paivaColWidth}px` }}>
                            <button type="button" className="w-full" onClick={() => paivitaJarjestys('su')}>
                              {paivaSarakeNimet.suLabel}{jarjestysMerkki('su')}
                            </button>
                          </th>
                        )}
                        
                        <th className={cn(otsikkoLuokka('sum'), 'sticky top-0 z-30')} style={{ width: `${totalColWidth}px` }}>
                          <button type="button" className="w-full" onClick={() => paivitaJarjestys('tulos')}>
                            {tx.total}{jarjestysMerkki('tulos')}
                          </button>
                        </th>
                        
                        {naytaRatkoSarake && (
                          <th className={cn(otsikkoLuokka('ratko'), 'sticky top-0 z-30')} style={{ width: `${ratkoColWidth}px` }}>
                            <button type="button" className="w-full" onClick={() => paivitaJarjestys('ratko')}>
                              Ratko{jarjestysMerkki('ratko')}
                            </button>
                          </th>
                        )}
                        
                        {radatList.map(n => (
                          <th
                            key={n}
                            className={cn(otsikkoLuokka('stage'), 'sticky top-0 z-30')}
                            style={{ width: `${laskettuStageColWidth}px` }}
                          >
                            <button type="button" className="w-full" onClick={() => paivitaJarjestys(`era-${n}`)}>
                              {n}{jarjestysMerkki(`era-${n}`)}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    
                    <tbody className="divide-y divide-slate-100">
                      {naytaRataAnalyysi && (
                        <>
                          <tr className="h-8 bg-amber-50/70">
                            <td colSpan={etusarakkeetMaara} className="px-2 text-[11px] font-semibold text-slate-700 border-r border-slate-200">
                              {tx.analyticsAvg}
                            </td>
                            {rataTilastot.map((tilasto) => (
                              <td
                                key={`analyysi-ka-${tilasto.rataNumero}`}
                                style={{ width: `${laskettuStageColWidth}px` }}
                                className="text-center text-[10px] font-semibold text-slate-700 border-r border-slate-200/60"
                              >
                                {tilasto.count > 0 ? `${muotoileNumero(tilasto.avg)} (${tilasto.count})` : '—'}
                              </td>
                            ))}
                          </tr>
                          <tr className="h-8 bg-amber-50/40">
                            <td colSpan={etusarakkeetMaara} className="px-2 text-[11px] font-semibold text-slate-700 border-r border-slate-200">
                              {tx.analyticsDetails}
                            </td>
                            {rataTilastot.map((tilasto) => (
                              <td
                                key={`analyysi-detail-${tilasto.rataNumero}`}
                                style={{ width: `${laskettuStageColWidth}px` }}
                                className="text-center text-[9px] leading-tight text-slate-700 border-r border-slate-200/60"
                                title={`Md ${muotoileNumero(tilasto.median)} | Max ${muotoileProsentti(tilasto.maxPct)}`}
                              >
                                {`Md ${muotoileNumero(tilasto.median)} · Max ${muotoileProsentti(tilasto.maxPct)}`}
                              </td>
                            ))}
                          </tr>
                        </>
                      )}
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
                              <span translate="no" className="truncate">{muotoileNimiTaulukkoon(ampuja.nimi)}</span>
                              {naytaValmiusIndikaattori && (
                                <span
                                  className={cn(
                                    'inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/5',
                                    onkoAmpujaValmis(ampuja)
                                      ? 'bg-[hsl(var(--status-ready))]'
                                      : 'bg-[hsl(var(--status-missing))]'
                                  )}
                                  title={onkoAmpujaValmis(ampuja) ? tx.allStagesReady : tx.stagesMissing}
                                />
                              )}
                            </div>
                          </td>
                          
                          {naytaSarjaSarake && (
                            <td className={cn(soluLuokka('series'), 'bg-white group-hover:bg-slate-50/30')} style={{ width: `${categoryColWidth}px` }}>
                              {ampuja.sarja}
                            </td>
                          )}

                          {!kaytaKompaktiTilaa && (
                            <td className={cn('bg-white group-hover:bg-slate-50/30 text-left text-xs md:text-sm text-slate-700 border-r border-slate-200/60 px-2 md:px-3 truncate')} style={{ width: `${clubColWidth}px` }}>
                              <span translate="no">{ampuja.seura || '—'}</span>
                            </td>
                          )}

                          {naytaLaSarake && (
                            <td className={cn(soluLuokka('stage'), 'bg-white group-hover:bg-slate-50/30 transition-colors text-slate-700')} style={{ width: `${paivaColWidth}px` }}>
                              {muotoilePaivaTulos(ampuja.la)}
                            </td>
                          )}

                          {naytaSuSarake && (
                            <td className={cn(soluLuokka('stage'), 'bg-white group-hover:bg-slate-50/30 transition-colors text-slate-700')} style={{ width: `${paivaColWidth}px` }}>
                              {muotoilePaivaTulos(ampuja.su)}
                            </td>
                          )}
                          
                          <td className={soluLuokka('sum')} style={{ width: `${totalColWidth}px` }}>
                            {ampuja.kokonaistulos}
                          </td>
                          
                          {naytaRatkoSarake && (
                            <td
                              className={cn(soluLuokka('ratko'), 'align-middle px-0.5')}
                              style={{ width: `${ratkoColWidth}px` }}
                              title={[...ampuja.ratkoNaytto.statusEtiketit, ampuja.ratkoNaytto.teksti].filter(Boolean).join(' | ')}
                            >
                              {(() => {
                                const onkoRatkoSallittu = onkoRatkoSallittuAmpujalle(ampuja);
                                const naytaRatko = onkoRatkoSallittu && Boolean(ampuja.ratkoNaytto.teksti);
                                const naytaRatkoStatus = ampuja.ratkoNaytto.statusEtiketit.length > 0;

                                if (!(naytaRatkoStatus || (naytaRatko && ampuja.ratkoNaytto.teksti))) {
                                  return <span className="text-slate-300">—</span>;
                                }

                                if (kaytaKompaktiTilaa) {
                                  const compactText = naytaRatkoStatus
                                    ? ampuja.ratkoNaytto.statusEtiketit.join('/')
                                    : ampuja.ratkoNaytto.teksti;

                                  if (naytaRatkoStatus) {
                                    const compactToneStatus = ampuja.ratkoNaytto.statusEtiketit[0] || '';
                                    return (
                                      <span
                                        className={cn(
                                          'inline-flex max-w-full items-center justify-center truncate mx-auto',
                                          getStatusLabelSizeClass({ compact: true }),
                                          getStatusLabelToneClass(compactToneStatus)
                                        )}
                                        title={compactText}
                                      >
                                        {compactText}
                                      </span>
                                    );
                                  }

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
                                style={{ width: `${laskettuStageColWidth}px` }}
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
        </div>

        {onMobiili && taulukkoReunaVarjot.vasen && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-4 bg-gradient-to-r from-slate-200/80 to-transparent" />
        )}
        {onMobiili && taulukkoReunaVarjot.oikea && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-4 bg-gradient-to-l from-slate-200/80 to-transparent" />
        )}
      </CardContent>
    </Card>
  );
}
