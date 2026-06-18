// src/JoukkueTulokset.jsx
import React, { useMemo, useState } from 'react';
import { teema } from './teema';
import { parseCsvRows } from './utils/csv';

export default function JoukkueTulokset({ data }) {
  const [avatutJoukkueet, setAvatutJoukkueet] = useState({});

  const onkoAliTulosPuuttuu = (arvo) => {
    const teksti = String(arvo ?? '').trim().toUpperCase();
    return teksti === '' || teksti === '-' || teksti === '—' || teksti === 'N/A';
  };

  const onkoJoukkueValmis = (joukkue) => {
    if (!joukkue.ampujat || joukkue.ampujat.length === 0) return false;

    return joukkue.ampujat.every((ampuja) =>
      Object.values(ampuja.erat || {}).every((tulos) => !onkoAliTulosPuuttuu(tulos))
    );
  };

  if (!data || !data.joukkueetCsvRaw) {
    return <div style={tyylit.Lataus}>Ladataan tulosdataa...</div>;
  }

  const toggleJoukkue = (joukkueNimi) => {
    setAvatutJoukkueet(prev => ({
      ...prev,
      [joukkueNimi]: !prev[joukkueNimi]
    }));
  };

  const { sarjat } = useMemo(() => {
    // 1. PARSITAAN GOOGLE-CSV
    const raakaRivit = parseCsvRows(data.joukkueetCsvRaw);

    const parsedJoukkueet = [];
    let currentTeam = null;

    for (let i = 1; i < raakaRivit.length; i++) {
      const row = raakaRivit[i];
      if (!row || (!row[0] && !row[1] && !row[2])) continue;

      const ranking = row[0] || '';
      const teamName = row[1] || '';
      const shooterName = row[2] || '';
      const category = row[3] || '';
      const yhteistulos = row[28] || "0";

      // Tallennetaan erät kiinteään 24-paikkaiseen taulukkoon indeksin mukaan (1-24).
      const eratMap = {};
      for (let col = 4; col <= 27; col++) {
        const eraNum = col - 3;
        eratMap[eraNum] = row[col] !== undefined ? row[col] : "";
      }

      if (teamName !== "" && shooterName === "") {
        if (currentTeam) parsedJoukkueet.push(currentTeam);
        currentTeam = {
          id: `${teamName}|${category}|${i}`,
          sijoitus: ranking,
          joukkue: teamName,
          sarja: category,
          kokonaistulos: yhteistulos,
          erat: eratMap,
          ampujat: []
        };
      } else if (shooterName !== "" && currentTeam) {
        currentTeam.ampujat.push({
          id: `${currentTeam.id}|${shooterName}|${currentTeam.ampujat.length}`,
          nimi: shooterName,
          sarja: category,
          kokonaistulos: yhteistulos,
          erat: eratMap
        });
      }
    }

    if (currentTeam) parsedJoukkueet.push(currentTeam);

    // 2. RYHMITELLÄÄN SARJOITTAIN
    const ryhmitellytSarjat = {};
    parsedJoukkueet.forEach((j) => {
      if (!j.sarja) return;
      if (!ryhmitellytSarjat[j.sarja]) ryhmitellytSarjat[j.sarja] = [];
      ryhmitellytSarjat[j.sarja].push(j);
    });

    return { sarjat: ryhmitellytSarjat };
  }, [data.joukkueetCsvRaw]);

  const mitaliVarit = { 1: '#d4af37', 2: '#aaa9ad', 3: '#b0722a' };

  // Apufunktio erätaulukon luomiseen (jaetaan 24 erää kahteen 12 erän riviin, jotta mahtuu mobiiliin)
  const renderöiEräTaulukko = (erat) => {
    const rivit = [[1,2,3,4,5,6,7,8,9,10,11,12], [13,14,15,16,17,18,19,20,21,22,23,24]];
    
    return (
      <div style={tyylit.TaulukkoSäiliö}>
        {rivit.map((rivi, rIdx) => (
          <table key={rIdx} style={tyylit.Taulukko}>
            <thead>
              <tr>
                <th style={tyylit.OtsikkoSoluMuted}>Erä</th>
                {rivi.map(n => <th key={n} style={tyylit.OtsikkoSolu}>{n}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tyylit.DataSoluMuted}>Pst</td>
                {rivi.map(n => <td key={n} style={tyylit.DataSolu}>{erat[n] || '-'}</td>)}
              </tr>
            </tbody>
          </table>
        ))}
      </div>
    );
  };

  // 3. PIIRRETÄÄN KÄYTTÖLIITTYMÄ
  return (
    <div style={tyylit.SivuSäiliö}>
      {Object.keys(sarjat).map(sarjaNimi => (
        <div key={sarjaNimi} style={{ marginBottom: '35px' }}>
          <h2 style={tyylit.SarjaOtsikko}>Sarja {sarjaNimi}</h2>
          
          <div style={tyylit.Lista}>
            {sarjat[sarjaNimi].map((joukkueAlkio, indeksi) => {
              
              const sarjaSijoitus = indeksi + 1; 
              const mitaliVari = mitaliVarit[sarjaSijoitus];
              const onAuki = !!avatutJoukkueet[joukkueAlkio.joukkue];
              const joukkueValmis = onkoJoukkueValmis(joukkueAlkio);
              const jasenetTeksti = joukkueAlkio.ampujat.map(a => a.nimi).join(', ');

              const korttiDynaaminenTyyli = {
                borderLeft: mitaliVari ? `5px solid ${mitaliVari}` : `5px solid ${teema.paavari || '#1a4a75'}`
              };

              const sijoitusDynaaminenTyyli = {
                background: mitaliVari ? mitaliVari : '#f0f0f0',
                color: mitaliVari ? '#fff' : '#555',
                fontWeight: mitaliVari ? 'bold' : 'normal'
              };

              return (
                <div key={joukkueAlkio.id} style={{ ...tyylit.Kortti, ...korttiDynaaminenTyyli }}>
                  
                  {/* JOUKKUEEN PÄÄRIVI */}
                  <div onClick={() => toggleJoukkue(joukkueAlkio.joukkue)} style={tyylit.JoukkueRivi}>
                    <span style={{ ...tyylit.SijoitusPallo, ...sijoitusDynaaminenTyyli }}>
                      {joukkueAlkio.sijoitus}
                    </span>
                    <div style={tyylit.TekstiAlue}>
                      <span style={tyylit.JoukkueNimi}>
                        {joukkueAlkio.joukkue} <span style={tyylit.NuoliIcon}>{onAuki ? '▼' : '▶'}</span>
                        <span
                          style={{
                            ...tyylit.ValmiusPiste,
                            background: joukkueValmis ? '#16a34a' : '#dc2626'
                          }}
                          title={joukkueValmis ? 'Kaikki alitulokset valmiit' : 'Alituloksia puuttuu'}
                        />
                      </span>
                      <span style={tyylit.JasenetLista}>{jasenetTeksti}</span>
                    </div>
                    <span style={tyylit.Pisteet}>{joukkueAlkio.kokonaistulos}</span>
                  </div>
                  
                  {/* HAITARIOSIO (ERÄTAULUKOT) */}
                  {onAuki && (
                    <div style={tyylit.AmpujatSektio}>
                      
                      {/* JOUKKUEEN ERÄPÖYTÄKIRJA */}
                      <div style={tyylit.OsioLaatikko}>
                        <div style={tyylit.SektioOtsikko}>Joukkueen yhteispisteet</div>
                        {renderöiEräTaulukko(joukkueAlkio.erat)}
                      </div>

                      {/* AMPUJIEN ERÄPÖYTÄKIRJAT */}
                      <div style={{ marginTop: '15px' }}>
                        <div style={tyylit.SektioOtsikko}>Ampujakohtaiset tulokset</div>
                        {joukkueAlkio.ampujat.map((ampuja) => (
                          <div key={ampuja.id} style={tyylit.AmpujaRiviLaatikko}>
                            <div style={tyylit.AmpujaYlaosa}>
                              <span style={tyylit.AmpujaNimi}>• {ampuja.nimi}</span>
                              <span style={tyylit.AmpujaYhteensa}>Yht: {ampuja.kokonaistulos}</span>
                            </div>
                            {renderöiEräTaulukko(ampuja.erat)}
                          </div>
                        ))}
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- TYYLIT KOMPAKTILLE JA SELKEÄLLE ERÄTAULUKOLLE ---
const tyylit = {
  SivuSäiliö: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222' },
  Lataus: { fontFamily: 'sans-serif', padding: '20px', color: '#666' },
  SarjaOtsikko: { fontSize: '1.3em', fontWeight: '700', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', maxWidth: '600px', marginBottom: '16px', color: '#111827' }, 
  Lista: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }, 
  Kortti: { background: '#ffffff', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }, 
  JoukkueRivi: { display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', userSelect: 'none', gap: '14px' }, 
  SijoitusPallo: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '0.9em', flexShrink: 0 },
  TekstiAlue: { flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }, 
  JoukkueNimi: { fontSize: '1.1em', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }, 
  ValmiusPiste: { width: '9px', height: '9px', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' },
  NuoliIcon: { fontSize: '0.7em', color: '#9ca3af' },
  JasenetLista: { fontSize: '0.85em', color: '#4b5563' }, 
  Pisteet: { width: '65px', textAlign: 'right', fontSize: '1.3em', fontWeight: '700', fontFamily: 'monospace' }, 
  
  // Avautuvan osion taustat ja asettelu
  AmpujatSektio: { padding: '14px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '12px' }, 
  OsioLaatikko: { background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e5e7eb' },
  AmpujaRiviLaatikko: { background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '8px' },
  AmpujaYlaosa: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  AmpujaNimi: { fontWeight: '600', color: '#374151', fontSize: '0.95em' },
  AmpujaYhteensa: { fontWeight: '700', color: '#111827', fontSize: '0.95em', fontFamily: 'monospace' },
  SektioOtsikko: { fontWeight: '600', marginBottom: '6px', fontSize: '0.75em', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' },
  
  // --- UUDET TAULUKKOTYYLIT RUUDUKOLLE ---
  TaulukkoSäiliö: { display: 'flex', flexDirection: 'column', gap: '6px', overflowX: 'auto' },
  Taulukko: { width: '100%', borderCollapse: 'collapse', marginTop: '2px', fontSize: '0.8em', fontFamily: 'monospace' },
  OtsikkoSolu: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', padding: '3px 2px', textAlign: 'center', fontWeight: '600', minWidth: '22px' },
  OtsikkoSoluMuted: { background: '#e5e7eb', color: '#4b5563', border: '1px solid #e5e7eb', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold', width: '32px' },
  DataSolu: { border: '1px solid #e5e7eb', padding: '3px 2px', textAlign: 'center', color: '#111827', background: '#fff' },
  DataSoluMuted: { background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', padding: '3px 4px', textAlign: 'center', fontSize: '0.8em' }
};