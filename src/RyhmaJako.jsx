import React, { useState, useEffect } from 'react';
import { ReactSortable } from 'react-sortablejs';

// VAIHDA TÄHÄN SE GOOGLE APPS SCRIPT WEB APP URL
const API_URL = "SINUN_APPS_SCRIPT_WEB_APP_URL";

export default function RyhmaJako() {
  const [ryhmat, setRyhmat] = useState([]);
  const [ladataan, setLadataan] = useState(true);
  const [tallennetaan, setTallennetaan] = useState(false);

  // 1. HAETAAN DATA SHEETSISTÄ (GET)
  useEffect(() => {
    async function haeData() {
      try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        // Oletetaan, että API palauttaa ryhmärakenteen. Jos se palauttaa raakalistaa,
        // se pitää muotoilla tähän muotoon: [{ id: "1", ryhmaNimi: "Erä 1", ampujat: [...] }]
        // HUOM: react-sortablejs VAATII, että jokaisella alkiolla (sekä ryhmällä että ampujalla) on uniikki 'id' avain!
        setRyhmat(data);
      } catch (error) {
        console.error("Virhe datan hakemisessa:", error);
        // Testidataa, jos Sheets ei vastaa kehityksen aikana:
        setRyhmat([
          { id: "g1", ryhmaNimi: "Erä 1 — klo 10:00", ampujat: [{ id: "a1", nimi: "Matti Meikäläinen", sarja: "M50" }, { id: "a2", nimi: "Pekka Puupää", sarja: "M" }] },
          { id: "g2", ryhmaNimi: "Erä 2 — klo 10:30", ampujat: [{ id: "a3", nimi: "Jussi Juonio", sarja: "Y80" }, { id: "a4", nimi: "Maija Meikäläinen", sarja: "N50" }] }
        ]);
      } finally {
        setLadataan(false);
      }
    }
    haeData();
  }, []);

  // 2. TALLENNETAAN DATA SHEETSIIN (POST)
  const kahvaTallenna = async () => {
    setTallennetaan(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain" }, // Google-kikka CORS-virheitä vastaan
        body: JSON.stringify(ryhmat)
      });
      const resData = await response.json();
      if (resData.status === "success") {
        alert("🎉 Ryhmät päivitetty onnistuneesti Google Sheetsiin!");
      } else {
        alert("❌ Virhe: " + resData.error);
      }
    } catch (error) {
      console.error("Tallennusvirhe:", error);
      alert("Yhteysvirhe tallennettavassa datassa.");
    } finally {
      setTallennetaan(false);
    }
  };

  // Päivittää yksittäisen ryhmän ampujalistan, kun drag & drop tapahtuu
  const paivitaAmpujat = (ryhmaId, uudetAmpujat) => {
    setRyhmat(prevRyhmat =>
      prevRyhmat.map(r => (r.id === ryhmaId ? { ...r, ampujat: uudetAmpujat } : r))
    );
  };

  if (ladataan) return <div style={tyylit.keskitys}>Ladataan Jetsonen-style ryhmäjakoa...</div>;

  return (
    <div style={tyylit.sivu}>
      <header style={tyylit.ylapalkki}>
        <h1 style={tyylit.otsikko}>🎯 Kilpailun eräluettelon hallinta</h1>
        <button 
          onClick={kahvaTallenna} 
          disabled={tallennetaan} 
          style={tallennetaan ? tyylit.nappiDisabled : tyylit.nappi}
        >
          {tallennetaan ? "Tallennetaan..." : "Tallenna muutokset Sheetiin"}
        </button>
      </header>

      <div style={tyylit.eraruudukko}>
        {ryhmat.map(ryhma => (
          <div key={ryhma.id} style={tyylit.eraKortti}>
            <div style={tyylit.eraOtsikko}>{ryhma.ryhmaNimi}</div>
            
            {/* TÄMÄ ON SE DRAG & DROP ALUE */}
            <ReactSortable
              list={ryhma.ampujat}
              setList={(uusiLista) => paivitaAmpujat(ryhma.id, uusiLista)}
              group="ampujapooli" // Sama ryhmän nimi kaikilla korteilla -> ampujia voi siirtää korttien välillä!
              animation={150}
              ghostClass="raahaus-haamu"
              style={tyylit.listaAlue}
            >
              {ryhma.ampujat.map((ampuja, indeksi) => (
                <div key={ampuja.id} style={tyylit.ampujaRivi}>
                  <span style={tyylit.numero}>{indeksi + 1}.</span>
                  <span style={tyylit.nimi}>{ampuja.nimi}</span>
                  <span style={tyylit.seuraSarja}>{ampuja.sarja}</span>
                </div>
              ))}
            </ReactSortable>

            {ryhma.ampujat.length === 0 && (
              <div style={tyylit.tyhjaViesti}>Tyhjä erä - raahaa ampujia tähän</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. PUHTAAT JETSONEN-STYLE KEVYET TYYLIT (CSS-in-JS)
const tyylit = {
  sivu: { padding: '20px', fontFamily: 'monospace, sans-serif', background: '#fafafa', minHeight: '100vh' },
  ylapalkki: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #333', paddingBottom: '10px', marginBottom: '20px' },
  otsikko: { margin: 0, fontSize: '1.4em', letterSpacing: '-0.5px' },
  nappi: { background: '#000', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold' },
  nappiDisabled: { background: '#888', color: '#ccc', border: 'none', padding: '8px 16px', cursor: 'not-allowed' },
  eraruudukko: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' },
  eraKortti: { background: '#fff', border: '1px solid #ccc', borderRadius: '0px', boxShadow: '2px 2px 0px rgba(0,0,0,0.1)' },
  eraOtsikko: { background: '#333', color: '#fff', padding: '6px 10px', fontWeight: 'bold', fontSize: '0.9em' },
  listaAlue: { minHeight: '100px', padding: '5px' },
  ampujaRivi: { display: 'flex', padding: '8px 5px', borderBottom: '1px dashed #eee', cursor: 'grab', background: '#fff', alignItems: 'center' },
  numero: { width: '25px', color: '#888', fontSize: '0.85em' },
  nimi: { flex: 1, fontSize: '0.95em' },
  seuraSarja: { background: '#eee', padding: '2px 6px', fontSize: '0.8em', fontWeight: 'bold' },
  tyhjaViesti: { textAlign: 'center', color: '#999', padding: '20px', fontSize: '0.85em', fontStyle: 'italic' },
  keskitys: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'monospace' }
};