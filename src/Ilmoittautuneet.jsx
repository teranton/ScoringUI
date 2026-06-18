// src/Ilmoittautuneet.jsx
import React, { useMemo } from 'react';
import { parseCsvRows } from './utils/csv';

export default function Ilmoittautuneet({ rawCsv }) {
  // Jos dataa ei ole tai välilehti on tyhjä, ei piirretä mitään.
  if (!rawCsv || rawCsv.trim().length < 10) return null;

  const { ryhmitellytSarjat, kokonaismaara } = useMemo(() => {
    const raakaRivit = parseCsvRows(rawCsv);
    if (raakaRivit.length < 2) return { ryhmitellytSarjat: {}, kokonaismaara: 0 };

    // 1. Etsitään oikeat sarakkeet ensimmäiseltä riviltä tekstien perusteella
    const otsikot = raakaRivit[0].map((o) => String(o || '').toUpperCase().trim());
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

    // Jos otsikoita ei jostain syystä löydy lainkaan, käytetään varuiksi antamasi datan indeksejä (3, 4, 5)
    const lopullinenIdxNimi = idxNimi !== -1 ? idxNimi : 3;
    const lopullinenIdxSarja = idxSarja !== -1 ? idxSarja : 4;
    const lopullinenIdxSeura = idxSeura !== -1 ? idxSeura : 5;

    const osallistujat = [];

    // 2. Käydään datarivit läpi (aloitetaan riviltä 1 otsikoiden jälkeen)
    for (let i = 1; i < raakaRivit.length; i++) {
      const row = raakaRivit[i];
      if (!row || row.length === 0) continue;

      const nimiArvo = String(row[lopullinenIdxNimi] || '').trim();
      const sarjaArvo = String(row[lopullinenIdxSarja] || '').trim() || 'Määrittelemätön';
      const seuraArvo = String(row[lopullinenIdxSeura] || '').trim();

      // Ohitetaan tyhjät rivit tai otsikoiden "Päivitetty" apurivit
      if (!nimiArvo || nimiArvo.toLowerCase().includes('päivitetty')) continue;

      osallistujat.push({
        id: `${nimiArvo}-${sarjaArvo}-${i}`,
        nimi: nimiArvo,
        seura: seuraArvo,
        sarja: sarjaArvo
      });
    }

    // Järjestetään kaikki osallistujat sukunimen/nimen mukaan aakkosiin
    osallistujat.sort((a, b) => a.nimi.localeCompare(b.nimi, 'fi'));

    // Ryhmitellään sarjoittain
    const ryhmittely = {};
    osallistujat.forEach((o) => {
      if (!ryhmittely[o.sarja]) ryhmittely[o.sarja] = [];
      ryhmittely[o.sarja].push(o);
    });

    return { ryhmitellytSarjat: ryhmittely, kokonaismaara: osallistujat.length };
  }, [rawCsv]);

  if (kokonaismaara === 0) return null;

  return (
    <div style={tyylit.Säiliö}>
      <h2 style={tyylit.PääOtsikko}>Ilmoittautuneet osallistujat ({kokonaismaara})</h2>
      <p style={tyylit.InfoTeksti}>Tämä lista poistuu näkyvistä automaattisesti, kun kilpailu alkaa.</p>

      {Object.keys(ryhmitellytSarjat).sort().map((sarja) => (
        <div key={sarja} style={tyylit.SarjaLohko}>
          <h3 style={tyylit.SarjaOtsikko}>
            <span>Sarja {sarja}</span>
            <span style={tyylit.MääräTag}>{ryhmitellytSarjat[sarja].length} ampujaa</span>
          </h3>
          <div style={tyylit.Lista}>
            {ryhmitellytSarjat[sarja].map((o) => (
              <div key={o.id} style={tyylit.Rivi}>
                <span style={tyylit.Nimi}>{o.nimi}</span>
                <span style={tyylit.Seura}>{o.seura || '—'}</span>
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
    width: '100%',
    boxSizing: 'border-box',
    background: '#ffffff',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #e8eaed',
    marginBottom: '25px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  PääOtsikko: { fontSize: '1.25em', fontWeight: '700', color: '#1a1f2c', margin: '0 0 4px 0' },
  InfoTeksti: { fontSize: '0.85em', color: '#5f6368', margin: '0 0 16px 0', lineHeight: '1.4' },
  SarjaLohko: { marginBottom: '16px' },
  SarjaOtsikko: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    fontSize: '0.9em', 
    fontWeight: '700', 
    color: '#202124', 
    background: '#f1f3f4', 
    padding: '8px 12px', 
    borderRadius: '6px', 
    margin: '0 0 6px 0' 
  },
  MääräTag: { fontSize: '0.85em', color: '#5f6368', fontWeight: '500' },
  Lista: { display: 'flex', flexDirection: 'column', gap: '2px' },
  Rivi: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    fontSize: '0.9em', 
    padding: '6px 4px', 
    borderBottom: '1px solid #f1f3f4',
    gap: '12px'
  },
  Nimi: { color: '#202124', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  Seura: { color: '#5f6368', fontSize: '0.9em', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }
};