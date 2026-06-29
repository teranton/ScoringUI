// src/HenkiloTaulukko.jsx
import { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import {
  laskeHenkilosijoitukset,
  muodostaRatkoNakyma,
  parseAsemaSpeksitCsv
} from './utils/henkiloTulokset';
import { teema } from './teema'; // Varmista että teema on importattu

export default function HenkiloTaulukko({ data, parsedRows, parsedSpeksit, kisaStatus }) {
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

  if (onkoDataPuuttuu) {
    return <div style={tyylit.Lataus}>Ladataan taulukko-dataa...</div>;
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

  const haeStatusLabelTyyli = (status) => {
    if (['DNS', 'DNF', 'DNQ', 'DSQ'].includes(status)) {
      return { background: teema.statusLabelTausta, color: teema.statusLabelTeksti };
    }

    return { background: teema.statusOletusTausta, color: teema.statusOletusTeksti };
  };

  const naytaValmiusIndikaattori = kisaStatus === 'kaynnissa';

  return (
    <div style={tyylit.Säiliö}>
      <h2 style={tyylit.Otsikko}>Kaikki tulokset taulukkona</h2>

      <div style={tyylit.SuodatinPalkki}>
        <button
          type="button"
          onClick={() => setSarjaSuodatin('OPEN (Y)')}
          style={sarjaSuodatin === 'OPEN (Y)' ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}
        >
          OPEN (Y)
        </button>
        {loydetytSarjat
          .filter((sarja) => sarja.toUpperCase() !== 'Y')
          .map((sarja) => (
            <button
              key={sarja}
              type="button"
              onClick={() => setSarjaSuodatin(sarja)}
              style={sarjaSuodatin === sarja ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}
            >
              {sarja}
            </button>
          ))}
      </div>

      {onMobiili && (
        <div style={tyylit.TogglePalkki}>
          <button
            type="button"
            onClick={() => setOnkoKompaktiTila(false)}
            style={!onkoKompaktiTila ? tyylit.ToggleNappiAktiivinen : tyylit.ToggleNappi}
          >
            Normaali
          </button>
          <button
            type="button"
            onClick={() => setOnkoKompaktiTila(true)}
            style={onkoKompaktiTila ? tyylit.ToggleNappiAktiivinen : tyylit.ToggleNappi}
          >
            Kompakti
          </button>
        </div>
      )}
      
      <div style={tyylit.TaulukkoWrapper}>
        <table style={tyylit.Taulukko}>
          <thead>
            <tr>
              <th style={kaytaKompaktiTilaa ? tyylit.ThKiinteaKompakti : (onMobiili ? tyylit.ThKiinteaMobiili : tyylit.ThKiintea)}>Sija</th>
              <th style={{ ...(kaytaKompaktiTilaa ? tyylit.ThKiinteaKompakti : (onMobiili ? tyylit.ThKiinteaMobiili : tyylit.ThKiintea)), minWidth: kaytaKompaktiTilaa ? '70px' : (onMobiili ? '96px' : '160px'), textAlign: 'left' }}>Nimi</th>
              {!kaytaKompaktiTilaa && <th style={onMobiili ? tyylit.ThKiinteaMobiili : tyylit.ThKiintea}>Sarja</th>}
              <th style={kaytaKompaktiTilaa ? tyylit.ThYhtKompakti : (onMobiili ? tyylit.ThYhtMobiili : tyylit.ThYht)}>Yht</th>
              {naytaRatkoSarake && <th style={kaytaKompaktiTilaa ? tyylit.ThRatkoKompakti : (onMobiili ? tyylit.ThRatkoMobiili : tyylit.ThRatko)}>Ratko</th>}
              {radatList.map(n => (
                <th key={n} style={kaytaKompaktiTilaa ? tyylit.ThRataKompakti : (onMobiili ? tyylit.ThRataMobiili : tyylit.ThRata)}>R{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {naytettavatAmpujat.map((ampuja) => (
              <tr key={ampuja.id} style={tyylit.Tr}>
                <td style={kaytaKompaktiTilaa ? tyylit.TdSijaKompakti : (onMobiili ? tyylit.TdSijaMobiili : tyylit.TdSija)}>{ampuja.laskettuSija}</td>
                <td style={kaytaKompaktiTilaa ? tyylit.TdNimiKompakti : (onMobiili ? tyylit.TdNimiMobiili : tyylit.TdNimi)}>
                  <span style={tyylit.NimiSisalto}>
                    {muotoileNimiTaulukkoon(ampuja.nimi)}
                    {naytaValmiusIndikaattori && (
                      <span
                        style={{
                          ...tyylit.ValmiusPiste,
                          background: onkoAmpujaValmis(ampuja) ? teema.valmiusValmis : teema.valmiusPuuttuu
                        }}
                        title={onkoAmpujaValmis(ampuja) ? 'Kaikki alitulokset valmiit' : 'Alituloksia puuttuu'}
                      />
                    )}
                  </span>
                </td>
                {!kaytaKompaktiTilaa && <td style={onMobiili ? tyylit.TdSarjaMobiili : tyylit.TdSarja}>{ampuja.sarja}</td>}
                <td style={kaytaKompaktiTilaa ? tyylit.TdYhtKompakti : (onMobiili ? tyylit.TdYhtMobiili : tyylit.TdYht)}>{ampuja.kokonaistulos}</td>
                {naytaRatkoSarake && (
                  <td style={kaytaKompaktiTilaa ? tyylit.TdRatkoKompakti : (onMobiili ? tyylit.TdRatkoMobiili : tyylit.TdRatko)}>
                    {(() => {
                      const naytaRatko = sarjaSuodatin !== 'OPEN (Y)' || parseInt(ampuja.laskettuSija, 10) <= 3;
                      return ampuja.ratkoNaytto.statusEtiketit.length > 0 || (naytaRatko && ampuja.ratkoNaytto.teksti) ? (
                      <span style={tyylit.RatkoSisalto}>
                        {ampuja.ratkoNaytto.statusEtiketit.map((status) => (
                          <span key={`${ampuja.id}-${status}`} style={{ ...tyylit.StatusLabel, ...haeStatusLabelTyyli(status) }}>
                            {status}
                          </span>
                        ))}
                        {naytaRatko && ampuja.ratkoNaytto.teksti && <span style={tyylit.RatkoTekstiInline}>{ampuja.ratkoNaytto.teksti}</span>}
                      </span>
                      ) : '-';
                    })()}
                  </td>
                )}
                
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
                      style={{
                        ...(kaytaKompaktiTilaa ? tyylit.TdRataKompakti : (onMobiili ? tyylit.TdRataMobiili : tyylit.TdRata)),
                        ...(onkoMaksimi
                          ? teema.maksimiTulos
                          : onkoToiseksiParas
                            ? teema.toiseksiParasTulos
                            : {})
                      }}
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
    </div>
  );
}

const tyylit = {
  Säiliö: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '5px 0' },
  Lataus: { padding: '20px', color: '#666' },
  Otsikko: { fontSize: '1.2em', fontWeight: '700', marginBottom: '14px', color: '#111827' },
  SuodatinPalkki: { display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 2px 10px 2px', marginBottom: '6px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' },
  SuodatinNappi: { background: '#f1f3f4', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8em', fontWeight: '600', color: '#3c4043', cursor: 'pointer', whiteSpace: 'nowrap' },
  SuodatinNappiAktiivinen: { background: '#202124', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8em', fontWeight: '600', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  TogglePalkki: { display: 'flex', gap: '8px', marginBottom: '10px' },
  ToggleNappi: { background: '#f1f3f4', border: '1px solid #d1d5db', color: '#374151', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75em', fontWeight: '600' },
  ToggleNappiAktiivinen: { background: '#1f2937', border: '1px solid #1f2937', color: '#fff', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75em', fontWeight: '700' },
  TaulukkoWrapper: { width: '100%', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderRadius: '6px', border: '1px solid #e5e7eb' },
  Taulukko: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', background: '#fff' },
  Tr: { borderBottom: '1px solid #f3f4f6' },
  ThKiintea: { background: '#f8fafc', color: '#475569', padding: '8px 10px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', textAlign: 'center' },
  ThKiinteaMobiili: { background: '#f8fafc', color: '#475569', padding: '6px 5px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', textAlign: 'center', fontSize: '0.75em' },
  ThKiinteaKompakti: { background: '#f8fafc', color: '#475569', padding: '4px 3px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', textAlign: 'center', fontSize: '0.68em' },
  ThRata: { background: '#f1f5f9', color: '#334155', padding: '8px 4px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', textAlign: 'center', minWidth: '32px', fontFamily: 'monospace' },
  ThRataMobiili: { background: '#f1f5f9', color: '#334155', padding: '6px 2px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', textAlign: 'center', minWidth: '22px', fontFamily: 'monospace', fontSize: '0.72em' },
  ThRataKompakti: { background: '#f1f5f9', color: '#334155', padding: '4px 1px', fontWeight: '600', borderBottom: '2px solid #e2e8f0', textAlign: 'center', minWidth: '18px', fontFamily: 'monospace', fontSize: '0.64em' },
  ThYht: { background: '#e2e8f0', color: '#1e293b', padding: '8px 10px', fontWeight: '700', borderBottom: '2px solid #cbd5e1', textAlign: 'center', width: '45px' },
  ThYhtMobiili: { background: '#e2e8f0', color: '#1e293b', padding: '6px 6px', fontWeight: '700', borderBottom: '2px solid #cbd5e1', textAlign: 'center', width: '36px', fontSize: '0.75em' },
  ThYhtKompakti: { background: '#e2e8f0', color: '#1e293b', padding: '4px 4px', fontWeight: '700', borderBottom: '2px solid #cbd5e1', textAlign: 'center', width: '30px', fontSize: '0.68em' },
  ThRatko: { background: '#eef2ff', color: '#1e293b', padding: '8px 10px', fontWeight: '700', borderBottom: '2px solid #c7d2fe', textAlign: 'center', width: '60px' },
  ThRatkoMobiili: { background: '#eef2ff', color: '#1e293b', padding: '6px 6px', fontWeight: '700', borderBottom: '2px solid #c7d2fe', textAlign: 'center', width: '44px', fontSize: '0.75em' },
  ThRatkoKompakti: { background: '#eef2ff', color: '#1e293b', padding: '4px 4px', fontWeight: '700', borderBottom: '2px solid #c7d2fe', textAlign: 'center', width: '36px', fontSize: '0.68em' },
  TdSija: { padding: '6px 4px', textAlign: 'center', color: '#64748b', background: '#f8fafc', fontWeight: '500' },
  TdSijaMobiili: { padding: '4px 2px', textAlign: 'center', color: '#64748b', background: '#f8fafc', fontWeight: '500', fontSize: '0.75em' },
  TdSijaKompakti: { padding: '3px 1px', textAlign: 'center', color: '#64748b', background: '#f8fafc', fontWeight: '500', fontSize: '0.66em' },
  TdNimi: { padding: '6px 10px', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap', textAlign: 'left' },
  TdNimiMobiili: { padding: '4px 4px', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '0.75em', maxWidth: '92px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' },
  TdNimiKompakti: { padding: '3px 3px', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '0.68em', maxWidth: '74px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' },
  NimiSisalto: { display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' },
  ValmiusPiste: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)', flexShrink: 0 },
  TdSarja: { padding: '6px 4px', textAlign: 'center', color: '#475569' },
  TdSarjaMobiili: { padding: '4px 3px', textAlign: 'center', color: '#475569', fontSize: '0.72em' },
  TdRata: { padding: '6px 2px', textAlign: 'center', borderLeft: '1px solid #f1f5f9', fontFamily: 'monospace', fontSize: '0.95em' },
  TdRataMobiili: { padding: '4px 1px', textAlign: 'center', borderLeft: '1px solid #f1f5f9', fontFamily: 'monospace', fontSize: '0.72em' },
  TdRataKompakti: { padding: '3px 1px', textAlign: 'center', borderLeft: '1px solid #f1f5f9', fontFamily: 'monospace', fontSize: '0.64em' },
  TdYht: { padding: '6px 10px', textAlign: 'center', fontWeight: '700', background: '#f8fafc', color: '#0f172a', borderLeft: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '1em' },
  TdYhtMobiili: { padding: '4px 5px', textAlign: 'center', fontWeight: '700', background: '#f8fafc', color: '#0f172a', borderLeft: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.78em' },
  TdYhtKompakti: { padding: '3px 3px', textAlign: 'center', fontWeight: '700', background: '#f8fafc', color: '#0f172a', borderLeft: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.68em' },
  TdRatko: { padding: '6px 10px', textAlign: 'center', background: '#eef2ff', color: '#1d4ed8', borderLeft: '1px solid #c7d2fe', fontFamily: 'monospace', fontSize: '0.9em' },
  TdRatkoMobiili: { padding: '4px 5px', textAlign: 'center', background: '#eef2ff', color: '#1d4ed8', borderLeft: '1px solid #c7d2fe', fontFamily: 'monospace', fontSize: '0.75em' },
  TdRatkoKompakti: { padding: '3px 3px', textAlign: 'center', background: '#eef2ff', color: '#1d4ed8', borderLeft: '1px solid #c7d2fe', fontFamily: 'monospace', fontSize: '0.68em' },
  RatkoSisalto: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' },
  RatkoTekstiInline: { color: '#1e293b', fontWeight: '700' },
  StatusLabel: { display: 'inline-block', padding: '2px 5px', borderRadius: '4px', fontSize: '0.72em', fontWeight: '800', lineHeight: '1' },
  StatusLabelOletus: { background: '#e5e7eb', color: '#374151' }
};