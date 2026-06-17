// src/Ilmoittautuneet.jsx
import React from 'react';

export default function Ilmoittautuneet({ rawCsv }) {
  // Jos dataa ei ole tai välilehti on tyhjä, ei piirretä mitään
  if (!rawCsv || rawCsv.trim().length < 10) return null;

  const raakaRivit = rawCsv.split('\n');
  const siivoaSolu = (solu) => (!solu ? "" : solu.replace(/^"|"$/g, '').trim());

  const otsikot = raakaRivit[0].split(',').map(siivoaSolu);
  const osallistujat = [];

  for (let i = 1; i < raakaRivit.length; i++) {
    if (!raakaRivit[i]) continue;
    const row = raakaRivit[i].split(',').map(siivoaSolu);
    
    // Tarkistetaan että rivillä on nimen tynkää
    if (!row[0] && !row[1]) continue;

    osallistujat.push({
      nimi: row[0] || "",
      seura: row[1] || "",
      sarja: row[2] || ""
    });
  }

  // Ryhmitellään osallistujat sarjoittain luettavuuden vuoksi
  const sarjat = {};
  osallistujat.forEach(o => {
    if (!o.sarja) return;
    if (!sarjat[o.sarja]) sarjat[o.sarja] = [];
    sarjat[o.sarja].push(o);
  });

  return (
    <div style={tyylit.Säiliö}>
      <h2 style={tyylit.PääOtsikko}>Ilmoittautuneet osallistujat</h2>
      <p style={tyylit.InfoTeksti}>Tämä lista poistuu näkyvistä automaattisesti, kun kilpailu alkaa.</p>
      
      {Object.keys(sarjat).map(sarja => (
        <div key={sarja} style={tyylit.SarjaLohko}>
          <h3 style={tyylit.SarjaOtsikko}>Sarja {sarja} ({sarjat[sarja].length} ampujaa)</h3>
          <div style={tyylit.Lista}>
            {sarjat[sarja].map((o, idx) => (
              <div key={idx} style={tyylit.Rivi}>
                <span style={tyylit.Nimi}>{o.nimi}</span>
                <span style={tyylit.Seura}>{o.seura}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const tyylit = {
  Säiliö: {
    maxWidth: '600px',
    background: '#ffffff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    marginBottom: '25px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  PääOtsikko: { fontSize: '1.4em', fontWeight: '700', color: '#111827', marginBottom: '4px' },
  InfoTeksti: { fontSize: '0.85em', color: '#6b7280', marginBottom: '20px' },
  SarjaLohko: { marginBottom: '18px' },
  SarjaOtsikko: { fontSize: '1em', fontWeight: '600', color: '#374151', background: '#f3f4f6', padding: '6px 10px', borderRadius: '4px', marginBottom: '8px' },
  Lista: { display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '4px' },
  Rivi: { display: 'flex', justifyContent: 'space-between', fontSize: '0.95em', paddingBottom: '4px', borderBottom: '1px solid #f3f4f6' },
  Nimi: { color: '#111827', fontWeight: '500' },
  Seura: { color: '#6b7280', fontSize: '0.9em' }
};