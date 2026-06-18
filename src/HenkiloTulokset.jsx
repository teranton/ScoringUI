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
        id: `${row[idxNimi] || 'ampuja'}|${idxSarja !== -1 ? row[idxSarja] || 'Y' : 'Y'}|${i}`,
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

  const haeSijoitusRivinTausta = (sijaStr, onAuki, index) => {
    if (onAuki) return '#f1f3f4';

    const sija = parseInt(sijaStr, 10);
    if (sija === 1) return '#d4af37';
    if (sija === 2) return '#aaa9ad';
    if (sija === 3) return '#b0722a';

    return index % 2 === 0 ? '#ffffff' : '#f8f9fa';
  };

  const sarakeMaara = 5 + (idxLa !== -1 ? 1 : 0) + (idxSu !== -1 ? 1 : 0);

  return (
    <div style={tyylit.Alue}>
      {/* SARJASUODATIN-PILLERIT */}
      <div style={tyylit.SuodatinPalkki}>
        <button onClick={() => { setSarjaSuodatin('KAIKKI'); setValittuAmpujaId(null); }} style={sarjaSuodatin === 'KAIKKI' ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>KAIKKI</button>
        {Array.from(loydetytSarjat).sort().map(sarja => (
          <button key={sarja} onClick={() => { setSarjaSuodatin(sarja); setValittuAmpujaId(null); }} style={sarjaSuodatin === sarja ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>{sarja}</button>
        ))}
      </div>

      {/* TAULUKKO-SÄILIÖ JOKA ESTÄÄ SIVUVUODON */}
      <div style={tyylit.TaulukkoSäiliö}>
        <table style={tyylit.Taulukko}>
          <thead>
            <tr style={tyylit.OtsikkoRivi}>
              <th style={{ ...tyylit.Th, ...tyylit.SijaSarake, textAlign: 'center' }}>#</th>
              <th style={{ ...tyylit.Th, textAlign: 'left' }}>Nimi</th>
              <th style={tyylit.Th}>Sarja</th>
              <th style={tyylit.Th}>Seura</th>
              {idxLa !== -1 && <th style={{ ...tyylit.Th, ...tyylit.SuppeaSarake, textAlign: 'center' }}>LA</th>}
              {idxSu !== -1 && <th style={{ ...tyylit.Th, ...tyylit.SuppeaSarake, textAlign: 'center' }}>SU</th>}
              <th style={{ ...tyylit.Th, ...tyylit.YhteensaSarake, textAlign: 'right', paddingRight: '12px' }}>Yht.</th>
            </tr>
          </thead>
          <tbody>
            {naytettavatAmpujat.map((ampuja, index) => {
              const onAuki = valittuAmpujaId === ampuja.id;

              return (
                <React.Fragment key={ampuja.id}>
                  <tr 
                    style={{
                      ...tyylit.DataRivi,
                      background: haeSijoitusRivinTausta(ampuja.laskettuSija, onAuki, index)
                    }}
                    onClick={() => setValittuAmpujaId(onAuki ? null : ampuja.id)}
                  >
                    <td style={{ ...tyylit.Td, ...tyylit.SijaSarake, textAlign: 'center', fontWeight: '700', color: '#3c4043' }}>
                      {ampuja.laskettuSija}
                    </td>
                    
                    <td style={{ ...tyylit.Td, ...tyylit.NimiSolu }}>
                      {ampuja.nimi}
                      {ampuja.ratko && <span style={tyylit.RatkoBadge}>({ampuja.ratko})</span>}
                    </td>

                    <td style={tyylit.Td}><span style={tyylit.SarjaTag}>{ampuja.sarja}</span></td>
                    <td style={{ ...tyylit.Td, color: '#5f6368' }}>{ampuja.seura || '—'}</td>
                    
                    {idxLa !== -1 && <td style={{ ...tyylit.Td, ...tyylit.SuppeaSarake, textAlign: 'center', color: '#5f6368' }}>{ampuja.la || '—'}</td>}
                    {idxSu !== -1 && <td style={{ ...tyylit.Td, ...tyylit.SuppeaSarake, textAlign: 'center', color: '#5f6368' }}>{ampuja.su || '—'}</td>}
                    
                    <td style={{ ...tyylit.Td, ...tyylit.YhteensaSarake, textAlign: 'right', fontWeight: '900', color: '#1a1f2c', paddingRight: '12px', fontSize: '1.1em' }}>
                      {ampuja.tulos}
                    </td>
                  </tr>

                  {/* ISTUNNON/ERÄN TARKEMMAT TIEDOT (KLIKKAUSLAAJENNUS) */}
                  {onAuki && ampuja.sarjat.length > 0 && (
                    <tr>
                      <td colSpan={sarakeMaara} style={tyylit.LaajennusSolu}>
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
  Alue: { width: '100%', boxSizing: 'border-box' },
  Viesti: { padding: '20px', color: '#5f6368', textAlign: 'center', fontFamily: 'sans-serif' },
  SuodatinPalkki: { display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 2px 10px 2px', marginBottom: '4px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' },
  SuodatinNappi: { background: '#f1f3f4', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8em', fontWeight: '600', color: '#3c4043', cursor: 'pointer' },
  SuodatinNappiAktiivinen: { background: '#202124', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8em', fontWeight: '600', color: '#fff', cursor: 'pointer' },
  
  // Taulukko pysyy ruudun sisalla, mutta sallii vaakavierityksen jos sarakkeita on paljon.
  TaulukkoSäiliö: { width: '100%', maxWidth: '100%', overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #e8eaed' },
  Taulukko: { width: '100%', tableLayout: 'auto', borderCollapse: 'collapse', fontFamily: '-apple-system, sans-serif', fontSize: '0.85em' },
  OtsikkoRivi: { background: '#f8f9fa', borderBottom: '1px solid #e8eaed' },
  Th: { padding: '10px 6px', fontWeight: '700', color: '#5f6368', fontSize: '0.8em', textTransform: 'uppercase', textAlign: 'left' },
  DataRivi: { borderBottom: '1px solid #f1f3f4', cursor: 'pointer' },
  Td: { padding: '10px 6px', verticalAlign: 'middle', textAlign: 'left' },
  SijaSarake: { width: '42px', minWidth: '42px' },
  SuppeaSarake: { width: '54px', minWidth: '54px' },
  YhteensaSarake: { width: '70px', minWidth: '70px' },
  NimiSolu: { minWidth: '220px', fontWeight: '600', color: '#202124', whiteSpace: 'nowrap' },

  SarjaTag: { background: '#f1f3f4', color: '#3c4043', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', fontSize: '0.8em' },
  RatkoBadge: { color: '#d93025', fontWeight: '700', marginLeft: '4px' },
  LaajennusSolu: { background: '#f8f9fa', padding: '8px' },
  SarjaRuudukko: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  SarjaSolu: { background: '#ffffff', border: '1px solid #dadce0', borderRadius: '4px', textAlign: 'center', minWidth: '36px', padding: '2px 4px' },
  SarjaSoluNumero: { fontSize: '0.6em', color: '#70757a' },
  SarjaSoluArvo: { fontSize: '0.85em', fontWeight: '700', color: '#202124' }
};