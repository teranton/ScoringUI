// src/App.jsx
import React, { useState, useEffect } from 'react';
import HenkiloTulokset from './HenkiloTulokset';
import JoukkueTulokset from './JoukkueTulokset';
import RyhmaJako from './RyhmaJako';
import Ilmoittautuneet from './Ilmoittautuneet'; 
import { teema } from './teema';

const REKISTERI_SHEET_ID = "1P1Zd-oPY_d3kmvdllG5rBdG6_ISjkW-ZkQVvSierEGA";

export default function App() {
  const [kisat, setKisat] = useState([]);
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('tulokset');
  const [ladataanKisalista, setLadataanKisalista] = useState(true);

  const [kisaCache, setKisaCache] = useState({}); 
  const [ladataanKisaa, setLadataanKisaa] = useState(false);
  const [virhe, setVirhe] = useState(null);

  // Muuttaa "2025-08-31" muotoon "31.8.2025"
  const muotoileIsoPaivamaaraSuomeksi = (pvmStr) => {
    if (!pvmStr || !pvmStr.includes('-')) return pvmStr;
    const osat = pvmStr.split('-');
    if (osat.length !== 3) return pvmStr;
    return `${parseInt(osat[2], 10)}.${parseInt(osat[1], 10)}.${osat[0]}`;
  };

  // 1. HAETAAN KILPAILUREKISTERI JA JÄRJESTETÄÄN VANHIMMASTA UUSIMPAAN
  useEffect(() => {
    async function haeKisalistaCsv() {
      try {
        setLadataanKisalista(true);
        setVirhe(null);
        
        const url = `https://docs.google.com/spreadsheets/d/${REKISTERI_SHEET_ID}/gviz/tq?tqx=out:csv`;
        const response = await fetch(url);
        const csvText = await response.text();

        const raakaRivit = csvText.split(/\r?\n/).filter(r => r.trim() !== "");
        const siivoaSolu = (solu) => (!solu ? "" : solu.replace(/^"|"$/g, '').trim());
        const parsitutKisat = [];

        for (let i = 0; i < raakaRivit.length; i++) {
          const riviTeksti = raakaRivit[i];
          const row = riviTeksti.split(',').map(siivoaSolu);
          
          if (i === 0 && (row[1]?.toLowerCase().includes('nimi') || row[0]?.toLowerCase().includes('id'))) {
            continue;
          }

          if (row[1] || row[0]) {
            parsitutKisat.push({
              id: row[0] || i.toString(),
              nimi: row[1] || "Nimetön kisa",
              alkuPvm: muotoileIsoPaivamaaraSuomeksi(row[2]),
              loppuPvm: muotoileIsoPaivamaaraSuomeksi(row[3]),
              apiUrl: row[4] || ""
            });
          }
        }

        // KRONOLOGINEN JÄRJESTYS
        parsitutKisat.sort((a, b) => {
          const kaannaDate = (pvmStr) => {
            if (!pvmStr) return '9999-12-31';
            const osat = pvmStr.split('.');
            return `${osat[2]}-${osat[1].padStart(2, '0')}-${osat[0].padStart(2, '0')}`;
          };
          return kaannaDate(b.alkuPvm).localeCompare(kaannaDate(a.alkuPvm));
        });

        setKisat(parsitutKisat);
      } catch (error) {
        console.error("Virhe kilpailurekisterin haussa:", error);
        setVirhe("Kilpailurekisterin lataus epäonnistui.");
      } finally {
        setLadataanKisalista(false); // ✅ KORJATTU TÄMÄ RIVI (lisätty sulut)
      }
    }
    
    haeKisalistaCsv();
  }, []);

  // 2. REAALIAIKAINEN LIVE-DATAHAKU VALITULLE KISALLE
// 2. REAALIAIKAINEN LIVE-DATAHAKU VALITULLE KISALLE
  useEffect(() => {
    if (!valittuKisa || !valittuKisa.apiUrl) return;

    const sheetId = valittuKisa.apiUrl; 

    if (!kisaCache[sheetId]) {
      setLadataanKisaa(true);
    }
    setVirhe(null);

    async function haeSuoratCsvData() {
      try {
        // Haetaan kaksi yleisintä variaatiota henkilökohtaisille tuloksille
        const urlTuloksetY = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Tulokset Y')}`;
        const urlTuloksetYleinen = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Tulokset')}`;
        
        // Muut tunnetut välilehdet
        const urlJoukkueet = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('NEW_Joukkue')}`;
        const urlErat = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Ryhmäjako')}`;
        const urlIlmoittautuneet = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Ilmoittautuneet')}`;

        const [resTuloksetY, resTuloksetYleinen, resJoukkueet, resErat, resIlmoittautuneet] = await Promise.all([
          fetch(urlTuloksetY).then(r => r.text()).catch(() => ""),
          fetch(urlTuloksetYleinen).then(r => r.text()).catch(() => ""),
          fetch(urlJoukkueet).then(r => r.text()).catch(() => ""),
          fetch(urlErat).then(r => r.text()).catch(() => ""),
          fetch(urlIlmoittautuneet).then(r => r.text()).catch(() => "")
        ]);

        // Valitaan se data, joka palautti oikeasti rivejä (otsikkorivin lisäksi)
        let parhainHenkiloData = resTuloksetY;
        if (!resTuloksetY || resTuloksetY.toLowerCase().includes("error") || resTuloksetY.trim().split('\n').length < 2) {
          parhainHenkiloData = resTuloksetYleinen;
        }

        setKisaCache(prevCache => ({
          ...prevCache,
          [sheetId]: {
            henkilotCsvRaw: parhainHenkiloData,
            joukkueetCsvRaw: resJoukkueet,
            eratCsvRaw: resErat,
            ilmoittautuneetCsvRaw: resIlmoittautuneet
          }
        }));

      } catch (err) {
        console.error("Datan haku epäonnistui:", err);
        setVirhe("Tietojen haku epäonnistui. Tarkista kisasheetin asetukset.");
      } finally {
        setLadataanKisaa(false);
      }
    }

    haeSuoratCsvData();
    const intervalli = setInterval(haeSuoratCsvData, 20000); 
    return () => clearInterval(intervalli);
  }, [valittuKisa]);

  const muotoileKisaPaivatTekstiksi = (alku, loppu) => {
    if (!alku) return 'Päivämäärä ei tiedossa';
    if (!loppu || alku === loppu) return `💿 ${alku}`;
    return `💿 ${alku} – ${loppu}`;
  };

  const laskeKisanStatusJaTyyli = (alkuStr, loppuStr) => {
    if (!alkuStr) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' } };
    const parsiPaivamaara = (pvmStr) => {
      const osat = pvmStr.split('.');
      return new Date(parseInt(osat[2]), parseInt(osat[1]) - 1, parseInt(osat[0]));
    };
    const nollatunnit = (d) => { d.setHours(0,0,0,0); return d; };

    const tanaandDate = nollatunnit(new Date());
    const alkuDate = parsiPaivamaara(alkuStr);
    const loppuDate = loppuStr ? parsiPaivamaara(loppuStr) : alkuDate;

    if (tanaandDate < alkuDate) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' } };
    if (tanaandDate > loppuDate) return { teksti: "Päättynyt", tyyli: { background: '#f1f3f4', color: '#3c4043' } };
    return { teksti: "Käynnissä", tyyli: { background: '#e6f4ea', color: '#137333' } };
  };

  if (ladataanKisalista) {
    return <div style={tyylit.LatausKeskitys}>Ladataan kilpailurekisteriä...</div>;
  }

  // --- NÄKYMÄ 1: ETUSIVU ---
  if (!valittuKisa) {
    return (
      <div style={tyylit.KokoSivu}>
        <header style={tyylit.EtusivunOtsikkoAlue}>
          {/* ✅ TIKKATAULU VAIHDETTU RIKKINÄISEEN SAVIKIEKKOON JA TEKSTI PÄIVITETTY */}
          <h1 style={tyylit.EtusivunOtsikko}>💥🎯 TT Tulospalvelu</h1>
          <p style={tyylit.EtusivunAliotsikko}>Reaaliaikainen tulospalvelu ja eräluettelot</p>
        </header>
        
        {virhe && <div style={tyylit.VirheIlmoitus}>{virhe}</div>}
        
        <div style={tyylit.KisaListaRuudukko}>
          {kisat.map(kisa => {
            const statusData = laskeKisanStatusJaTyyli(kisa.alkuPvm, kisa.loppuPvm);
            return (
              <div 
                key={kisa.id} 
                onClick={() => {
                  if (!kisa.apiUrl) return;
                  setAktiivinenSivu('tulokset');
                  setValittuKisa(kisa);
                }} 
                style={tyylit.UusiKisaKortti}
              >
                <div style={tyylit.KorttiVasenLohko}>
                  <div style={tyylit.UusiKisaNimi}>{kisa.nimi}</div>
                  <div style={tyylit.UusiKisaPvm}>
                    {muotoileKisaPaivatTekstiksi(kisa.alkuPvm, kisa.loppuPvm)}
                  </div>
                </div>
                <span style={{ ...tyylit.UusiStatusTag, ...statusData.tyyli }}>
                  {statusData.teksti}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- NÄKYMÄ 2: VALITUN KISAN TULOKSET ---
  const nykyisenKisanData = kisaCache[valittuKisa.apiUrl];
  const onkoIlmoittautuneita = nykyisenKisanData?.ilmoittautuneetCsvRaw?.trim().length > 10;
  const onkoJoukkueKisa = nykyisenKisanData?.joukkueetCsvRaw?.trim().split('\n').length > 2;

  return (
    <div style={tyylit.KokoSivu}>
      <header style={tyylit.Ylapalkki}>
        <button onClick={() => setValittuKisa(null)} style={tyylit.TakaisinNappi}>⬅️ ETUSIVU</button>
        <h1 style={tyylit.KisanOtsikko}>
          {valittuKisa.nimi} {ladataanKisaa && "🔄"}
        </h1>
        <div style={tyylit.UusiKisaPvm}>
          {muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
        </div>
        {virhe && <div style={tyylit.VirheIlmoitus}>{virhe}</div>}
      </header>

      <nav style={tyylit.NaviPalkki}>
        <button onClick={() => setAktiivinenSivu('tulokset')} style={aktiivinenSivu === 'tulokset' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>🏆 TULOKSET</button>
        {onkoIlmoittautuneita && (
          <button onClick={() => setAktiivinenSivu('ilmoittautuneet')} style={aktiivinenSivu === 'ilmoittautuneet' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>📝 ILMOITTAUTUNEET</button>
        )}
        <button onClick={() => setAktiivinenSivu('erakirjaus')} style={aktiivinenSivu === 'erakirjaus' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>⚙️ ERÄLUETTELO</button>
        {onkoJoukkueKisa && (
          <button onClick={() => setAktiivinenSivu('joukkueet')} style={aktiivinenSivu === 'joukkueet' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>👥 JOUKKUETULOKSET</button>
        )}
      </nav>

      {ladataanKisaa && !nykyisenKisanData ? (
        <div style={{ fontFamily: 'sans-serif', padding: '10px' }}>Haetaan tuloksia...</div>
      ) : (
        <main style={tyylit.SisaltoAlue}>
          {aktiivinenSivu === 'tulokset' && nykyisenKisanData && (
            <HenkiloTulokset rawCsv={nykyisenKisanData.henkilotCsvRaw} />
          )}
          {aktiivinenSivu === 'ilmoittautuneet' && onkoIlmoittautuneita && (
            <Ilmoittautuneet rawCsv={nykyisenKisanData.ilmoittautuneetCsvRaw} />
          )}
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

const tyylit = {
  KokoSivu: { padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f8f9fa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  LatausKeskitys: { padding: '50px', fontFamily: 'sans-serif', color: '#5f6368', textAlign: 'center' },
  EtusivunOtsikkoAlue: { width: '100%', maxWidth: '560px', marginBottom: '24px' },
  EtusivunOtsikko: { fontSize: '1.8em', fontWeight: '800', color: '#1a1f2c', margin: 0 },
  EtusivunAliotsikko: { fontSize: '0.95em', color: '#5f6368', margin: '6px 0 0 0' },
  KisaListaRuudukko: { display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '560px' },
  UusiKisaKortti: { background: '#ffffff', padding: '16px 18px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f1f3f4' },
  KorttiVasenLohko: { display: 'flex', flexDirection: 'column', gap: '6px' },
  UusiKisaNimi: { fontSize: '1.15em', fontWeight: '600', color: '#1a1f2c' },
  UusiKisaPvm: { fontSize: '0.85em', color: '#70757a', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' },
  UusiStatusTag: { padding: '5px 10px', borderRadius: '20px', fontSize: '0.75em', fontWeight: '600', textTransform: 'uppercase' },
  Ylapalkki: { width: '100%', maxWidth: '560px', borderBottom: `2px solid ${teema.paavari || '#1a4a75'}`, paddingBottom: '16px', marginBottom: '10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' },
  KisanOtsikko: { margin: 0, fontSize: '1.5em', fontWeight: '700', color: '#111827' },
  NaviPalkki: { display: 'flex', gap: '8px', width: '100%', maxWidth: '560px', marginBottom: '15px', flexWrap: 'wrap' },
  NaviNappi: { background: '#fff', color: '#3c4043', border: '1px solid #dadce0', padding: '8px 14px', cursor: 'pointer', fontWeight: '600', borderRadius: '6px', fontSize: '0.85em' },
  NaviNappiAktiivinen: { background: teema.paavari || '#1a4a75', color: '#fff', border: `1px solid ${teema.paavari || '#1a4a75'}`, padding: '8px 14px', cursor: 'pointer', fontWeight: '600', borderRadius: '6px', fontSize: '0.85em' },
  TakaisinNappi: { background: '#fff', color: '#3c4043', border: '1px solid #dadce0', padding: '6px 12px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85em', borderRadius: '6px' },
  SisaltoAlue: { width: '100%', maxWidth: '560px', flex: 1 },
  VirheIlmoitus: { color: '#d93025', fontSize: '0.85em', marginTop: '5px', fontWeight: '500' }
};
