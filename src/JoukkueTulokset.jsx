// src/JoukkueTulokset.jsx
import { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import { parseAsemaSpeksitRows } from './utils/henkiloTulokset';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table';
import { cn } from './lib/utils';

function normalisoiOtsikko(arvo) {
  return String(arvo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function etsiIndeksi(otsikotNormalisoitu, ehdot) {
  for (const ehto of ehdot) {
    const idx = otsikotNormalisoitu.findIndex((h) => ehto(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function laskeRiviTulosJaErat(row, rataAlkuIndeksi, ratojenMaara, idxYhteistulos) {
  const eratMap = {};
  let laskettuSumma = 0;
  let onkoPisteita = false;

  for (let i = 0; i < ratojenMaara; i++) {
    const eraNum = i + 1;
    const col = rataAlkuIndeksi + i;
    const arvo = row[col] !== undefined ? row[col] : '';
    eratMap[eraNum] = arvo;

    const p = parseInt(arvo, 10);
    if (!isNaN(p)) {
      laskettuSumma += p;
      onkoPisteita = true;
    }
  }

  const raakaYhteistulos = idxYhteistulos !== -1 ? String(row[idxYhteistulos] || '').trim() : '';
  const lopullinenTulos = (raakaYhteistulos && raakaYhteistulos !== '0')
    ? raakaYhteistulos
    : (onkoPisteita ? String(laskettuSumma) : '0');

  return { eratMap, lopullinenTulos };
}

export default function JoukkueTulokset({ data, parsedRows, kisaStatus, locale = 'fi' }) {
  const [avatutJoukkueet, setAvatutJoukkueet] = useState({});

  // 1. HAETAAN KISASPEKSIT (Ratojen määrä ja asemakohtaiset maksimit)
// 1. HAETAAN KISASPEKSIT (Vain ne radat, joiden maksimi > 0)
  const speksit = useMemo(() => {
    const maksimit = {};
    const toiseksiParasKaytossa = {};

    if (data?.speksitCsvRaw) {
      try {
        const speksiRivit = Array.isArray(parsedRows?.speksitRows)
          ? parsedRows.speksitRows
          : parseCsvRows(data.speksitCsvRaw);
        const parsedSpeksit = parseAsemaSpeksitRows(speksiRivit);
        Object.entries(parsedSpeksit.asemaMaksimit).forEach(([avain, maksimiArvo]) => {
          if (Number.isFinite(maksimiArvo) && maksimiArvo > 0) {
            maksimit[avain] = maksimiArvo;
            toiseksiParasKaytossa[avain] = Boolean(parsedSpeksit.asemaToiseksiParasKaytossa[avain]);
          }
        });
      } catch (e) {
        console.error("Virhe joukkue-speksien parsinnoissa:", e);
      }
    }

    const ratojenMaara = Object.keys(maksimit).length;

    return {
      asemaMaksimit: maksimit,
      asemaToiseksiParasKaytossa: toiseksiParasKaytossa,
      ratojenMaara: ratojenMaara > 0 ? ratojenMaara : 8 
    };
  }, [data, parsedRows]);

  const onkoAliTulosPuuttuu = (arvo) => {
    const teksti = String(arvo ?? '').trim().toUpperCase();
    return teksti === '' || teksti === '-' || teksti === '—' || teksti === 'N/A';
  };

  const onkoJoukkueValmis = (joukkue) => {
    if (!joukkue.ampujat || joukkue.ampujat.length === 0) return false;

    return joukkue.ampujat.every((ampuja) =>
      // Tarkistetaan valmius vain kisan todellisten ratojen osalta
      Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1).every(
        (n) => !onkoAliTulosPuuttuu(ampuja.erat[n])
      )
    );
  };

  const onkoDataPuuttuu = !data || !data.joukkueetCsvRaw;

  const toggleJoukkue = (joukkueId) => {
    setAvatutJoukkueet(prev => ({
      ...prev,
      [joukkueId]: !prev[joukkueId]
    }));
  };

  const { sarjat } = useMemo(() => {
    if (onkoDataPuuttuu) return { sarjat: {} };
    const raakaRivit = Array.isArray(parsedRows?.joukkueRows)
      ? parsedRows.joukkueRows
      : parseCsvRows(data.joukkueetCsvRaw);
    if (!Array.isArray(raakaRivit) || raakaRivit.length < 2) return { sarjat: {} };

    const otsikkoRivi = Array.isArray(raakaRivit[0]) ? raakaRivit[0] : [];
    const otsikotNormalisoitu = otsikkoRivi.map(normalisoiOtsikko);
    const idxSijoitus = etsiIndeksi(otsikotNormalisoitu, [(h) => h === 'SIJA', (h) => h.includes('SIJA'), (h) => h === 'RANK']);
    const idxJoukkue = etsiIndeksi(otsikotNormalisoitu, [(h) => h === 'JOUKKUE', (h) => h.includes('JOUKKUE'), (h) => h === 'TEAM']);
    const idxAmpuja = etsiIndeksi(otsikotNormalisoitu, [(h) => h === 'NIMI', (h) => h.includes('AMPUJA'), (h) => h === 'SHOOTER', (h) => h.includes('NIMI')]);
    const idxSarja = etsiIndeksi(otsikotNormalisoitu, [(h) => h === 'SARJA', (h) => h.includes('SARJA'), (h) => h === 'CLASS']);
    const idxYhteistulos = etsiIndeksi(otsikotNormalisoitu, [(h) => h === 'TULOS', (h) => h.startsWith('YHT'), (h) => h.startsWith('TOTAL')]);
    const idxRata1 = otsikkoRivi.findIndex((o) => String(o || '').trim() === '1');
    const rataAlkuIndeksi = idxRata1 !== -1 ? idxRata1 : 4;

    const parsedJoukkueet = [];
    let currentTeam = null;

    for (let i = 1; i < raakaRivit.length; i++) {
      const row = raakaRivit[i];
      if (!Array.isArray(row)) continue;

      const ranking = idxSijoitus !== -1 ? String(row[idxSijoitus] || '').trim() : String(row[0] || '').trim();
      const teamName = idxJoukkue !== -1 ? String(row[idxJoukkue] || '').trim() : String(row[1] || '').trim();
      const shooterName = idxAmpuja !== -1 ? String(row[idxAmpuja] || '').trim() : String(row[2] || '').trim();
      const category = idxSarja !== -1 ? String(row[idxSarja] || '').trim() : String(row[3] || '').trim();

      if (!ranking && !teamName && !shooterName && !category) continue;

      const { eratMap, lopullinenTulos } = laskeRiviTulosJaErat(row, rataAlkuIndeksi, speksit.ratojenMaara, idxYhteistulos);

      const onUusiJoukkueRivi = Boolean(teamName) && (
        !currentTeam
        || Boolean(ranking)
        || !shooterName
        || teamName !== currentTeam.joukkue
        || (Boolean(category) && category !== currentTeam.sarja)
      );
      const onShooterRivi = Boolean(shooterName);

      if (onUusiJoukkueRivi) {
        if (currentTeam) parsedJoukkueet.push(currentTeam);
        currentTeam = {
          id: `${teamName}|${category}|${i}`,
          sijoitus: ranking,
          joukkue: teamName,
          sarja: category,
          kokonaistulos: lopullinenTulos,
          erat: eratMap,
          ampujat: []
        };
      }

      if (onShooterRivi && currentTeam) {
        currentTeam.ampujat.push({
          id: `${currentTeam.id}|${shooterName}|${currentTeam.ampujat.length}`,
          nimi: shooterName,
          sarja: category,
          kokonaistulos: lopullinenTulos,
          erat: eratMap
        });
      }
    }

    if (currentTeam) parsedJoukkueet.push(currentTeam);

    const ryhmitellytSarjat = {};
    parsedJoukkueet.forEach((j) => {
      if (!j.sarja) return;
      if (!ryhmitellytSarjat[j.sarja]) ryhmitellytSarjat[j.sarja] = [];
      ryhmitellytSarjat[j.sarja].push(j);
    });

    return { sarjat: ryhmitellytSarjat };
  }, [data, parsedRows, speksit.ratojenMaara, onkoDataPuuttuu]);

  const tx = locale === 'en'
    ? {
      loading: 'Loading result data...',
      lane: 'Lane',
      totalShort: 'Tot',
      pointsShort: 'Pts',
      classLabel: 'Class',
      allStagesReady: 'All stage scores are complete',
      stagesMissing: 'Some stage scores are missing',
      teamStageTotals: 'Team stage totals',
      shooterBreakdown: 'Shooter breakdown',
      total: 'Total'
    }
    : {
      loading: 'Ladataan tulosdataa...',
      lane: 'Rata',
      totalShort: 'Yht',
      pointsShort: 'Pst',
      classLabel: 'Sarja',
      allStagesReady: 'Kaikki alitulokset valmiit',
      stagesMissing: 'Alituloksia puuttuu',
      teamStageTotals: 'Joukkueen yhteispisteet',
      shooterBreakdown: 'Ampujakohtaiset tulokset',
      total: 'Yht'
    };

  if (onkoDataPuuttuu) {
    return <div className="py-6 text-sm text-slate-500">{tx.loading}</div>;
  }

  const naytaValmiusIndikaattori = kisaStatus === 'kaynnissa';

  // Apufunktio dynaamisen erätaulukon luomiseen ja solujen väritykseen
  const renderöiEräTaulukko = (erat, onkoYhteispisteet = false) => {
    // Luodaan lista radoista dynaamisesti (esim. [1, 2, 3, 4, 5, 6, 7, 8])
    const kaikkiRadat = Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1);
    
    // Jos ratoja on enemmän kuin 12 (kuten 24 erän kisoissa), jaetaan ne edelleen kahteen riviin mobiilia varten
    const rivit = speksit.ratojenMaara > 12 
      ? [kaikkiRadat.slice(0, 12), kaikkiRadat.slice(12)]
      : [kaikkiRadat];
    
    return (
      <div className="flex flex-col gap-2 overflow-x-auto">
        {rivit.map((rivi, rIdx) => (
          <Table key={rIdx} className="mt-0.5 w-full border-collapse font-mono text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-9 border border-slate-200 bg-slate-200 px-1 py-1 text-center font-bold text-slate-600">{tx.lane}</TableHead>
                {rivi.map(n => <TableHead key={n} className="min-w-6 border border-slate-200 bg-slate-100 px-1 py-1 text-center font-semibold text-slate-700">{n}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[11px] text-slate-500">{onkoYhteispisteet ? tx.totalShort : tx.pointsShort}</TableCell>
                {rivi.map(n => {
                  const pisteArvo = erat[n] || '-';
                  const pisteNum = parseInt(pisteArvo, 10);
                  
                  // Tarkistetaan maksimi. Yhteispisteissä (joukkueen summa) ei väritetä yksittäistä maksimia
                  const maksimiTulos = speksit.asemaMaksimit[n] || speksit.asemaMaksimit[`${n}`];
                  const naytaToiseksiParas = Boolean(speksit.asemaToiseksiParasKaytossa[n] ?? speksit.asemaToiseksiParasKaytossa[`${n}`]);
                  const onkoMaksimi = !onkoYhteispisteet && !isNaN(pisteNum) && maksimiTulos !== undefined && pisteNum === maksimiTulos;
                  const onkoToiseksiParas = !onkoYhteispisteet && !isNaN(pisteNum) && maksimiTulos !== undefined && naytaToiseksiParas && pisteNum === (maksimiTulos - 1);

                  return (
                    <TableCell
                      key={n} 
                      className={cn(
                        'border border-slate-200 px-1 py-1 text-center',
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
            </TableBody>
          </Table>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {Object.keys(sarjat).map(sarjaNimi => (
        <section key={sarjaNimi} className="space-y-3">
          <h2 className="border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">{tx.classLabel} {sarjaNimi}</h2>
          
          <div className="flex max-w-3xl flex-col gap-3">
            {sarjat[sarjaNimi].map((joukkueAlkio, indeksi) => {

              const sijoitusNumero = parseInt(joukkueAlkio.sijoitus || `${indeksi + 1}`, 10);
              const sijoitusKorostusLuokka = sijoitusNumero === 1
                ? 'border-l-4 border-l-[hsl(var(--rank-1))]'
                : sijoitusNumero === 2
                  ? 'border-l-4 border-l-[hsl(var(--rank-2))]'
                  : sijoitusNumero === 3
                    ? 'border-l-4 border-l-[hsl(var(--rank-3))]'
                    : 'border-l-4 border-l-[hsl(var(--rank-other))]';
              const sijoitusPalloLuokka = sijoitusNumero === 1
                ? 'bg-[hsl(var(--rank-1))] text-[hsl(var(--primary-foreground))] font-bold'
                : sijoitusNumero === 2
                  ? 'bg-[hsl(var(--rank-2))] text-[hsl(var(--primary-foreground))] font-bold'
                  : sijoitusNumero === 3
                    ? 'bg-[hsl(var(--rank-3))] text-[hsl(var(--primary-foreground))] font-bold'
                    : 'bg-[hsl(var(--rank-pill-default-bg))] text-[hsl(var(--rank-pill-default-fg))]';
              const onAuki = !!avatutJoukkueet[joukkueAlkio.id];
              const joukkueValmis = onkoJoukkueValmis(joukkueAlkio);
              const jasenetTeksti = joukkueAlkio.ampujat.map(a => a.nimi).join(', ');

              return (
                <Card key={joukkueAlkio.id} className={cn('overflow-hidden', sijoitusKorostusLuokka)}>
                  
                  <CardContent className="p-0">
                    <button
                      type="button"
                      aria-expanded={onAuki}
                      onClick={() => toggleJoukkue(joukkueAlkio.id)}
                      className="flex w-full select-none items-center gap-3 p-4 text-left"
                    >
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm', sijoitusPalloLuokka)}>
                        {joukkueAlkio.sijoitus}
                      </span>
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                          {joukkueAlkio.joukkue}
                          <span className="text-xs text-slate-400">{onAuki ? '▼' : '▶'}</span>
                          {naytaValmiusIndikaattori && (
                            <span
                              className={cn(
                                'inline-block h-2 w-2 rounded-full ring-1 ring-black/10',
                                joukkueValmis ? 'bg-[hsl(var(--status-ready))]' : 'bg-[hsl(var(--status-missing))]'
                              )}
                              title={joukkueValmis ? tx.allStagesReady : tx.stagesMissing}
                            />
                          )}
                        </span>
                        <span className="text-sm text-slate-600">{jasenetTeksti}</span>
                      </div>
                      <Badge variant="default" className="bg-slate-100 px-3 py-1 text-base font-bold text-slate-900">
                        {joukkueAlkio.kokonaistulos}
                      </Badge>
                    </button>
                  </CardContent>
                  
                  {onAuki && (
                    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4">
                      
                      <Card className="border-slate-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs uppercase tracking-wide text-slate-500">{tx.teamStageTotals}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                        {renderöiEräTaulukko(joukkueAlkio.erat, true)}
                        </CardContent>
                      </Card>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tx.shooterBreakdown}</div>
                        {joukkueAlkio.ampujat.map((ampuja) => (
                          <Card key={ampuja.id} className="border-slate-200">
                            <CardContent className="space-y-2 p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-slate-700">• {ampuja.nimi}</span>
                              <span className="font-mono text-sm font-bold text-slate-900">{tx.total}: {ampuja.kokonaistulos}</span>
                            </div>
                            {renderöiEräTaulukko(ampuja.erat, false)}
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                    </div>
                  )}

                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}