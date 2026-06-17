// src/JoukkueTulokset.jsx
import React from 'react';
import { teema } from './teema';

export default function JoukkueTulokset({ data }) {
  if (!data || !data.joukkueetCsv) {
    return <div style={{ fontFamily: teema.fontti }}>Ladataan dynaamista tulosdataa...</div>;
  }

  // 1. PARSITAAN CSV RIVEIKSI
  const rivit = data.joukkueetCsv.split('\n');
  const headers = rivit[0].split('|');
  
  const kaikkiJoukkueet = [];
  let currentTeam = null;

  for (let i = 1; i < rivit.length; i++) {
    if (!rivit[i]) continue;
    const row = rivit[i].split('|');
    
    const ranking = row[0];
    const teamName = row[1];
    const shooterName = row[2];
    const category = row[3];

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
  if (currentTeam) kaikkiJoukkueet.push(currentTeam);

  // 2. RYHMITELLÄÄN JOUKKUEET SARJOITTAIN JA LASKETAAN SARJANSISÄINEN SIJOITUS
  const sarjat = {};
  kaikkiJoukkueet.forEach(joukkue => {
    if (!sarjat[joukkue.sarja]) {
      sarjat[joukkue.sarja] = [];
    }
    sarjat[joukkue.sarja].push(joukkue);
  });

  // Funktio, joka palauttaa oikean värin sarjansisäisen sijoituksen mukaan
  const haeRivinVari = (sarjaSijoitus) => {
    if (sarjaSijoitus === 1) return teema.kulta;
    if (sarjaSijoitus === 2) return teema.hopea;
    if (sarjaSijoitus === 3) return teema.pronssi;
    return teema.paavari; // Muut sijat saavat normaalin päävärin
  };

  // 3. PIIRRETÄÄN TULOKSET SARJOITTAIN
  return (
    <div style={{ fontFamily: teema.fontti }}>
      {Object.keys(sarjat).map(sarjaNimi => (
        <div key={sarjaNimi} style={{ marginBottom: '30px' }}>
          {/* Sarjan otsikko */}
          <h2 style={tyylit.SarjaOtsikko}>SARJA: {sarjaNimi}</h2>
          
          <div style={tyylit.lista}>
            {sarjat[sarjaNimi].map((joukkueAlkio, indeksi) => {
              const avaimet = Object.keys(joukkueAlkio.tulokset);
              const kokonaistulos = joukkueAlkio.tulokset["KOKONAISTULOS"] || joukkueAlkio.tulokset[avaimet[avaimet.length - 1]] || 0;
              
              // Indeksi + 1 kertoo suoraan joukkueen sijoituksen TÄMÄN SARJAN sisällä,
              // koska Sheets palauttaa ne valmiiksi järjestyksessä.
              const sarjaSijoitus = indeksi + 1; 
              const rivinTaustavari = haeRivinVari(sarjaSijoitus);

              return (
                <div key={indeksi} style={{ ...tyylit.kortti, borderColor: rivinTaustavari }}>
                  {/* Dynaamisesti väritetty joukkuerivi */}
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
  SarjaOtsikko: { fontSize: '1.2em', borderBottom: '2px solid #000', paddingBottom: '4px', maxWidth: '600px', marginBottom: '10px', fontWeight: 'bold' },
  lista: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' },
  kortti: { border: '1px solid', background: '#fff' },
  joukkueRivi: { display: 'flex', alignItems: 'center', color: teema.tekstiVaalea, padding: '6px 10px', fontWeight: 'bold' },
  sijoitus: { width: '40px' },
  nimi: { flex: 1 },
  pisteet: { width: '60px', textAlign: 'right', fontSize: '1.1em' },
  ampujatSektio: { padding: '4px 0px' },
  ampujaRivi: { display: 'flex', padding: '4px 10px 4px 25px', fontSize: '0.9em', borderBottom: '1px dashed #eee' },
  ampujaNimi: { flex: 1, color: '#333' },
  ampujaTulos: { width: '50px', textAlign: 'right', fontWeight: 'bold', color: teema.tekstiTumma }
};