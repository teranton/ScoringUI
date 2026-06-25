// src/HenkiloTaulukko.jsx
import React, { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import { teema } from './teema'; // Varmista että teema on importattu

export default function HenkiloTaulukko({ data }) {
  const onMobiili = typeof window !== 'undefined' && window.innerWidth < 760;
  const [onkoKompaktiTila, setOnkoKompaktiTila] = useState(true);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('OPEN (Y)');
  const kaytaKompaktiTilaa = onMobiili && onkoKompaktiTila;
  const tulkitseTotuusarvo = (arvo) => {
    if (arvo == null) return false;
    const normalisoitu = String(arvo).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'x'].includes(normalisoitu);
  };

  // 1. PARSITAAN KISASPEKSIT (Ratojen määrä ja maksimit)
  const speksit = useMemo(() => {
    const maksimit = {};
    const toiseksiParasKaytossa = {};
    let ratojenMaara = 0;

    if (data?.speksitCsvRaw) {
      try {
        const speksiRivit = parseCsvRows(data.speksitCsvRaw);
        speksiRivit.forEach((rivi) => {
          if (!rivi || rivi.length < 11) return;

          const raakaAsema = rivi[9];
          const raakaMaksimi = rivi[10];
          const naytaToiseksiParas = tulkitseTotuusarvo(rivi[11]);

          if (raakaAsema !== undefined && raakaAsema !== null && raakaMaksimi !== undefined && raakaMaksimi !== null) {
            const asemaTunnus = raakaAsema.toString().trim();
            const maksimiArvo = parseInt(raakaMaksimi, 10);

            if (asemaTunnus && !isNaN(maksimiArvo) && maksimiArvo > 0) {
              const asemaNumero = asemaTunnus.replace(/\D/g, '');
              const avain = asemaNumero || asemaTunnus;
              maksimit[avain] = maksimiArvo;
              toiseksiParasKaytossa[avain] = naytaToiseksiParas;
              ratojenMaara++;
            }
          }
        });
      } catch (e) {
        console.error("Virhe taulukko-speksien parsinnoissa:", e);
      }
    }

    return {
      asemaMaksimit: maksimit,
      asemaToiseksiParasKaytossa: toiseksiParasKaytossa,
      ratojenMaara: ratojenMaara > 0 ? ratojenMaara : 8
    };
  }, [data?.speksitCsvRaw]);

  // 2. PARSITAAN AMPUJIEN TULOKSET
  const ampujat = useMemo(() => {
    if (!data?.henkilotCsvRaw) return [];

    try {
      const raakaRivit = parseCsvRows(data.henkilotCsvRaw);
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

      let idxTulos = etsiSarakkeenIndeksi([(h) => h === 'TULOS', (h) => h.startsWith('TULOS'), (h) => h === 'YHT', (h) => h.startsWith('YHT')]);
      if (idxTulos === -1 && idxSeura !== -1) {
        idxTulos = idxSeura + 1;
      }
      if (idxTulos === -1) {
        idxTulos = yhteistulosFallback;
      }

      const idxSija = nimiIndeksi - 1 >= 0 ? nimiIndeksi - 1 : -1;

      const lista = [];

      for (let i = 1; i < raakaRivit.length; i++) {
        const row = raakaRivit[i];
        if (!row || !row[nimiIndeksi]) continue;

        const ranking = idxSija !== -1 ? (row[idxSija] || '') : '';
        const name = row[nimiIndeksi] || '';
        const category = row[sarjaIndeksi] || '';
        const yhteistulos = row[idxTulos] || '0';

        // Kerätään radat dynaamisesti
        const eratMap = {};
        for (let col = aloitusIndeksi; col <= aloitusIndeksi + speksit.ratojenMaara - 1; col++) {
          const eraNum = (col - aloitusIndeksi) + 1;
          eratMap[eraNum] = row[col] !== undefined ? row[col] : '';
        }

        lista.push({
          id: `${name}|${i}`,
          sijoitus: ranking,
          nimi: name,
          sarja: category,
          kokonaistulos: yhteistulos,
          erat: eratMap
        });
      }
      return lista;
    } catch (e) {
      console.error("Virhe taulukko-ampujien parsinnoissa:", e);
      return [];
    }
  }, [data?.henkilotCsvRaw, speksit.ratojenMaara]);

  if (!data || !data.henkilotCsvRaw) {
    return <div style={tyylit.Lataus}>Ladataan taulukko-dataa...</div>;
  }

  // Luodaan lista radoista sarakeotsikoita varten (esim. [1, 2, 3...])
  const radatList = Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1);
  const loydetytSarjat = Array.from(new Set(ampujat.map((a) => String(a.sarja || '').trim()).filter(Boolean))).sort();
  const naytettavatAmpujat = sarjaSuodatin === 'OPEN (Y)'
    ? ampujat
    : ampujat.filter((a) => String(a.sarja || '').toUpperCase() === sarjaSuodatin.toUpperCase());

  const muotoileNimiTaulukkoon = (nimi) => {
    if (!onMobiili) return nimi;
    const osat = String(nimi || '').trim().split(/\s+/).filter(Boolean);
    if (osat.length <= 1) return nimi;
    if (!kaytaKompaktiTilaa) return nimi;
    return osat
      .map((osa, idx) => (idx === 0 ? osa : `${osa.charAt(0)}.`))
      .join(' ');
  };

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
              {radatList.map(n => (
                <th key={n} style={kaytaKompaktiTilaa ? tyylit.ThRataKompakti : (onMobiili ? tyylit.ThRataMobiili : tyylit.ThRata)}>R{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {naytettavatAmpujat.map((ampuja) => (
              <tr key={ampuja.id} style={tyylit.Tr}>
                <td style={kaytaKompaktiTilaa ? tyylit.TdSijaKompakti : (onMobiili ? tyylit.TdSijaMobiili : tyylit.TdSija)}>{ampuja.sijoitus}</td>
                <td style={kaytaKompaktiTilaa ? tyylit.TdNimiKompakti : (onMobiili ? tyylit.TdNimiMobiili : tyylit.TdNimi)}>{muotoileNimiTaulukkoon(ampuja.nimi)}</td>
                {!kaytaKompaktiTilaa && <td style={onMobiili ? tyylit.TdSarjaMobiili : tyylit.TdSarja}>{ampuja.sarja}</td>}
                <td style={kaytaKompaktiTilaa ? tyylit.TdYhtKompakti : (onMobiili ? tyylit.TdYhtMobiili : tyylit.TdYht)}>{ampuja.kokonaistulos}</td>
                
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
  TdSija: { padding: '6px 4px', textAlign: 'center', color: '#64748b', background: '#f8fafc', fontWeight: '500' },
  TdSijaMobiili: { padding: '4px 2px', textAlign: 'center', color: '#64748b', background: '#f8fafc', fontWeight: '500', fontSize: '0.75em' },
  TdSijaKompakti: { padding: '3px 1px', textAlign: 'center', color: '#64748b', background: '#f8fafc', fontWeight: '500', fontSize: '0.66em' },
  TdNimi: { padding: '6px 10px', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap' },
  TdNimiMobiili: { padding: '4px 4px', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '0.75em', maxWidth: '92px', overflow: 'hidden', textOverflow: 'ellipsis' },
  TdNimiKompakti: { padding: '3px 3px', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '0.68em', maxWidth: '74px', overflow: 'hidden', textOverflow: 'ellipsis' },
  TdSarja: { padding: '6px 4px', textAlign: 'center', color: '#475569' },
  TdSarjaMobiili: { padding: '4px 3px', textAlign: 'center', color: '#475569', fontSize: '0.72em' },
  TdRata: { padding: '6px 2px', textAlign: 'center', borderLeft: '1px solid #f1f5f9', fontFamily: 'monospace', fontSize: '0.95em' },
  TdRataMobiili: { padding: '4px 1px', textAlign: 'center', borderLeft: '1px solid #f1f5f9', fontFamily: 'monospace', fontSize: '0.72em' },
  TdRataKompakti: { padding: '3px 1px', textAlign: 'center', borderLeft: '1px solid #f1f5f9', fontFamily: 'monospace', fontSize: '0.64em' },
  TdYht: { padding: '6px 10px', textAlign: 'center', fontWeight: '700', background: '#f8fafc', color: '#0f172a', borderLeft: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '1em' },
  TdYhtMobiili: { padding: '4px 5px', textAlign: 'center', fontWeight: '700', background: '#f8fafc', color: '#0f172a', borderLeft: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.78em' },
  TdYhtKompakti: { padding: '3px 3px', textAlign: 'center', fontWeight: '700', background: '#f8fafc', color: '#0f172a', borderLeft: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.68em' }
};