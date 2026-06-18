// src/HenkiloTulokset.jsx
import React, { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';

export default function HenkiloTulokset({ rawCsv }) {
  const [valittuAmpujaId, setValittuAmpujaId] = useState(null);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('KAIKKI');

  if (!rawCsv || rawCsv.trim().length < 10 || rawCsv.toLowerCase().includes("html") || rawCsv.toLowerCase().includes("error")) {
    return <div style={tyylit.Viesti}>Ei henkilökohtaisia tuloksia saatavilla tai välilehteä ei löydy.</div>;
  }

  const rivit = useMemo(() => parseCsvRows(rawCsv), [rawCsv]);
  if (rivit.length < 2) return <div style={tyylit.Viesti}>Ei tulosdataa.</div>;

  // 1. ETSITÄÄN OTSIKOIDEN PAIKAT
  const otsikot = rivit[0].map((o) => String(o || '').toUpperCase());
  
  const idxNimi = otsikot.indexOf('NIMI');
  const idxSarja = otsikot.indexOf('SARJA');
  const idxSeura = otsikot.indexOf('SEURA');
  const idxRatko = otsikot.indexOf('RATKO');
  const idxLa = otsikot.indexOf('LA');
  const idxSu = otsikot.indexOf('SU');

  if (idxNimi === -1) {
    return <div style={tyylit.Viesti}>Virhe: 'NIMI'-saraketta ei löytynyt taulukosta.</div>;
  }

  let idxTulos = otsikot.indexOf('TULOS');
  if (idxTulos === -1 && idxSeura !== -1) {
    idxTulos = idxSeura + 1;
  }

  const idxSija = idxNimi - 1 >= 0 ? idxNimi - 1 : 1;

  const { ampujat, loydetytSarjat } = useMemo(() => {
    const parsedAmpujat = [];
    const sarjatSet = new Set();

    // 2. PARSITAAN RIVIT TAULUKKOON
    for (let i = 1; i < rivit.length; i++) {
      const row = rivit[i];
      if (!row[idxNimi]) continue;

      const osumaSarjat = [];
      otsikot.forEach((otsikko, sarakkeenIndex) => {
        if (!Number.isNaN(Number(otsikko)) && otsikko !== '') {
          osumaSarjat.push({
            numero: otsikko,
            tulos: row[sarakkeenIndex] || "-"
          });
        }
      });

      const ampuja = {
        id: `${row[idxNimi] || ''}|${idxSarja !== -1 ? row[idxSarja] || '' : 'Y'}|${i}`,
        alkuperainenSija: row[idxSija] || i.toString(),
        nimi: row[idxNimi],
        sarja: idxSarja !== -1 ? row[idxSarja] : "Y",
        seura: idxSeura !== -1 ? row[idxSeura] : "",
        tulos: row[idxTulos] || "0",
        la: idxLa !== -1 ? row[idxLa] : null,
        su: idxSu !== -1 ? row[idxSu] : null,
        ratko: idxRatko !== -1 ? row[idxRatko] : "",
        sarjat: osumaSarjat
      };

      parsedAmpujat.push(ampuja);
      if (ampuja.sarja) sarjatSet.add(ampuja.sarja);
    }

    return { ampujat: parsedAmpujat, loydetytSarjat: sarjatSet };
  }, [idxLa, idxNimi, idxRatko, idxSarja, idxSeura, idxSija, idxSu, idxTulos, otsikot, rivit]);

  // 3. SUODATUS JA JÄRJESTYS
  const naytettavatAmpujat = useMemo(() => {
    if (sarjaSuodatin === 'KAIKKI') {
      return ampujat.map((a) => ({
        ...a,
        laskettuSija: a.alkuperainenSija
      }));
    }

    const sarjanVaki = ampujat
      .filter((a) => a.sarja.toUpperCase() === sarjaSuodatin.toUpperCase())
      .sort((a, b) => {
        const tulosA = parseInt(a.tulos, 10) || 0;
        const tulosB = parseInt(b.tulos, 10) || 0;
        if (tulosB !== tulosA) return tulosB - tulosA;

        const ratkoA = parseInt(a.ratko, 10) || 0;
        const ratkoB = parseInt(b.ratko, 10) || 0;
        return ratkoB - ratkoA;
      });

    return sarjanVaki.map((ampuja, index, array) => {
      let sija = index + 1;
      const tulosNum = parseInt(ampuja.tulos, 10) || 0;
      const ratkoNum = parseInt(ampuja.ratko, 10) || 0;

      if (index > 0) {
        const edellinen = array[index - 1];
        const edellinenTulos = parseInt(edellinen.tulos, 10) || 0;
        const edellinenRatko = parseInt(edellinen.ratko, 10) || 0;

        if (edellinenTulos === tulosNum && edellinenRatko === ratkoNum) {
          sija = parseInt(edellinen.laskettuSija || `${index}`, 10) || index;
        }
      }

      return { ...ampuja, laskettuSija: sija.toString() };
    });
  }, [ampujat, sarjaSuodatin]);

  const haeMitaliTyyli = (sijaStr) => {
    switch (sijaStr) {
      case "1": return { color: '#d4af37', emoji: '🥇 ' };
      case "2": return { color: '#7f8c8d', emoji: '🥈 ' };
      case "3": return { color: '#cd7f32', emoji: '🥉 ' };
      default: return { color: '#5f6368', emoji: '' };
    }
  };

  const taulukonSarakkeet = 5 + (idxLa !== -1 ? 1 : 0) + (idxSu !== -1 ? 1 : 0);

  return (
    <div style={tyylit.Alue}>
      {/* SARJASUODATIN-PILLERIT */}
      <div style={tyylit.SuodatinPalkki}>
        <button onClick={() => { setSarjaSuodatin('KAIKKI'); setValittuAmpujaId(null); }} style={sarjaSuodatin === 'KAIKKI' ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>KAIKKI</button>
        {Array.from(loydetytSarjat).sort().map(sarja => (
          <button key={sarja} onClick={() => { setSarjaSuodatin(sarja); setValittuAmpujaId(null); }} style={sarjaSuodatin === sarja ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>{sarja}</button>
        ))}
      </div>

      {/* TIIVIS TULOSTAULUKKO NEUTRAALEILLA VÄREILLÄ */}
      <div style={tyylit.TaulukkoSäiliö}>
        <table style={tyylit.Taulukko}>
          <thead>
            <tr style={tyylit.OtsikkoRivi}>
              <th style={{ ...tyylit.Th, width: '40px', textAlign: 'center' }}>#</th>
              <th style={tyylit.Th}>Nimi</th>
              <th style={tyylit.Th}>Sarja</th>
              <th style={tyylit.Th}>Seura</th>
              {idxLa !== -1 && <th style={{ ...tyylit.Th, textAlign: 'center' }}>LA</th>}
              {idxSu !== -1 && <th style={{ ...tyylit.Th, textAlign: 'center' }}>SU</th>}
              <th style={{ ...tyylit.Th, textAlign: 'right', paddingRight: '16px' }}>Yht.</th>
            </tr>
          </thead>
          <tbody>
            {naytettavatAmpujat.map((ampuja, index) => {
              const mitali = haeMitaliTyyli(ampuja.laskettuSija);
              const onAuki = valittuAmpujaId === ampuja.id;

              return (
                <React.Fragment key={ampuja.id}>
                  <tr 
                    style={{
                      ...tyylit.DataRivi,
                      background: onAuki ? '#f1f3f4' : (index % 2 === 0 ? '#ffffff' : '#f8f9fa')
                    }}
                    onClick={() => setValittuAmpujaId(onAuki ? null : ampuja.id)}
                  >
                    <td style={{ ...tyylit.Td, textAlign: 'center', color: mitali.color, fontWeight: '700' }}>
                      {ampuja.laskettuSija}
                    </td>
                    <td style={{ ...tyylit.Td, fontWeight: '600', color: '#202124' }}>
                      {mitali.emoji}{ampuja.nimi}
                      {ampuja.ratko && <span style={tyylit.RatkoBadge}>({ampuja.ratko})</span>}
                    </td>
                    <td style={tyylit.Td}><span style={tyylit.SarjaTag}>{ampuja.sarja}</span></td>
                    <td style={{ ...tyylit.Td, color: '#5f6368' }}>{ampuja.seura || '—'}</td>
                    {idxLa !== -1 && <td style={{ ...tyylit.Td, textAlign: 'center', color: '#5f6368' }}>{ampuja.la || '—'}</td>}
                    {idxSu !== -1 && <td style={{ ...tyylit.Td, textAlign: 'center', color: '#5f6368' }}>{ampuja.su || '—'}</td>}
                    {/* Tulosnumero on nyt voimakkaan tumma grafiitti, ei sininen */}
                    <td style={{ ...tyylit.Td, textAlign: 'right', fontWeight: '900', color: '#1a1f2c', paddingRight: '16px', fontSize: '1.15em' }}>
                      {ampuja.tulos}
                    </td>
                  </tr>

                  {onAuki && ampuja.sarjat.length > 0 && (
                    <tr>
                      <td colSpan={taulukonSarakkeet} style={tyylit.LaajennusSolu}>
                        <div style={tyylit.SarjaRuudukko}>
                          {ampuja.sarjat.map((s, sIdx) => (
                            <div key={`${ampuja.id}-${s.numero}-${sIdx}`} style={tyylit.SarjaSolu}>
                              <div style={tyylit.SarjaSoluNumero}>S{s.numero}</div>
                              <div style={tyylit.SarjaSoluArvo}>{s.tulos}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tyylit = {
  Alue: { width: '100%' },
  Viesti: { padding: '30px 20px', color: '#5f6368', textAlign: 'center', fontFamily: 'sans-serif' },
  SuodatinPalkki: { display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 2px 14px 2px', marginBottom: '8px', scrollbarWidth: 'none' },
  SuodatinNappi: { background: '#f1f3f4', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85em', fontWeight: '600', color: '#3c4043', cursor: 'pointer', whiteSpace: 'nowrap' },
  SuodatinNappiAktiivinen: { background: '#202124', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85em', fontWeight: '600', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  
  TaulukkoSäiliö: { width: '100%', overflowX: 'auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #e8eaed', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  Taulukko: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: '0.9em' },
  OtsikkoRivi: { background: '#f8f9fa', borderBottom: '2px solid #e8eaed' },
  Th: { padding: '12px 10px', fontWeight: '700', color: '#5f6368', fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '0.02em' },
  DataRivi: { borderBottom: '1px solid #f1f3f4', cursor: 'pointer', transition: 'background 0.1s ease' },
  Td: { padding: '10px 10px', verticalAlign: 'middle' },
  
  // Sarjatagi muutettu siistiksi harmaaksi sinisen sijaan
  SarjaTag: { background: '#f1f3f4', color: '#3c4043', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', fontSize: '0.8em' },
  RatkoBadge: { color: '#d93025', fontWeight: '700', marginLeft: '6px', fontSize: '0.85em' },
  
  LaajennusSolu: { background: '#f8f9fa', padding: '10px 16px', borderBottom: '1px solid #e8eaed' },
  SarjaRuudukko: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  SarjaSolu: { background: '#ffffff', border: '1px solid #dadce0', borderRadius: '6px', textAlign: 'center', minWidth: '42px', padding: '3px 6px' },
  SarjaSoluNumero: { fontSize: '0.65em', color: '#70757a', fontWeight: '600' },
  SarjaSoluArvo: { fontSize: '0.9em', fontWeight: '700', color: '#202124' }
};