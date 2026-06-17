// src/RyhmaJako.jsx
import React, { useState, useEffect } from 'react';
import { ReactSortable } from 'react-sortablejs';
import { teema } from './teema';

export default function RyhmaJako({ data }) {
  const [erät, setErät] = useState([]);

  // Synkronoidaan App.jsx:stä valuva data paikalliseen tilaan, kun se muuttuu Sheetsissä
  useEffect(() => {
    if (data && data.erät) {
      setErät(data.erät);
    } else if (data && data.ryhmat) {
      setErät(data.ryhmat); // Huomioidaan eri nimeämisvaihtoehdot
    }
  }, [data]);

  if (!data) return <div style={{ fontFamily: teema.fontti }}>Ladataan erätietoja...</div>;

  return (
    <div style={{ fontFamily: teema.fontti }}>
      <p style={{ fontSize: '0.9em', fontStyle: 'italic' }}>⚙️ Voit järjestellä ampujia erien välillä raahaamalla.</p>
      
      <div style={tyylit.EraRuudukko}>
        {erät.map((erä, eräIndeksi) => (
          <div key={eräIndeksi} style={tyylit.EraLaatikko}>
            <div style={tyylit.EraOtsikko}>{erä.nimi || `Erä ${eräIndeksi + 1}`}</div>
            
            {/* Drag & Drop alue */}
            <ReactSortable
              list={erä.ampujat || []}
              setList={(uusiLista) => {
                const paivitetytErät = [...erät];
                paivitetytErät[eräIndeksi].ampujat = uusiLista;
                setErät(paivitetytErät);
              }}
              group="ampujapooli"
              animation={150}
              style={tyylit.AmpujaListaAlue}
            >
              {(erä.ampujat || []).map((ampuja, aIndeksi) => (
                <div key={ampuja.nimi + aIndeksi} style={tyylit.AmpujaRivi}>
                  <span>{ampuja.nimi}</span>
                  <span style={tyylit.AmpujaSarja}>{ampuja.sarja}</span>
                </div>
              ))}
            </ReactSortable>
          </div>
        ))}
      </div>
    </div>
  );
}

const tyylit = {
  EraRuudukko: { display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '15px' },
  EraLaatikko: { border: teema.reunus, width: '280px', background: teema.taustaHarmaa },
  EraOtsikko: { background: teema.paavari, color: teema.tekstiVaalea, padding: '5px 10px', fontWeight: 'bold', fontSize: '0.9em' },
  AmpujaListaAlue: { padding: '10px', minHeight: '100px', display: 'flex', flexDirection: 'column', gap: '5px' },
  AmpujaRivi: { background: '#fff', border: '1px solid #ccc', padding: '6px 8px', cursor: 'grab', display: 'flex', justifyContent: 'space-between', fontSize: '0.85em' },
  AmpujaSarja: { color: '#666', fontWeight: 'bold' }
};