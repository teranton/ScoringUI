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
  const [onkoKokoNaytto, setOnkoKokoNaytto] = useState(false);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('OPEN (Y)');
  const [jarjestysSarake, setJarjestysSarake] = useState('sija');
  const [jarjestysSuunta, setJarjestysSuunta] = useState('asc');
  const sarjaScrollRef = useRef(null);
  const taulukkoScrollRef = useRef(null);
  const taulukkoReunaVarjotRef = useRef({ vasen: false, oikea: false });
  const [taulukkoReunaVarjot, setTaulukkoReunaVarjot] = useState({ vasen: false, oikea: false });
  
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
      const idxLa = etsiSarakkeenIndeksi([(h) => h === 'LA', (h) => h.startsWith('LAUANTAI')]);
      const idxSu = etsiSarakkeenIndeksi([(h) => h === 'SU', (h) => h.startsWith('SUNNUNTAI')]);
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
        const seura = idxSeura !== -1 ? (row[idxSeura] || '') : '';
        const la = idxLa !== -1 ? (row[idxLa] || '') : null;
        const su = idxSu !== -1 ? (row[idxSu] || '') : null;
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
          seura,
          la,
          su,
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
  
  const sijoitetutAmpujat = useMemo(() => {
    const perfStart = typeof performance !== 'undefined' ? performance.now() : 0;
    const result = laskeHenkilosijoitukset(ampujat, sarjaSuodatin);
    logPerf('sijoitetutAmpujat', perfStart, {
      sarja: sarjaSuodatin,
      source: ampujat.length,
      shown: result.length
    });
    return result;
  }, [ampujat, sarjaSuodatin]);

  const naytettavatAmpujat = useMemo(() => {
    const perfStart = typeof performance !== 'undefined' ? performance.now() : 0;
    const numOrMin = (value) => {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? Number.MIN_SAFE_INTEGER : parsed;
    };

    const haeArvo = (ampuja, sarake) => {
      if (sarake === 'sija') return numOrMin(ampuja?.laskettuSija);
      if (sarake === 'nimi') return String(ampuja?.nimi || '').toLowerCase();
      if (sarake === 'sarja') return String(ampuja?.sarja || '').toLowerCase();
      if (sarake === 'seura') return String(ampuja?.seura || '').toLowerCase();
      if (sarake === 'la') return numOrMin(ampuja?.la);
      if (sarake === 'su') return numOrMin(ampuja?.su);
      if (sarake === 'tulos') return numOrMin(ampuja?.kokonaistulos || ampuja?.tulos);
      if (sarake === 'ratko') {
        const ratkoTeksti = `${ampuja?.ratko || ''} ${ampuja?.ratko2 || ''}`.trim();
        const ratkoNumero = parseInt(ratkoTeksti, 10);
        if (!Number.isNaN(ratkoNumero)) return ratkoNumero;
        return ratkoTeksti.toLowerCase();
      }
      if (sarake.startsWith('era-')) {
        const eraNumero = parseInt(sarake.split('-')[1], 10);
        return numOrMin(ampuja?.erat?.[eraNumero]);
      }
      return String(ampuja?.nimi || '').toLowerCase();
    };

    const result = [...sijoitetutAmpujat].sort((a, b) => {
      const arvoA = haeArvo(a, jarjestysSarake);
      const arvoB = haeArvo(b, jarjestysSarake);

      if (typeof arvoA === 'number' && typeof arvoB === 'number') {
        if (arvoA === arvoB) return 0;
        return jarjestysSuunta === 'asc' ? arvoA - arvoB : arvoB - arvoA;
      }

      const cmp = String(arvoA).localeCompare(String(arvoB), 'fi', { sensitivity: 'base', numeric: true });
      return jarjestysSuunta === 'asc' ? cmp : -cmp;
    });

    logPerf('naytettavatAmpujatSorted', perfStart, {
      sarja: sarjaSuodatin,
      sortColumn: jarjestysSarake,
      sortDir: jarjestysSuunta,
      source: sijoitetutAmpujat.length,
      shown: result.length
    });
    return result;
  }, [sijoitetutAmpujat, jarjestysSarake, jarjestysSuunta, sarjaSuodatin]);

  const openRatkoRajatulos = useMemo(() => {
    const perfStart = typeof performance !== 'undefined' ? performance.now() : 0;
    if (sarjaSuodatin !== 'OPEN (Y)' || sijoitetutAmpujat.length < 3) {
      return null;
    }
    const kolmasTulos = parseInt(sijoitetutAmpujat[2]?.tulos, 10);
    const result = Number.isNaN(kolmasTulos) ? null : kolmasTulos;
    logPerf('openRatkoRajatulos', perfStart, {
      sarja: sarjaSuodatin,
      shown: sijoitetutAmpujat.length,
      raja: result
    });
    return result;
  }, [sijoitetutAmpujat, sarjaSuodatin]);

  const onkoRatkoSallittuAmpujalle = (ampuja) => {
    if (sarjaSuodatin !== 'OPEN (Y)' || openRatkoRajatulos === null) return true;
    const tulosNum = parseInt(ampuja?.tulos, 10);
    if (Number.isNaN(tulosNum)) return false;
    return tulosNum >= openRatkoRajatulos;
  };

  const naytaRatkoSarake = naytettavatAmpujat.some((a) => {
    const onStatus = (a.ratkoNaytto?.statusEtiketit?.length || 0) > 0;
    const onTeksti = Boolean(a.ratkoNaytto?.teksti);
    return onStatus || (onkoRatkoSallittuAmpujalle(a) && onTeksti);
  });

  const naytaLaSarake = !kaytaKompaktiTilaa && ampujat.some((a) => a.la !== null);
  const naytaSuSarake = !kaytaKompaktiTilaa && ampujat.some((a) => a.su !== null);

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

  const tx = locale === 'en'
    ? {
      loading: 'Loading table data...',
      title: 'All Results (Table)',
      normal: 'Normal',
      compact: 'Compact',
      fullscreen: 'Fullscreen Sheet',
      exitFullscreen: 'Exit Fullscreen',
      rank: 'Rank',
      name: 'Name',
      classLabel: 'Class',
      clubLabel: 'Club',
      laLabel: 'Sat',
      suLabel: 'Sun',
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
      fullscreen: 'Koko näyttö',
      exitFullscreen: 'Poistu koko näytöstä',
      rank: 'Sija',
      name: 'Nimi',
      classLabel: 'Sarja',
      clubLabel: 'Seura',
      laLabel: 'La',
      suLabel: 'Su',
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
  const rankColWidth = kaytaKompaktiTilaa ? 24 : (onMobiili ? 30 : 40);
  const nameColWidth = kaytaKompaktiTilaa ? 90 : (onMobiili ? 154 : 240);
  const totalColWidth = kaytaKompaktiTilaa ? 24 : (onMobiili ? 30 : 40);
  const ratkoColWidth = kaytaKompaktiTilaa ? 40 : (onMobiili ? 52 : 72);
  const stageColWidth = kaytaKompaktiTilaa ? 18 : (onMobiili ? 30 : 40);
  const categoryColWidth = onMobiili ? 50 : 56;
  const clubColWidth = onMobiili ? 56 : 64;
  const paivaColWidth = onMobiili ? 30 : 40;
  const taulukkoKorkeusLuokka = onkoKokoNaytto ? 'h-[calc(100vh-170px)] md:h-[calc(100vh-176px)]' : 'h-[60vh] md:h-[68vh]';

  const paivitaTaulukkoReunaVarjot = () => {
    const container = taulukkoScrollRef.current;
    if (!container || !onMobiili) {
      const seuraava = { vasen: false, oikea: false };
      if (
        taulukkoReunaVarjotRef.current.vasen !== seuraava.vasen
        || taulukkoReunaVarjotRef.current.oikea !== seuraava.oikea
      ) {
        taulukkoReunaVarjotRef.current = seuraava;
        setTaulukkoReunaVarjot(seuraava);
      }
      return;
    }

    const toleranssi = 2;
    const maksimiVasen = container.scrollWidth - container.clientWidth;
    const voiScrollataSivulle = maksimiVasen > toleranssi;

    if (!voiScrollataSivulle) {
      const seuraava = { vasen: false, oikea: false };
      if (
        taulukkoReunaVarjotRef.current.vasen !== seuraava.vasen
        || taulukkoReunaVarjotRef.current.oikea !== seuraava.oikea
      ) {
        taulukkoReunaVarjotRef.current = seuraava;
        setTaulukkoReunaVarjot(seuraava);
      }
      return;
    }

    const vasen = container.scrollLeft > toleranssi;
    const oikea = container.scrollLeft < (maksimiVasen - toleranssi);
    const seuraava = { vasen, oikea };
    if (
      taulukkoReunaVarjotRef.current.vasen !== seuraava.vasen
      || taulukkoReunaVarjotRef.current.oikea !== seuraava.oikea
    ) {
      taulukkoReunaVarjotRef.current = seuraava;
      setTaulukkoReunaVarjot(seuraava);
    }
  };

  useEffect(() => {
    if (!onMobiili) return;
    const container = taulukkoScrollRef.current;
    if (!container) return;

    let frameId = null;
    const paivita = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        paivitaTaulukkoReunaVarjot();
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
      if (kokoLuokka === 'compact') return 'bg-[hsl(var(--ratko-bg))] text-[hsl(var(--ratko-fg))] text-center text-[10px] font-bold border-b border-r border-[hsl(var(--ratko-fg)/0.25)]';
      if (kokoLuokka === 'mobile') return 'bg-[hsl(var(--ratko-bg))] text-[hsl(var(--ratko-fg))] text-center text-xs font-bold border-b border-r border-[hsl(var(--ratko-fg)/0.25)]';
      return 'bg-[hsl(var(--ratko-bg))] text-[hsl(var(--ratko-fg))] text-center text-sm font-bold border-b border-r border-[hsl(var(--ratko-fg)/0.25)]';
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
      if (kokoLuokka === 'compact') return 'text-center text-[10px] border-r border-[hsl(var(--ratko-fg)/0.22)] bg-[hsl(var(--ratko-bg)/0.45)] text-[hsl(var(--ratko-fg))]';
      if (kokoLuokka === 'mobile') return 'text-center text-xs border-r border-[hsl(var(--ratko-fg)/0.22)] bg-[hsl(var(--ratko-bg)/0.45)] text-[hsl(var(--ratko-fg))]';
      return 'text-center text-sm border-r border-[hsl(var(--ratko-fg)/0.22)] bg-[hsl(var(--ratko-bg)/0.45)] text-[hsl(var(--ratko-fg))]';
    }
    if (kokoLuokka === 'compact') return 'text-center font-mono text-[11px] border-r border-slate-200/40';
    if (kokoLuokka === 'mobile') return 'text-center font-mono text-xs border-r border-slate-200/40';
    return 'text-center font-mono text-sm border-r border-slate-200/40';
  };

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

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            {onMobiili && (
              <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setOnkoKompaktiTila(false)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all',
                    !onkoKompaktiTila ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {tx.normal}
                </button>
                <button
                  type="button"
                  onClick={() => setOnkoKompaktiTila(true)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all',
                    onkoKompaktiTila ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {tx.compact}
                </button>
              </div>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs font-semibold"
              onClick={() => setOnkoKokoNaytto((prev) => !prev)}
            >
              {onkoKokoNaytto ? tx.exitFullscreen : tx.fullscreen}
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
                        
                        {!kaytaKompaktiTilaa && (
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
                              {tx.laLabel}{jarjestysMerkki('la')}
                            </button>
                          </th>
                        )}

                        {naytaSuSarake && (
                          <th className={cn(otsikkoLuokka('stage'), 'sticky top-0 z-30')} style={{ width: `${paivaColWidth}px` }}>
                            <button type="button" className="w-full" onClick={() => paivitaJarjestys('su')}>
                              {tx.suLabel}{jarjestysMerkki('su')}
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
                            style={{ width: `${stageColWidth}px` }}
                          >
                            <button type="button" className="w-full" onClick={() => paivitaJarjestys(`era-${n}`)}>
                              {n}{jarjestysMerkki(`era-${n}`)}
                            </button>
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
                            <td className={cn(soluLuokka('series'), 'bg-white group-hover:bg-slate-50/30')} style={{ width: `${categoryColWidth}px` }}>
                              {ampuja.sarja}
                            </td>
                          )}

                          {!kaytaKompaktiTilaa && (
                            <td className={cn('bg-white group-hover:bg-slate-50/30 text-left text-xs md:text-sm text-slate-700 border-r border-slate-200/60 px-2 md:px-3 truncate')} style={{ width: `${clubColWidth}px` }}>
                              {ampuja.seura || '—'}
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
