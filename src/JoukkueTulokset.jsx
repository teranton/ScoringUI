// src/JoukkueTulokset.jsx
import React from 'react';
import { teema } from './teema';

export default function JoukkueTulokset({ data }) {
  if (!data || !data.joukkueetCsvRaw) {
    return <div style={{ fontFamily: teema.fontti }}>Ladataan dynaamista tulosdataa...</div>;
  }

  // 1. STANDARDIN GOOGLE-CSV:N PARSIMINEN
  const raakaRivit = data.joukkueetCsvRaw.split('\n');
  
  const siivoaSolu = (solu) => {
    if (!solu) return "";
    return solu.replace(/^"|"$/g, '').trim();
  };

  const headers = raakaRivit[0].split(',').map(siivoaSolu);
  
  const kaikkiJoukkueet = [];
  let currentTeam = null;

  for (let i = 1; i < raakaRivit.length; i++) {
    if (!raakaRivit[i]) continue;
    
    const row = raakaRivit[i].split(',').map(siivoaSolu);
    
    // --- KORJAUS: Jos koko rivi on tyhjä tai sarakkeet A, B ja C ovat tyhjiä, hypätään yli ---
    if (!row[0] && !row[1] && !row[2]) continue; 

    const ranking = row[0];
    const teamName = row[1];
    const shooterName = row[2];
    const category = row[3];

    // Jos kyseessä on aito joukkuerivi (Joukkuenimi löytyy, mutta ampujaa ei)
    if (teamName !== "" && shooterName === "") {
      if (currentTeam) kaikkiJoukkueet.push(currentTeam);
      
      const teamResults = {};
      for (let col = 4; col < row.length; col++) {
        if (headers[col]) teamResults[headers[col]] = row[col];
      }

      currentTeam = {
        sijoitus: ranking,
        joukkue: teamName,
        sarja: category,
        tulokset: teamResults,
        ampujat: []
      };
    } 
    // Jos kyseessä on ampuja, joka kuuluu nykyiseen joukkueeseen
    else if (shooterName !== "" && currentTeam) {
      const shooterResults = {};
      for (let col = 4; col < row.length; col++) {
        if (headers[col]) shooterResults[headers[col]] = row[col];
      }
      
      currentTeam.ampujat.push({
        nimi: shooterName,
        sarja: category,
        tulokset: shooterResults
      });
    }
  }
  // Lisätään viimeinen joukkue matkaan
  if (currentTeam) kaikkiJoukkueet.push(currentTeam);

  // 2. RYHMITELLÄÄN JOUKKUEET SARJOITTAIN
  const sarjat = {};
  kaikkiJoukkueet.forEach(j => { 
    if (!j.sarja) return; // Varmistetaan ettei tyhjiä sarjoja luoda
    if (!sarjat[j.sarja]) sarjat[j.sarja] = []; 
    sarjat[j.sarja].push(j); 
  });

  const haeRivinVari = (s) => { 
    if (s === 1) return teema.kulta; 
    if (s === 2) return teema.hopea; 
    if (s === 3) return teema.pronssi; 
    return teema.paavari; 
  };

  // 3. PIIRRETÄÄN UI CLEANINA
  return (
    <div style={{ fontFamily: teema.fontti }}>
      {Object.keys(sarjat).map(sarjaNimi => (
        <div key={sarjaNimi} style={{ marginBottom: '30px' }}>
          <h2 style={tyylit.SarjaOtsikko}>SARJA: {sarjaNimi}</h2>
          <div style={tyylit.lista}>
            {sarjat[sarjaNimi].map((joukkueAlkio, indeksi) => {
              const avaimet = Object.keys(joukkueAlkio.tulokset);
              const kokonaistulos = joukkueAlkio.tulokset["KOKONAISTULOS"] || joukkueAlkio.tulokset[avaimet[avaimet.length - 1]] || 0;
              const sarjaSijoitus = indeksi + 1; 
              const rivinTaustavari = haeRivinVari(sarjaSijoitus);

              return (
                <div key={indeksi} style={{ ...tyylit.kortti, borderColor: rivinTaustavari }}>
                  <div style={{ ...tyylit.joukkueRivi, background: rivinTaustavari }}>
                    <span style={tyylit.sijoitus}>#{joukkueAlkio.sijoitus}</span>
                    <span style={tyylit.nimi}>{joukkueAlkio.joukkue}</span>
                    <span style={tyylit.pisteet}>{kokonaistulos}</span>
                  </div>
                  <div style={tyylit.ampujatSektio}>
                    {joukkueAlkio.ampujat.map((ampuja, aIndeksi) => {
                      const aAvaimet = Object.keys(ampuja.tulokset);
                      const aTulos = ampuja.tulokset["KOKONAISTULOS"] || ampuja.tulokset[aAvaimet[aAvaimet.length - 1]] || 0;
                      return (
                        <div key={aIndeksi} style={tyylit.ampujaRivi}>
                          <span style={tyylit.ampujaNimi}>• {ampuja.nimi} ({ampuja.sarja})</span>
                          <span style={tyylit.ampujaTulos}>{aTulos}</span>
                        </div>
                      );
                    })}
                  </div>
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
  joukkueRivi: { display: 'flex', alignItems: 'center', color: teema.tekstiVaalea, padding: '8px 10px', fontWeight: 'bold' }, 
  sijoitus: { width: '40px' }, 
  nimi: { flex: 1 }, 
  pisteet: { width: '60px', textAlign: 'right', fontSize: '1.1em' }, 
  ampujatSektio: { padding: '6px 0px' }, 
  ampujaRivi: { display: 'flex', padding: '5px 10px 5px 25px', fontSize: '0.9em', borderBottom: '1px dashed #eee' }, 
  ampujaNimi: { flex: 1, color: '#333' }, 
  ampujaTulos: { width: '50px', textAlign: 'right', fontWeight: 'bold', color: teema.tekstiTumma } 
};