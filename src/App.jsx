// src/App.jsx
import React, { useState, useEffect } from 'react';
import JoukkueTulokset from './JoukkueTulokset';
import RyhmaJako from './RyhmaJako';
import { teema } from './teema';

const MESTARI_API_URL = "https://script.google.com/macros/s/AKfycbyjyGDXxaIxj0RYxGc6JnYte9hck1N3I-M-Ql2t_AFhVAOO-dc8R3p4UhxMnJz-rspu/exec"; // Pidetään kisalista vielä Apps Scriptissä, se on kevyt

export default function App() {
  const [kisat, setKisat] = useState([]);
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('joukkueet');
  const [ladataanKisalista, setLadataanKisalista] = useState(true);

  const [kisaCache, setKisaCache] = useState({});
  const [ladataanKisaa, setLadataanKisaa] = useState(false);
  const [virhe, setVirhe] = useState(null);

  // 1. Haetaan yleinen kisalista etusivulle
  useEffect(() => {
    async function haeKisalista() {
      try {
        const response = await fetch(MESTARI_API_URL);
        const data = await response.json();
        setKisat(data);
      } catch (error) {
        console.error("Virhe kisalistan haussa:", error);
      } finally {
        setLadataanKisalista(false);
      }
    }
    haeKisalista();
  }, []);

  // 2. SUORA REUNATON CSV-HAKU GOOGLESTA (Ei endpointia!)
  useEffect(() => {
    if (!valittuKisa) return;

    // Oletetaan, että Mestari-Sheetissä "apiUrl"-sarakkeessa on nyt kisan GOOGLE_SHEETS_ID
    const sheetId = valittuKisa.apiUrl; 

    if (!kisaCache[sheetId]) {
      setLadataanKisaa(true);
    }
    setVirhe(null);

    async function haeSuoratCsvData() {
      try {
        // Rakennetaan suorat Google Visualization URL-osoitteet molemmille välilehdille
        // Käytetään tq-rajapintaa, joka palauttaa puhtaan CSV:n
        const urlJoukkueet = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=NEW_Joukkue`;
        const urlErat = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Ryhmäjako`;

        // Haetaan molemmat taustalla täysin rinnakkain (Supernopea!)
        const [resJoukkueet, resErat] = await Promise.all([
          fetch(urlJoukkueet).then(r => r.text()),
          fetch(urlErat).then(r => r.text()).catch(() => "") // Jos erävälilehteä ei ole, ei kaaduta
        ]);

        // Muutetaan Googlen palauttamat standardi-CSV-lainausmerkit ja pilkut meidän parserille sopivaksi,
        // TAI mukautetaan parseri lukemaan standardia CSV-muotoa (kts. Vaihe 3 alta)
        const valmisDataOlio = {
          joukkueetCsvRaw: resJoukkueet,
          eratCsvRaw: resErat
        };

        setKisaCache(prevCache => ({
          ...prevCache,
          [sheetId]: valmisDataOlio
        }));

      } catch (err) {
        console.error("Suora CSV haku epäonnistui:", err);
        setVirhe("Tietojen haku epäonnistui. Varmista, että Sheets on jaettu 'Anyone with link' -oikeudella.");
      } finally {
        setLadataanKisaa(false);
      }
    }

    haeSuoratCsvData();
    const intervalli = setInterval(haeSuoratCsvData, 20000); // Voidaan tihentää jopa 20 sekuntiin, koska se on niin nopeaa
    return () => clearInterval(intervalli);
  }, [valittuKisa]);

  if (ladataanKisalista) return <div style={{ fontFamily: teema.fontti, padding: '20px' }}>Ladataan...</div>;

  if (!valittuKisa) {
    return (
      <div style={tyylit.KokoSivu}>
        <header style={tyylit.Ylapalkki}><h1 style={tyylit.KisanOtsikko}>🎯 TULOSPALVELU</h1></header>
        <div style={tyylit.KisaListaRuudukko}>
          {kisat.map(kisa => (
            <div key={kisa.id} onClick={() => setValittuKisa(kisa)} style={tyylit.KisaKortti}>
              <div style={tyylit.KisaNimiLinkki}>{kisa.nimi}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const nykyisenKisanData = kisaCache[valittuKisa.apiUrl];

  return (
    <div style={tyylit.KokoSivu}>
      <header style={tyylit.Ylapalkki}>
        <button onClick={() => setValittuKisa(null)} style={tyylit.TakaisinNappi}>⬅️ ETUSIVU</button>
        <h1 style={tyylit.KisanOtsikko}>{valittuKisa.nimi} {ladataanKisaa && "🔄"}</h1>
        {virhe && <div style={tyylit.VirheIlmoitus}>{virhe}</div>}
      </header>

      <nav style={tyylit.NaviPalkki}>
        <button onClick={() => setAktiivinenSivu('erakirjaus')} style={aktiivinenSivu === 'erakirjaus' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>⚙️ ERÄHALLINTA</button>
        <button onClick={() => setAktiivinenSivu('joukkueet')} style={aktiivinenSivu === 'joukkueet' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>🏆 JOUKKUETULOKSET</button>
      </nav>

      {ladataanKisaa && !nykyisenKisanData ? (
        <div style={{ fontFamily: teema.fontti }}>Haetaan reaaliaikaista CSV-dataa suoraan Googlesta...</div>
      ) : (
        <main style={tyylit.SisaltoAlue}>
          <div style={{ display: aktiivinenSivu === 'erakirjaus' ? 'block' : 'none' }}>
            <RyhmaJako data={nykyisenKisanData} />
          </div>
          <div style={{ display: aktiivinenSivu === 'joukkueet' ? 'block' : 'none' }}>
            <JoukkueTulokset data={nykyisenKisanData} />
          </div>
        </main>
      )}
    </div>
  );
}

// (Tyylit pysyvät samana kuin aiemmin...)
const tyylit = {
  KokoSivu: { 
    padding: '15px', 
    fontFamily: teema.fontti, 
    background: '#fff', 
    color: teema.tekstiTumma, 
    minHeight: '100vh',
    display: 'flex',          // Muutetaan koko sivu flex-laatikoksi
    flexDirection: 'column',  // Elementit pinotaan allekkain
    gap: '10px'               // Automaattinen väli elementtien väliin
  },
  Ylapalkki: { 
    borderBottom: `3px solid ${teema.paavari}`, 
    paddingBottom: '12px', 
    marginBottom: '5px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '5px'
  },
  KisanOtsikko: { 
    margin: 0, 
    fontSize: '1.4em', 
    fontWeight: 'bold', 
    textTransform: 'uppercase',
    lineHeight: '1.2'        // Varmistetaan ettei riviväli riko asettelua
  },
  NaviPalkki: { 
    display: 'flex', 
    gap: '8px', 
    marginTop: '5px',
    marginBottom: '15px',
    flexWrap: 'wrap'          // Jos napit eivät mahdu kännykän ruudulle, ne tippuvat nätisti seuraavalle riville
  },
  NaviNappi: { 
    background: '#fff', 
    color: teema.tekstiTumma, 
    border: `1px solid ${teema.tekstiTumma}`, 
    padding: '8px 14px', 
    cursor: 'pointer', 
    fontWeight: 'bold' 
  },
  NaviNappiAktiivinen: { 
    background: teema.paavari, 
    color: teema.tekstiVaalea, 
    border: `1px solid ${teema.paavari}`, 
    padding: '8px 14px', 
    cursor: 'pointer', 
    fontWeight: 'bold' 
  },
  TakaisinNappi: { 
    background: teema.paavari, 
    color: teema.tekstiVaalea, 
    border: 'none', 
    padding: '6px 12px', 
    cursor: 'pointer', 
    fontWeight: 'bold',
    fontSize: '0.9em'
  },
  SisaltoAlue: { 
    marginTop: '0px',
    flex: 1                   // Ottaa lopun tilan sivusta itselleen
  },
  VirheIlmoitus: { 
    color: '#cc0000', 
    fontSize: '0.85em', 
    marginTop: '5px' 
  },
  KisaListaRuudukko: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' },
  KisaKortti: { border: `1px solid ${teema.tekstiTumma}`, padding: '10px', cursor: 'pointer', background: teema.taustaHarmaa },
  KisaNimiLinkki: { fontSize: '1.1em', fontWeight: 'bold' }
};