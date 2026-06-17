// src/JoukkueTulokset.jsx
import React, { useState } from 'react';
import { teema } from './teema';

export default function JoukkueTulokset({ data }) {
  const [avatutJoukkueet, setAvatutJoukkueet] = useState({});

  if (!data || !data.joukkueetCsvRaw) {
    return <div style={{ fontFamily: teema.fontti }}>Ladataan dynaamista tulosdataa...</div>;
  }

  const toggleJoukkue = (joukkueNimi) => {
    setAvatutJoukkueet(prev => ({
      ...prev,
      [joukkueNimi]: !prev[joukkueNimi]
    }));
  };

  // 1. PARSITAAN GOOGLE-CSV
  const raakaRivit = data.joukkueetCsvRaw.split('\n');
  
  const siivoaSolu = (solu) => {
    if (!solu) return "";
    return solu.replace(/^"|"$/g, '').trim();
  };

  const kaikkiJoukkueet = [];
  let currentTeam = null;

  for (let i = 1; i < raakaRivit.length; i++) {
    if (!raakaRivit[i]) continue;
    
    const row = raakaRivit[i].split(',').map(siivoaSolu);
    if (!row[0] && !row[1] && !row[2]) continue; 

    const ranking = row[0];
    const teamName = row[1];
    const shooterName = row[2];
    const category = row[3];
    const yhteistulos = row[28] || "0"; 

    const erat = [];
    for (let col = 4; col <= 27; col++) {
      if (row[col] !== undefined && row[col] !== "") {
        erat.push({ numero: col - 3, pisteet: row[col] });
      }
    }

    if (teamName !== "" && shooterName === "") {
      if (currentTeam) kaikkiJoukkueet.push(currentTeam);
      
      currentTeam = {
        sijoitus: ranking,
        joukkue: teamName,
        sarja: category,
        kokonaistulos: yhteistulos,
        erat: erat, 
        ampujat: []
      };
    } 
    else if (shooterName !== "" && currentTeam) {
      currentTeam.ampujat.push({
        nimi: shooterName,
        sarja: category,
        kokonaistulos: yhteistulos,
        erat: erat 
      });
    }
  }
  if (currentTeam) kaikkiJoukkueet.push(currentTeam);

  // 2. RYHMITELLÄÄN SARJOITTAIN
  const sarjat = {};
  kaikkiJoukkueet.forEach(j => { 
    if (!j.sarja) return;
    if (!sarjat[j.sarja]) sarjat[j.sarja] = []; 
    sarjat[j.sarja].push(j); 
  });

  const haeRivinVari = (s) => { 
    if (s === 1) return teema.kulta; 
    if (s === 2) return teema.hopea; 
    if (s === 3) return teema.pronssi; 
    return teema.paavari; 
  };

  // 3. PIIRRETÄÄN KÄYTTÖLIITTYMÄ
  return (
    <div style={{ fontFamily: teema.fontti }}>
      {Object.keys(sarjat).map(sarjaNimi => (
        <div key={sarjaNimi} style={{ marginBottom: '30px' }}>
          <h2 style={tyylit.SarjaOtsikko}>SARJA: {sarjaNimi}</h2>
          <div style={tyylit.lista}>
            {sarjat[sarjaNimi].map((joukkueAlkio, indeksi) => {
              
              const sarjaSijoitus = indeksi + 1; 
              const rivinTaustavari = haeRivinVari(sarjaSijoitus);
              const onAuki = !!avatutJoukkueet[joukkueAlkio.joukkue];

              // Luodaan pilkulla erotettu lista ampujien nimistä päänäkymää varten
              const jasenetTeksti = joukkueAlkio.ampujat.map(a => a.nimi).join(', ');

              return (
                <div key={indeksi} style={{ ...tyylit.kortti, borderColor: rivinTaustavari }}>
                  
                  {/* JOUKKUEEN KLIKATTAVA PÄÄRIVI */}
                  <div 
                    onClick={() => toggleJoukkue(joukkueAlkio.joukkue)} 
                    style={{ ...tyylit.joukkueRivi, background: rivinTaustavari }}
                  >
                    <span style={tyylit.sijoitus}>#{joukkueAlkio.sijoitus}</span>
                    
                    <div style={tyylit.joukkueTekstiAlue}>
                      <span style={tyylit.nimi}>
                        {joukkueAlkio.joukkue} <span style={{ fontSize: '0.75em', fontWeight: 'normal', opacity: 0.8 }}>{onAuki ? '▼' : '▶'}</span>
                      </span>
                      {/* --- UUSI OSIO: JÄSENTEN NIMET NÄKYY TÄSSÄ SUORAAN --- */}
                      <span style={tyylit.jasenetLista}>
                        {jasenetTeksti || "Ei ladattuja jäseniä"}
                      </span>
                    </div>

                    <span style={tyylit.pisteet}>{joukkueAlkio.kokonaistulos}</span>
                  </div>
                  
                  {/* HAITARIOSIO: ERÄTULOKSET */}
                  {onAuki && (
                    <div style={tyylit.ampujatSektio}>
                      
                      {/* Joukkueen eräkohtaiset yhteistulokset */}
                      {joukkueAlkio.erat.length > 0 && (
                        <div style={tyylit.joukkueEratPalkki}>
                          <div style={{ fontWeight: 'bold', marginBottom: '3px', fontSize: '0.85em', color: '#555' }}>JOUKKUEEN ERÄPISTEET:</div>
                          <div style={tyylit.eraRulla}>
                            {joukkueAlkio.erat.map(e => (
                              <span key={e.numero} style={tyylit.eraPalloJoukkue}>
                                {e.numero}:<strong>{e.pisteet}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ampujat riveittäin erätuloksineen */}
                      {joukkueAlkio.ampujat.map((ampuja, aIndeksi) => (
                        <div key={aIndeksi} style={tyylit.ampujaKortti}>
                          <div style={tyylit.ampujaPerustiedot}>
                            <span style={tyylit.ampujaNimi}>• {ampuja.nimi}</span>
                            <span style={tyylit.ampujaYhteensa}>{ampuja.kokonaistulos}</span>
                          </div>
                          
                          <div style={tyylit.eraRulla}>
                            {ampuja.erat.map(e => (
                              <span key={e.numero} style={tyylit.eraPalloAmpuja}>
                                {e.pisteet}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
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

const tyylit = { 
  SarjaOtsikko: { fontSize: '1.2em', borderBottom: '2px solid #000', paddingBottom: '4px', maxWidth: '600px', marginBottom: '15px', fontWeight: 'bold', marginTop: '20px' }, 
  lista: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px' }, 
  kortti: { border: '1px solid', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }, 
  
  // Päivitetty riviasettelu flex-suunnalle allekkain teksteille
  joukkueRivi: { display: 'flex', alignItems: 'center', color: teema.tekstiVaalea, padding: '8px 10px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }, 
  sijoitus: { width: '40px', fontSize: '1.1em' }, 
  joukkueTekstiAlue: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' },
  nimi: { fontSize: '1.1em', lineHeight: '1.2' }, 
  
  // Tyyli suoralle nimilistalle päänäkymässä
  jasenetLista: { fontSize: '0.78em', fontWeight: 'normal', opacity: 0.95, color: 'rgba(255, 255, 255, 0.9)', letterSpacing: '0.3px' },
  
  pisteet: { width: '60px', textAlign: 'right', fontSize: '1.3em', fontWeight: 'bold' }, 
  ampujatSektio: { padding: '10px', background: '#fcfcfc', borderTop: '1px solid #eee' }, 
  joukkueEratPalkki: { marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #eee' },
  ampujaKortti: { marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px dashed #eee' },
  ampujaPerustiedot: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.95em', marginBottom: '4px' },
  ampujaNimi: { color: '#222' },
  ampujaYhteensa: { color: teema.tekstiTumma },
  eraRulla: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' },
  eraPalloJoukkue: { background: '#e1ecf4', color: '#1a4a75', padding: '2px 5px', fontSize: '0.75em', borderRadius: '3px', border: '1px solid #b3d4fc' },
  eraPalloAmpuja: { background: '#f0f0f0', color: '#333', minWidth: '18px', textAlign: 'center', padding: '2px 4px', fontSize: '0.8em', borderRadius: '2px' }
};