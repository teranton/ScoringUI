// src/App.jsx
import React, { useState, useEffect } from 'react';
import JoukkueTulokset from './JoukkueTulokset';
import RyhmaJako from './RyhmaJako';
import { teema } from './teema';

// TÄHÄN SE MESTARI-SHEETIN APPS SCRIPT URL, JOKA PALAUTTAA KISALISTAN
const MESTARI_API_URL = "https://script.google.com/macros/s/AKfycbyjyGDXxaIxj0RYxGc6JnYte9hck1N3I-M-Ql2t_AFhVAOO-dc8R3p4UhxMnJz-rspu/exec";

export default function App() {
  const [kisat, setKisat] = useState([]);
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('joukkueet');
  const [ladataanKisalista, setLadataanKisalista] = useState(true);

  // KISAKOHTAINEN DATA JA TILA
  const [kisaData, setKisaData] = useState(null);
  const [ladataanKisaa, setLadataanKisaa] = useState(false);
  const [virhe, setVirhe] = useState(null);

  // 1. Haetaan yleinen kisalista etusivulle heti alussa
  useEffect(() => {
    async function haeKisalista() {
      try {
        const response = await fetch(MESTARI_API_URL);
        const data = await response.json();
        setKisat(data);
      } catch (error) {
        console.error("Virhe kisalistan haussa:", error);
        // Testidataa localhostia varten
        setKisat([
          { id: "kisa_01", nimi: "Kesäcup 1 — Skeet", pvm: "15.05.2026", tila: "Päättynyt", apiUrl: "URL1" },
          { id: "kisa_02", nimi: "Heinäkuun Compak", pvm: "12.07.2026", tila: "Käynnissä", apiUrl: "URL2" }
        ]);
      } finally {
        setLadataanKisalista(false);
      }
    }
    haeKisalista();
  }, []);

  // 2. KESKITETTY DATAHAKU: Haetaan valitun kisan tiedot vain kerran + taustapäivitys
  useEffect(() => {
    if (!valittuKisa) {
      setKisaData(null);
      return;
    }

    setLadataanKisaa(true);
    setVirhe(null);

    async function haeKisanKaikkiData() {
      try {
        const response = await fetch(valittuKisa.apiUrl);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setKisaData(data);
      } catch (err) {
        console.error("Virhe kisan datan haussa:", err);
        setVirhe("Yhteys Google Sheetsiin epäonnistui. Yritetään uudelleen taustalla...");
      } finally {
        setLadataanKisaa(false);
      }
    }

    // Ensimmäinen haku heti
    haeKisanKaikkiData();

    // Automaattinen taustapäivitys 30 sekunnin välein kisan ollessa auki
    const intervalli = setInterval(haeKisanKaikkiData, 30000);
    return () => clearInterval(intervalli);
  }, [valittuKisa]);

  if (ladataanKisalista) {
    return <div style={{ fontFamily: teema.fontti, padding: '20px' }}>Ladataan tulospalvelua...</div>;
  }

  // NÄKYMÄ 1: ETUSIVU (Kisalista)
  if (!valittuKisa) {
    return (
      <div style={tyylit.KokoSivu}>
        <header style={tyylit.Ylapalkki}>
          <h1 style={tyylit.KisanOtsikko}>🎯 TT TULOSPALVELU</h1>
        </header>

        <h3 style={{ fontFamily: teema.fontti }}>Valitse kilpailu:</h3>
        <div style={tyylit.KisaListaRuudukko}>
          {kisat.map(kisa => (
            <div
              key={kisa.id}
              onClick={() => setValittuKisa(kisa)}
              style={kisa.tila === 'Käynnissä' ? tyylit.KisaKorttiLive : tyylit.KisaKortti}
            >
              <div style={tyylit.KisaPvm}>{kisa.pvm} {kisa.tila === 'Käynnissä' && "🔴 LIVE"}</div>
              <div style={tyylit.KisaNimiLinkki}>{kisa.nimi}</div>
              <div style={tyylit.KisaTila}>{kisa.tila}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // NÄKYMÄ 2: VALITTU KISA (Ohjausnäkymä)
  // POISTETAAN se ehto, joka esti sivun näyttämisen jos kisaData oli null!
  return (
    <div style={tyylit.KokoSivu}>
      <header style={tyylit.Ylapalkki}>
        <button onClick={() => setValittuKisa(null)} style={tyylit.TakaisinNappi}>⬅️ ETUSIVU</button>
        <h1 style={tyylit.KisanOtsikko}>
          {valittuKisa.nimi} {ladataanKisaa && "🔄"} {/* Pieni indikaattori yläkulmaan */}
        </h1>
        {virhe && <div style={tyylit.VirheIlmoitus}>{virhe}</div>}
      </header>

      <nav style={tyylit.NaviPalkki}>
        <button onClick={() => setAktiivinenSivu('erakirjaus')} style={aktiivinenSivu === 'erakirjaus' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>⚙️ ERÄHALLINTA</button>
        <button onClick={() => setAktiivinenSivu('joukkueet')} style={aktiivinenSivu === 'joukkueet' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>🏆 JOUKKUETULOKSET</button>
      </nav>

      <main style={tyylit.SisaltoAlue}>
        <div style={{ display: aktiivinenSivu === 'erakirjaus' ? 'block' : 'none' }}>
          <RyhmaJako data={kisaData} />
        </div>
        <div style={{ display: aktiivinenSivu === 'joukkueet' ? 'block' : 'none' }}>
          <JoukkueTulokset data={kisaData} />
        </div>
      </main>
    </div>
  );
}

const tyylit = {
  KokoSivu: { padding: '15px', fontFamily: teema.fontti, background: '#fff', color: teema.tekstiTumma, minHeight: '100vh' },
  Ylapalkki: { borderBottom: `3px solid ${teema.paavari}`, paddingBottom: '10px', marginBottom: '15px' },
  KisanOtsikko: { margin: 0, fontSize: '1.4em', fontWeight: 'bold', textTransform: 'uppercase' },
  KisaListaRuudukko: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' },
  KisaKortti: { border: `1px solid ${teema.tekstiTumma}`, padding: '10px', cursor: 'pointer', background: teema.taustaHarmaa },
  KisaKorttiLive: { border: '2px solid #ff0000', padding: '10px', cursor: 'pointer', background: '#fff9f9' },
  KisaPvm: { fontSize: '0.8em', color: '#666', fontWeight: 'bold' },
  KisaNimiLinkki: { fontSize: '1.1em', fontWeight: 'bold', margin: '4px 0', textDecoration: 'underline' },
  KisaTila: { fontSize: '0.8em', textTransform: 'uppercase' },
  TakaisinNappi: { background: teema.paavari, color: teema.tekstiVaalea, border: 'none', padding: '5px 10px', cursor: 'pointer', marginBottom: '10px', fontWeight: 'bold' },
  NaviPalkki: { display: 'flex', gap: '5px', marginBottom: '20px' },
  NaviNappi: { background: '#fff', color: teema.tekstiTumma, border: `1px solid ${teema.tekstiTumma}`, padding: '8px 12px', cursor: 'pointer', fontWeight: 'bold' },
  NaviNappiAktiivinen: { background: teema.paavari, color: teema.tekstiVaalea, border: `1px solid ${teema.paavari}`, padding: '8px 12px', cursor: 'pointer', fontWeight: 'bold' },
  VirheIlmoitus: { color: '#cc0000', fontSize: '0.85em', marginTop: '5px' },
  SisaltoAlue: { marginTop: '10px' }
};