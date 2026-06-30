// src/HenkiloTaulukko.jsx
import { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import {
  laskeHenkilosijoitukset,
  muodostaRatkoNakyma,
  parseAsemaSpeksitCsv
} from './utils/henkiloTulokset';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table';
import { cn } from './lib/utils';

export default function HenkiloTaulukko({ data, parsedRows, parsedSpeksit, kisaStatus, locale = 'fi' }) {
  const onMobiili = typeof window !== 'undefined' && window.innerWidth < 760;
  const [onkoKompaktiTila, setOnkoKompaktiTila] = useState(true);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('OPEN (Y)');
  const kaytaKompaktiTilaa = onMobiili && onkoKompaktiTila;

  // 1. PARSITAAN KISASPEKSIT (Ratojen määrä ja maksimit)
  const speksit = useMemo(() => {
    const parsed = (parsedSpeksit?.asemaMaksimit && parsedSpeksit?.asemaToiseksiParasKaytossa)
      ? parsedSpeksit
      : parseAsemaSpeksitCsv(data?.speksitCsvRaw);
    return {
      ...parsed,
      ratojenMaara: Object.keys(parsed.asemaMaksimit).length > 0 ? Object.keys(parsed.asemaMaksimit).length : 8
    };
  }, [data, parsedSpeksit]);

  // 2. PARSITAAN AMPUJIEN TULOKSET
  const ampujat = useMemo(() => {
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

      // Fallback datamalliin: nimi, sarja, seura, yhteistulos, LA, SU, sitten R1...
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

        // Kerätään radat dynaamisesti
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
      return lista;
    } catch (e) {
      console.error("Virhe taulukko-ampujien parsinnoissa:", e);
      return [];
    }
  }, [data, parsedRows, speksit.ratojenMaara]);

  // Luodaan lista radoista sarakeotsikoita varten (esim. [1, 2, 3...])
  const onkoDataPuuttuu = !data || !data.henkilotCsvRaw;
  const radatList = Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1);
  const loydetytSarjat = Array.from(new Set(ampujat.map((a) => String(a.sarja || '').trim()).filter(Boolean))).sort();
  const naytettavatAmpujat = useMemo(() => laskeHenkilosijoitukset(ampujat, sarjaSuodatin), [ampujat, sarjaSuodatin]);
  const naytaRatkoSarake = naytettavatAmpujat.some((a) => a.ratkoNaytto?.statusEtiketit?.length > 0 || (sarjaSuodatin !== 'OPEN (Y)' && a.ratkoNaytto?.teksti) || (sarjaSuodatin === 'OPEN (Y)' && parseInt(a.laskettuSija, 10) <= 3 && a.ratkoNaytto?.teksti));

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
      stagesMissing: 'Some stage scores are missing'
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
      stagesMissing: 'Alituloksia puuttuu'
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

  const statusLabelClass = (status) => {
    if (['DNS', 'DNF', 'DNQ', 'DSQ'].includes(status)) {
      return 'bg-[hsl(var(--status-alert-bg))] text-[hsl(var(--status-alert-fg))]';
    }
    return 'bg-[hsl(var(--status-neutral-bg))] text-[hsl(var(--status-neutral-fg))]';
  };

  const naytaValmiusIndikaattori = kisaStatus === 'kaynnissa';

  const kokoLuokka = onMobiili ? (kaytaKompaktiTilaa ? 'compact' : 'mobile') : 'desktop';

  const otsikkoLuokka = (tyyppi) => {
    if (tyyppi === 'fixed') {
      if (kokoLuokka === 'compact') return 'bg-slate-50 px-1 py-1 text-center text-[11px] font-semibold text-slate-600';
      if (kokoLuokka === 'mobile') return 'bg-slate-50 px-1 py-1.5 text-center text-xs font-semibold text-slate-600';
      return 'bg-slate-50 px-2 py-2 text-center text-sm font-semibold text-slate-600';
    }
    if (tyyppi === 'sum') {
      if (kokoLuokka === 'compact') return 'bg-slate-200 px-1 py-1 text-center text-[11px] font-bold text-slate-800';
      if (kokoLuokka === 'mobile') return 'bg-slate-200 px-1.5 py-1.5 text-center text-xs font-bold text-slate-800';
      return 'bg-slate-200 px-2 py-2 text-center text-sm font-bold text-slate-800';
    }
    if (tyyppi === 'ratko') {
      if (kokoLuokka === 'compact') return 'bg-[hsl(var(--ratko-bg))] px-1 py-1 text-center text-[11px] font-bold text-[hsl(var(--ratko-fg))]';
      if (kokoLuokka === 'mobile') return 'bg-[hsl(var(--ratko-bg))] px-1.5 py-1.5 text-center text-xs font-bold text-[hsl(var(--ratko-fg))]';
      return 'bg-[hsl(var(--ratko-bg))] px-2 py-2 text-center text-sm font-bold text-[hsl(var(--ratko-fg))]';
    }
    if (kokoLuokka === 'compact') return 'bg-slate-100 px-1 py-1 text-center text-[11px] font-semibold text-slate-700';
    if (kokoLuokka === 'mobile') return 'bg-slate-100 px-1 py-1.5 text-center text-xs font-semibold text-slate-700';
    return 'bg-slate-100 px-1.5 py-2 text-center text-sm font-semibold text-slate-700';
  };

  const soluLuokka = (tyyppi) => {
    if (tyyppi === 'rank') {
      if (kokoLuokka === 'compact') return 'bg-slate-50 px-1 py-1 text-center text-[11px] text-slate-500';
      if (kokoLuokka === 'mobile') return 'bg-slate-50 px-1 py-1.5 text-center text-xs text-slate-500';
      return 'bg-slate-50 px-1.5 py-2 text-center text-sm text-slate-500';
    }
    if (tyyppi === 'name') {
      if (kokoLuokka === 'compact') return 'max-w-[74px] truncate px-1 py-1 text-[11px] font-semibold text-slate-900';
      if (kokoLuokka === 'mobile') return 'max-w-[92px] truncate px-1.5 py-1.5 text-xs font-semibold text-slate-900';
      return 'px-2.5 py-2 text-sm font-semibold text-slate-900';
    }
    if (tyyppi === 'series') {
      if (kokoLuokka === 'mobile') return 'px-1 py-1.5 text-center text-xs text-slate-600';
      return 'px-1.5 py-2 text-center text-sm text-slate-600';
    }
    if (tyyppi === 'sum') {
      if (kokoLuokka === 'compact') return 'bg-slate-50 px-1 py-1 text-center font-mono text-[11px] font-bold text-slate-900';
      if (kokoLuokka === 'mobile') return 'bg-slate-50 px-1.5 py-1.5 text-center font-mono text-xs font-bold text-slate-900';
      return 'bg-slate-50 px-2.5 py-2 text-center font-mono text-sm font-bold text-slate-900';
    }
    if (tyyppi === 'ratko') {
      if (kokoLuokka === 'compact') return 'bg-[hsl(var(--ratko-bg))] px-1 py-1 text-center text-[11px] text-[hsl(var(--ratko-fg))]';
      if (kokoLuokka === 'mobile') return 'bg-[hsl(var(--ratko-bg))] px-1.5 py-1.5 text-center text-xs text-[hsl(var(--ratko-fg))]';
      return 'bg-[hsl(var(--ratko-bg))] px-2.5 py-2 text-center text-sm text-[hsl(var(--ratko-fg))]';
    }
    if (kokoLuokka === 'compact') return 'border-l border-slate-100 px-1 py-1 text-center font-mono text-[11px]';
    if (kokoLuokka === 'mobile') return 'border-l border-slate-100 px-1 py-1.5 text-center font-mono text-xs';
    return 'border-l border-slate-100 px-1 py-2 text-center font-mono text-sm';
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-3 pb-3">
        <CardTitle className="text-lg">{tx.title}</CardTitle>

        <div className="flex gap-2 overflow-x-auto">
        <Button
          type="button"
          onClick={() => setSarjaSuodatin('OPEN (Y)')}
          size="sm"
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
              variant={sarjaSuodatin === sarja ? 'default' : 'outline'}
            >
              {sarja}
            </Button>
          ))}
        </div>

        {onMobiili && (
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => setOnkoKompaktiTila(false)}
              size="sm"
              variant={!onkoKompaktiTila ? 'default' : 'outline'}
            >
              {tx.normal}
            </Button>
            <Button
              type="button"
              onClick={() => setOnkoKompaktiTila(true)}
              size="sm"
              variant={onkoKompaktiTila ? 'default' : 'outline'}
            >
              {tx.compact}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
      <div className="w-full overflow-x-auto rounded-md border border-slate-200 shadow-sm">
        <Table className="w-full border-collapse bg-white">
          <TableHeader>
            <TableRow>
              <TableHead className={otsikkoLuokka('fixed')}>{tx.rank}</TableHead>
              <TableHead className={cn(otsikkoLuokka('fixed'), 'text-left', kaytaKompaktiTilaa ? 'min-w-[70px]' : (onMobiili ? 'min-w-[96px]' : 'min-w-[160px]'))}>{tx.name}</TableHead>
              {!kaytaKompaktiTilaa && <TableHead className={otsikkoLuokka('fixed')}>{tx.classLabel}</TableHead>}
              <TableHead className={otsikkoLuokka('sum')}>{tx.total}</TableHead>
              {naytaRatkoSarake && <TableHead className={otsikkoLuokka('ratko')}>Ratko</TableHead>}
              {radatList.map(n => (
                <TableHead key={n} className={cn(otsikkoLuokka('stage'), kaytaKompaktiTilaa ? 'min-w-[18px]' : (onMobiili ? 'min-w-[22px]' : 'min-w-[32px]'))}>R{n}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {naytettavatAmpujat.map((ampuja) => (
              <TableRow key={ampuja.id}>
                <TableCell className={soluLuokka('rank')}>{ampuja.laskettuSija}</TableCell>
                <TableCell className={soluLuokka('name')}>
                  <span className="inline-flex items-center gap-1.5">
                    {muotoileNimiTaulukkoon(ampuja.nimi)}
                    {naytaValmiusIndikaattori && (
                      <span
                        className={cn(
                          'inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10',
                          onkoAmpujaValmis(ampuja) ? 'bg-[hsl(var(--status-ready))]' : 'bg-[hsl(var(--status-missing))]'
                        )}
                        title={onkoAmpujaValmis(ampuja) ? tx.allStagesReady : tx.stagesMissing}
                      />
                    )}
                  </span>
                </TableCell>
                {!kaytaKompaktiTilaa && <TableCell className={soluLuokka('series')}>{ampuja.sarja}</TableCell>}
                <TableCell className={soluLuokka('sum')}>{ampuja.kokonaistulos}</TableCell>
                {naytaRatkoSarake && (
                  <TableCell className={soluLuokka('ratko')}>
                    {(() => {
                      const naytaRatko = sarjaSuodatin !== 'OPEN (Y)' || parseInt(ampuja.laskettuSija, 10) <= 3;
                      return ampuja.ratkoNaytto.statusEtiketit.length > 0 || (naytaRatko && ampuja.ratkoNaytto.teksti) ? (
                      <span className="inline-flex flex-wrap items-center justify-center gap-1">
                        {ampuja.ratkoNaytto.statusEtiketit.map((status) => (
                          <span key={`${ampuja.id}-${status}`} className={cn('rounded px-1.5 py-0.5 text-[10px] font-extrabold leading-none', statusLabelClass(status))}>
                            {status}
                          </span>
                        ))}
                        {naytaRatko && ampuja.ratkoNaytto.teksti && <span className="font-semibold text-slate-800">{ampuja.ratkoNaytto.teksti}</span>}
                      </span>
                      ) : '-';
                    })()}
                  </TableCell>
                )}

                {radatList.map(n => {
                  const pisteArvo = ampuja.erat[n] || '-';
                  const pisteNum = parseInt(pisteArvo, 10);
                  const maksimiTulos = speksit.asemaMaksimit[n] || speksit.asemaMaksimit[`${n}`];
                  const naytaToiseksiParas = Boolean(speksit.asemaToiseksiParasKaytossa[n] ?? speksit.asemaToiseksiParasKaytossa[`${n}`]);
                  const onkoMaksimi = !isNaN(pisteNum) && maksimiTulos !== undefined && pisteNum === maksimiTulos;
                  const onkoToiseksiParas = !isNaN(pisteNum) && maksimiTulos !== undefined && naytaToiseksiParas && pisteNum === (maksimiTulos - 1);

                  return (
                    <TableCell
                      key={n}
                      className={cn(
                        soluLuokka('stage'),
                        onkoMaksimi
                          ? 'font-bold text-[hsl(var(--score-best-fg))]'
                          : onkoToiseksiParas
                            ? 'font-bold text-[hsl(var(--score-second-fg))]'
                            : ''
                      )}
                    >
                      {pisteArvo}
                    </TableCell>
                  );
                })}

              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </CardContent>
    </Card>
  );
}