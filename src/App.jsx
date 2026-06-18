// src/App.jsx
import React, { useState, useEffect } from 'react';
import HenkiloTulokset from './HenkiloTulokset';
import JoukkueTulokset from './JoukkueTulokset';
import RyhmaJako from './RyhmaJako';
import Ilmoittautuneet from './Ilmoittautuneet'; 
import { teema } from './teema';
import { hasCsvDataRows, parseCsvRows } from './utils/csv';

const REKISTERI_SHEET_ID = "1P1Zd-oPY_d3kmvdllG5rBdG6_ISjkW-ZkQVvSierEGA";

export default function App() {
  const [kisat, setKisat] = useState([]);
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('tulokset');
  const [ladataanKisalista, setLadataanKisalista] = useState(true);

  const [kisaCache, setKisaCache] = useState({}); 
  const [ladataanKisaa, setLadataanKisaa] = useState(false);
  const [virhe, setVirhe] = useState(null);

  const avaaKisaNakyma = (kisa) => {
    setAktiivinenSivu('tulokset');
    setValittuKisa(kisa);
    window.history.pushState(
      { view: 'competition', competitionId: kisa.id },
      '',
      `${window.location.pathname}${window.location.search}#kisa-${kisa.id}`
    );
  };

  const palaaEtusivulle = () => {
    if (window.history.state?.view === 'competition') {
      window.history.back();
      return;
    }

    setValittuKisa(null);
    setAktiivinenSivu('tulokset');
    window.history.replaceState({ view: 'home' }, '', `${window.location.pathname}${window.location.search}`);
  };

  const parsiPaivamaara = (pvmStr) => {
    if (!pvmStr) return null;
    const osat = pvmStr.split('.');
    if (osat.length !== 3) return null;

    const paiva = parseInt(osat[0], 10);
    const kuukausi = parseInt(osat[1], 10);
    const vuosi = parseInt(osat[2], 10);

    if (
      !Number.isInteger(paiva) ||
      !Number.isInteger(kuukausi) ||
      !Number.isInteger(vuosi) ||
      kuukausi < 1 ||
      kuukausi > 12 ||
      paiva < 1 ||
      paiva > 31
    ) {
      return null;
    }

    const date = new Date(vuosi, kuukausi - 1, paiva);
    if (
      date.getFullYear() !== vuosi ||
      date.getMonth() !== kuukausi - 1 ||
      date.getDate() !== paiva
    ) {
      return null;
    }

    return date;
  };

  const muotoileIsoPaivamaaraSuomeksi = (pvmStr) => {
    if (!pvmStr || !pvmStr.includes('-')) return pvmStr;
    const osat = pvmStr.split('-');
    if (osat.length !== 3) return pvmStr;
    return `${parseInt(osat[2], 10)}.${parseInt(osat[1], 10)}.${osat[0]}`;
  };

  // Tutkii onko nykyhetki ylittänyt kisan aloituspäivän klo 10:00 rajapyykin
  const laskeOnkoIlmoittautuminenPaattynyt = (alkuStr) => {
    if (!alkuStr) return true;
    const aloitusPaiva = parsiPaivamaara(alkuStr);
    if (!aloitusPaiva) return true;

    // Asetetaan takarajaksi aloituspäivä klo 10:00:00
    const takaraja = new Date(aloitusPaiva.getTime());
    takaraja.setHours(10, 0, 0, 0);

    const nykyhetki = new Date();
    return nykyhetki >= takaraja;
  };

  // 1. HAETAAN KILPAILUREKISTERI
  useEffect(() => {
    async function haeKisalistaCsv() {
      try {
        setLadataanKisalista(true);
        setVirhe(null);
        
        const url = `https://docs.google.com/spreadsheets/d/${REKISTERI_SHEET_ID}/gviz/tq?tqx=out:csv`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Kilpailurekisterin haku epäonnistui: ${response.status}`);
        }
        const csvText = await response.text();

        const raakaRivit = parseCsvRows(csvText);
        const parsitutKisat = [];

        for (let i = 0; i < raakaRivit.length; i++) {
          const row = raakaRivit[i];
          
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
        setLadataanKisalista(false);
      }
    }
    
    haeKisalistaCsv();
  }, []);

  useEffect(() => {
    if (!window.history.state?.view) {
      window.history.replaceState({ view: 'home' }, '', `${window.location.pathname}${window.location.search}`);
    }

    const kasitteleSelaimenTakaisin = () => {
      setValittuKisa(null);
      setAktiivinenSivu('tulokset');
    };

    window.addEventListener('popstate', kasitteleSelaimenTakaisin);
    return () => window.removeEventListener('popstate', kasitteleSelaimenTakaisin);
  }, []);

  // 2. REAALIAIKAINEN LIVE-DATAHAKU VALITULLE KISALLE
  useEffect(() => {
    if (!valittuKisa || !valittuKisa.apiUrl) return;

    const sheetId = valittuKisa.apiUrl; 

    if (!kisaCache[sheetId]) {
      setLadataanKisaa(true);
    }
    setVirhe(null);

    const haeCsv = async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return "";
        return await response.text();
      } catch {
        return "";
      }
    };

    async function haeSuoratCsvData() {
      try {
        const urlTuloksetY = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Tulokset Y')}`;
        const urlTuloksetYleinen = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Tulokset')}`;
        
        const urlJoukkueet = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('NEW_Joukkue')}`;
        const urlErat = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Ryhmäjako')}`;
        const urlIlmoittautuneet = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Ilmoittautuneet')}`;

        const [resTuloksetY, resTuloksetYleinen, resJoukkueet, resErat, resIlmoittautuneet] = await Promise.all([
          haeCsv(urlTuloksetY),
          haeCsv(urlTuloksetYleinen),
          haeCsv(urlJoukkueet),
          haeCsv(urlErat),
          haeCsv(urlIlmoittautuneet)
        ]);

        const onkoTuloksetYDataa = hasCsvDataRows(resTuloksetY, 2);
        const onkoTuloksetYleinenDataa = hasCsvDataRows(resTuloksetYleinen, 2);
        const parhainHenkiloData = onkoTuloksetYDataa
          ? resTuloksetY
          : onkoTuloksetYleinenDataa
            ? resTuloksetYleinen
            : "";

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
    const kasitteleNakymattomyys = () => {
      if (!document.hidden) {
        haeSuoratCsvData();
      }
    };

    const intervalli = setInterval(() => {
      if (!document.hidden) {
        haeSuoratCsvData();
      }
    }, 20000);

    document.addEventListener('visibilitychange', kasitteleNakymattomyys);
    return () => {
      clearInterval(intervalli);
      document.removeEventListener('visibilitychange', kasitteleNakymattomyys);
    };
  }, [valittuKisa]);

  const muotoileKisaPaivatTekstiksi = (alku, loppu) => {
    if (!alku) return 'Päivämäärä ei tiedossa';
    if (!loppu || alku === loppu) return `📅 ${alku}`;
    return `📅 ${alku} – ${loppu}`;
  };

  const laskeKisanStatusJaTyyli = (alkuStr, loppuStr) => {
    if (!alkuStr) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };

    const nollatunnit = (d) => { d.setHours(0,0,0,0); return d; };

    const tanaandDate = nollatunnit(new Date());
    const alkuDate = parsiPaivamaara(alkuStr);
    const loppuDate = loppuStr ? parsiPaivamaara(loppuStr) : alkuDate;

    if (!alkuDate || !loppuDate) {
      return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
    }

    if (tanaandDate < alkuDate) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
    if (tanaandDate > loppuDate) return { teksti: "Päättynyt", tyyli: { background: '#f1f3f4', color: '#3c4043' }, status: 'paattynyt' };
    return { teksti: "Käynnissä", tyyli: { background: '#e6f4ea', color: '#137333' }, status: 'kaynnissa' };
  };

  if (ladataanKisalista) {
    return <div style={tyylit.LatausKeskitys}>Ladataan kilpailurekisteriä...</div>;
  }

  // --- NÄKYMÄ 1: ETUSIVU ---
  if (!valittuKisa) {
    return (
      <div style={tyylit.KokoSivu}>
        <header style={tyylit.EtusivunOtsikkoAlue}>
          <h1 style={tyylit.EtusivunOtsikko}>🎯 TT Tulospalvelu</h1>
          <p style={tyylit.EtusivunAliotsikko}>Tämänkin voi tehdä helpommin</p>
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
                  avaaKisaNakyma(kisa);
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

  // --- NÄKYMÄ 2: VALITUN KISAN NÄKYMÄ ---
  const nykyisenKisanData = kisaCache[valittuKisa.apiUrl];
  const kisanStatusInfo = laskeKisanStatusJaTyyli(valittuKisa.alkuPvm, valittuKisa.loppuPvm);
  
  const onkoKisaTulossa = kisanStatusInfo.status === 'tulossa';
  const onkoKisaPaattynyt = kisanStatusInfo.status === 'paattynyt';
  const onkoIlmoittautuminenAikaIkkunaOhi = laskeOnkoIlmoittautuminenPaattynyt(valittuKisa.alkuPvm);

  // SÄÄNNÖT ERI SIVUJEN NÄKYVYYDELLE
  const onkoTuloksetSallittu = !onkoKisaTulossa; 
  const onkoIlmoittautuneita = !onkoIlmoittautuminenAikaIkkunaOhi && nykyisenKisanData?.ilmoittautuneetCsvRaw?.trim().length > 10;
  const onkoEraluetteloa = !onkoKisaPaattynyt;
  const onkoJoukkueKisa = !onkoKisaTulossa && hasCsvDataRows(nykyisenKisanData?.joukkueetCsvRaw, 2);

  // Estetään käyttäjää jäämästä loukkuun piilotetulle välilehdelle
  if (onkoKisaTulossa && aktiivinenSivu !== 'ilmoittautuneet' && aktiivinenSivu !== 'erakirjaus') {
    setAktiivinenSivu(onkoIlmoittautuneita ? 'ilmoittautuneet' : 'erakirjaus');
  } else if (!onkoIlmoittautuneita && aktiivinenSivu === 'ilmoittautuneet') {
    setAktiivinenSivu(onkoTuloksetSallittu ? 'tulokset' : 'erakirjaus');
  } else if (onkoKisaPaattynyt && aktiivinenSivu !== 'tulokset' && aktiivinenSivu !== 'joukkueet') {
    setAktiivinenSivu('tulokset');
  }

  return (
    <div style={tyylit.KokoSivu}>
      <header style={tyylit.Ylapalkki}>
        <button onClick={palaaEtusivulle} style={tyylit.TakaisinNappi}>⬅️ ETUSIVU</button>
        <h1 style={tyylit.KisanOtsikko}>
          {valittuKisa.nimi} {ladataanKisaa && "🔄"}
        </h1>
        <div style={tyylit.UusiKisaPvm}>
          {muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
        </div>
        {virhe && <div style={tyylit.VirheIlmoitus}>{virhe}</div>}
      </header>

      <nav style={tyylit.NaviPalkki}>
        {onkoTuloksetSallittu && (
          <button onClick={() => setAktiivinenSivu('tulokset')} style={aktiivinenSivu === 'tulokset' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>🏆 TULOKSET</button>
        )}
        
        {onkoIlmoittautuneita && (
          <button onClick={() => setAktiivinenSivu('ilmoittautuneet')} style={aktiivinenSivu === 'ilmoittautuneet' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>📝 ILMOITTAUTUNEET</button>
        )}
        
        {onkoEraluetteloa && (
          <button onClick={() => setAktiivinenSivu('erakirjaus')} style={aktiivinenSivu === 'erakirjaus' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>⚙️ ERÄLUETTELO</button>
        )}
        
        {onkoJoukkueKisa && (
          <button onClick={() => setAktiivinenSivu('joukkueet')} style={aktiivinenSivu === 'joukkueet' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>👥 JOUKKUETULOKSET</button>
        )}
      </nav>

      {ladataanKisaa && !nykyisenKisanData ? (
        <div style={{ fontFamily: 'sans-serif', padding: '10px' }}>Haetaan tietoja...</div>
      ) : (
        <main style={tyylit.SisaltoAlue}>
          {aktiivinenSivu === 'tulokset' && onkoTuloksetSallittu && nykyisenKisanData && (
            <HenkiloTulokset rawCsv={nykyisenKisanData.henkilotCsvRaw} />
          )}
          {aktiivinenSivu === 'ilmoittautuneet' && onkoIlmoittautuneita && (
            <Ilmoittautuneet rawCsv={nykyisenKisanData.ilmoittautuneetCsvRaw} />
          )}
          {aktiivinenSivu === 'erakirjaus' && onkoEraluetteloa && (
            <div style={{ display: 'block' }}>
              <RyhmaJako data={nykyisenKisanData} />
            </div>
          )}
          {aktiivinenSivu === 'joukkueet' && onkoJoukkueKisa && (
            <div style={{ display: 'block' }}>
              <JoukkueTulokset data={nykyisenKisanData} />
            </div>
          )}
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
