// src/HenkiloTulokset.jsx
import { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import {
  laskeHenkilosijoitukset,
  muodostaRatkoNakyma,
  parseAsemaSpeksitCsv
} from './utils/henkiloTulokset';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { cn } from './lib/utils';

export default function HenkiloTulokset({ rawCsv, speksitCsv, rawRows, parsedSpeksit, kisaStatus, locale = 'fi' }) {
  const [valittuAmpujaId, setValittuAmpujaId] = useState(null);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('OPEN (Y)');

  // 1. Parsitaan asemakohtaiset speksit KISANSPEKSIT-datasta (asema, maksimi, toiseksi paras käytössä)
  const { asemaMaksimit, asemaToiseksiParasKaytossa } = useMemo(() => {
    if (parsedSpeksit?.asemaMaksimit && parsedSpeksit?.asemaToiseksiParasKaytossa) {
      return parsedSpeksit;
    }
    return parseAsemaSpeksitCsv(speksitCsv);
  }, [parsedSpeksit, speksitCsv]);

  const onkoRawVirheellinen = !rawCsv || rawCsv.trim().length < 10 || rawCsv.toLowerCase().includes('html') || rawCsv.toLowerCase().includes('error');
  const rivit = useMemo(() => {
    if (Array.isArray(rawRows)) {
      return rawRows;
    }
    return parseCsvRows(rawCsv || '');
  }, [rawCsv, rawRows]);

  const otsikkoRivi = Array.isArray(rivit[0]) ? rivit[0] : [];
  const otsikot = otsikkoRivi.map((o) => String(o || '').toUpperCase());
  const otsikotNormalisoitu = otsikot.map((o) => o.replace(/[^A-Z0-9]/g, ''));

  const etsiSarakkeenIndeksi = (ehdot) => {
    for (const ehto of ehdot) {
      const idx = otsikotNormalisoitu.findIndex((h) => ehto(h));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const onkoAliTulosPuuttuu = (arvo) => {
    const teksti = String(arvo ?? '').trim().toUpperCase();
    return teksti === '' || teksti === '-' || teksti === '—' || teksti === 'N/A';
  };

  const idxNimi = etsiSarakkeenIndeksi([(h) => h === 'NIMI', (h) => h.includes('NIMI')]);
  const idxSarja = etsiSarakkeenIndeksi([(h) => h === 'SARJA', (h) => h.includes('SARJA')]);
  const idxSeura = etsiSarakkeenIndeksi([(h) => h === 'SEURA', (h) => h.includes('SEURA')]);
  const idxRata1 = otsikot.findIndex((o) => o.trim() === '1');

  // Fallback vanhaan malliin (indeksiin 4), jos jostain syystä otsikkoa "1" ei löydy lainkaan
  const aloitusIndeksi = idxRata1 !== -1 ? idxRata1 : 4;

  // 3. LASKETAAN RATKO-SARAKKEEN PAIKKA DYNAAMISESTI ALOITUSPISTEESTÄ
  const kisanRatojenMaara = Object.keys(asemaMaksimit).length > 0
    ? Object.keys(asemaMaksimit).length
    : 8;

  // Ensisijaisesti etsitään RATKO otsikosta, koska rata-/speksimäärä voi vaihdella eri kisoissa.
  const idxRatkoOtsikko = etsiSarakkeenIndeksi([(h) => h === 'RATKO', (h) => h.startsWith('RATKO')]);
  const idxRatko = idxRatkoOtsikko !== -1 ? idxRatkoOtsikko : aloitusIndeksi + kisanRatojenMaara + 1;
  const idxLa = etsiSarakkeenIndeksi([(h) => h === 'LA', (h) => h.startsWith('LAUANTAI')]);
  const idxSu = etsiSarakkeenIndeksi([(h) => h === 'SU', (h) => h.startsWith('SUNNUNTAI')]);

  let idxTulos = etsiSarakkeenIndeksi([(h) => h === 'TULOS', (h) => h.startsWith('TULOS')]);
  if (idxTulos === -1 && idxSeura !== -1) {
    idxTulos = idxSeura + 1;
  }

  const idxSija = idxNimi - 1 >= 0 ? idxNimi - 1 : 1;

  const { ampujat, loydetytSarjat } = useMemo(() => {
    const parsedAmpujat = [];
    const sarjatSet = new Set();

    for (let i = 1; i < rivit.length; i++) {
      const row = rivit[i];
      if (!row[idxNimi]) continue;

      const osumaSarjat = [];
      for (let r = 1; r <= kisanRatojenMaara; r++) {
        const sarakkeenIndex = aloitusIndeksi + (r - 1);

        if (row[sarakkeenIndex] !== undefined) {
          osumaSarjat.push({
            numero: r.toString(),
            tulos: row[sarakkeenIndex] || '-'
          });
        }
      }

      const ampuja = {
        id: `${row[idxNimi] || 'ampuja'}|${idxSarja !== -1 ? row[idxSarja] || 'Y' : 'Y'}|${i}`,
        alkuperainenSija: row[idxSija] || i.toString(),
        nimi: row[idxNimi],
        sarja: idxSarja !== -1 ? row[idxSarja] : 'Y',
        seura: idxSeura !== -1 ? row[idxSeura] : '',
        tulos: row[idxTulos] || '0',
        la: idxLa !== -1 ? row[idxLa] : null,
        su: idxSu !== -1 ? row[idxSu] : null,
        ratko: idxRatko !== -1 ? row[idxRatko] : '',
        ratko2: idxRatko !== -1 ? row[idxRatko + 1] || '' : '',
        ratkoNaytto: muodostaRatkoNakyma(row[idxRatko] || '', idxRatko !== -1 ? row[idxRatko + 1] || '' : ''),
        sarjat: osumaSarjat
      };

      parsedAmpujat.push(ampuja);
      if (ampuja.sarja) sarjatSet.add(ampuja.sarja);
    }

    return { ampujat: parsedAmpujat, loydetytSarjat: sarjatSet };
  }, [idxLa, idxNimi, idxRatko, idxSarja, idxSeura, idxSija, idxSu, idxTulos, kisanRatojenMaara, aloitusIndeksi, rivit]);

  const naytettavatAmpujat = useMemo(() => laskeHenkilosijoitukset(ampujat, sarjaSuodatin), [ampujat, sarjaSuodatin]);

  const tx = locale === 'en'
    ? {
      noResults: 'No individual results available or sheet not found.',
      noData: 'No result data.',
      missingNameColumn: 'Error: NIMI column was not found in the table.',
      allStagesReady: 'All stage scores are complete',
      stagesMissing: 'Some stage scores are missing'
    }
    : {
      noResults: 'Ei henkilökohtaisia tuloksia saatavilla tai välilehteä ei löydy.',
      noData: 'Ei tulosdataa.',
      missingNameColumn: 'Virhe: NIMI-saraketta ei löytynyt taulukosta.',
      allStagesReady: 'Kaikki alitulokset valmiit',
      stagesMissing: 'Alituloksia puuttuu'
    };

  if (onkoRawVirheellinen) {
    return <div className="py-6 text-center text-sm text-slate-500">{tx.noResults}</div>;
  }
  if (rivit.length < 2) return <div className="py-6 text-center text-sm text-slate-500">{tx.noData}</div>;
  if (idxNimi === -1) {
    return <div className="py-6 text-center text-sm text-slate-500">{tx.missingNameColumn}</div>;
  }

  const onkoAmpujaValmis = (ampuja) => {
    if (!ampuja?.sarjat || ampuja.sarjat.length === 0) return false;
    return ampuja.sarjat.every((s) => !onkoAliTulosPuuttuu(s.tulos));
  };

  const haeStatusLabelLuokka = (status) => (
    ['DNS', 'DNF', 'DNQ', 'DSQ'].includes(status)
      ? 'bg-rose-100 text-rose-800'
      : 'bg-slate-200 text-slate-700'
  );

  const naytaValmiusIndikaattori = kisaStatus === 'kaynnissa';

  return (
    <div className="w-full">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          size="sm"
          variant={sarjaSuodatin === 'OPEN (Y)' ? 'default' : 'outline'}
          onClick={() => { setSarjaSuodatin('OPEN (Y)'); setValittuAmpujaId(null); }}
        >
          OPEN (Y)
        </Button>
        {Array.from(loydetytSarjat)
          .sort()
          .filter(sarja => sarja.toUpperCase() !== 'Y') // 👈 TÄMÄ RIVI POISTAA Y-NAPIN dynaamisesti
          .map(sarja => (
            <Button
              key={sarja}
              type="button"
              size="sm"
              variant={sarjaSuodatin === sarja ? 'default' : 'outline'}
              onClick={() => { setSarjaSuodatin(sarja); setValittuAmpujaId(null); }}
            >
              {sarja}
            </Button>
          ))}
      </div>

      <div className="flex flex-col gap-2">
        {naytettavatAmpujat.map((ampuja) => {
          const onAuki = valittuAmpujaId === ampuja.id;
          const ratkoNakyma = muodostaRatkoNakyma(ampuja.ratko, ampuja.ratko2);
          const naytaRatko = sarjaSuodatin !== 'OPEN (Y)' || parseInt(ampuja.laskettuSija, 10) <= 3;
          const ampujaValmis = onkoAmpujaValmis(ampuja);
          const sijoitusNumero = parseInt(ampuja.laskettuSija || '0', 10);
          const sijoitusKorostusLuokka = sijoitusNumero === 1
            ? 'border-l-4 border-l-amber-400'
            : sijoitusNumero === 2
              ? 'border-l-4 border-l-slate-400'
              : sijoitusNumero === 3
                ? 'border-l-4 border-l-orange-500'
                : 'border-l-4 border-l-transparent';

          return (
            <Card key={ampuja.id} className={cn('overflow-hidden border-slate-200', sijoitusKorostusLuokka)}>
              <div
                className={cn(
                  'flex min-h-[52px] cursor-pointer items-center px-3 py-3 transition-colors',
                  onAuki ? 'bg-slate-50' : 'bg-white'
                )}
                onClick={() => setValittuAmpujaId(onAuki ? null : ampuja.id)}
              >
                <div className="mr-3 flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-slate-100 text-base font-extrabold text-slate-700">
                  {ampuja.laskettuSija}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-2">
                  <div className="flex items-center gap-1.5 break-words text-base font-bold text-slate-900">
                    {ampuja.nimi}
                    {naytaValmiusIndikaattori && (
                      <span
                        className={cn(
                          'inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10',
                          ampujaValmis ? 'bg-emerald-500' : 'bg-rose-500'
                        )}
                        title={ampujaValmis ? tx.allStagesReady : tx.stagesMissing}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="default" className="px-2 py-0.5 text-[11px]">{ampuja.sarja}</Badge>
                    <span className="font-medium text-slate-500">{ampuja.seura || '—'}</span>
                  </div>
                </div>

                <div className="flex min-w-20 flex-col items-end justify-center">
                  <div className="text-xl font-black leading-none text-slate-900">{ampuja.tulos}</div>

                  {(ratkoNakyma.statusEtiketit.length > 0 || (naytaRatko && ratkoNakyma.teksti)) && (
                    <div className="mt-1 flex items-center gap-1">
                      {ratkoNakyma.statusEtiketit.map((status) => (
                        <span
                          key={`${ampuja.id}-${status}`}
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[11px] font-bold leading-none',
                            haeStatusLabelLuokka(status)
                          )}
                        >
                          {status}
                        </span>
                      ))}
                      {naytaRatko && ratkoNakyma.teksti && (
                        <span className="rounded bg-slate-100 px-1 text-xs font-bold text-slate-600">{ratkoNakyma.teksti}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {onAuki && ampuja.sarjat.length > 0 && (
                <CardContent className="border-t border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap gap-1">
                    {ampuja.sarjat.map((s, sIdx) => {
                      const puhdistettuNumero = s.numero.replace(/\D/g, '');
                      const maksimiTulos = asemaMaksimit[puhdistettuNumero] || asemaMaksimit[s.numero];
                      const ampujaTulosNum = parseInt(s.tulos, 10);
                      const naytaToiseksiParas = Boolean(asemaToiseksiParasKaytossa[puhdistettuNumero] ?? asemaToiseksiParasKaytossa[s.numero]);
                      const onkoMaksimiOsuma = !isNaN(ampujaTulosNum) && maksimiTulos !== undefined && ampujaTulosNum === maksimiTulos;
                      const onkoToiseksiParasOsuma = !isNaN(ampujaTulosNum) && maksimiTulos !== undefined && naytaToiseksiParas && ampujaTulosNum === (maksimiTulos - 1);

                      return (
                        <div
                          key={`${ampuja.id}-${s.numero}-${sIdx}`}
                          className="min-w-9 rounded border border-slate-200 bg-white px-1 py-0.5 text-center"
                        >
                          <div className="text-[10px] text-slate-500">S{s.numero}</div>
                          <div
                            className={cn(
                              'text-sm font-bold',
                              onkoMaksimiOsuma
                                ? 'text-emerald-700'
                                : onkoToiseksiParasOsuma
                                  ? 'text-amber-700'
                                  : 'text-slate-900'
                            )}
                          >
                            {s.tulos}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
