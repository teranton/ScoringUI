// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import HenkiloTulokset from './HenkiloTulokset';
import HenkiloTaulukko from './HenkiloTaulukko';
import JoukkueTulokset from './JoukkueTulokset';
import RyhmaJako from './RyhmaJako';
import Ilmoittautuneet from './Ilmoittautuneet';
import { teema } from './teema';
import { hasCsvDataRows, parseCsvRows } from './utils/csv';

const REKISTERI_SHEET_ID = "1P1Zd-oPY_d3kmvdllG5rBdG6_ISjkW-ZkQVvSierEGA";

function parsiPaivamaara(pvmStr) {
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
}

function laskeOnkoIlmoittautuminenPaattynyt(alkuStr) {
  if (!alkuStr) return true;
  const aloitusPaiva = parsiPaivamaara(alkuStr);
  if (!aloitusPaiva) return true;

  const takaraja = new Date(aloitusPaiva.getTime());
  takaraja.setHours(10, 0, 0, 0);

  const nykyhetki = new Date();
  return nykyhetki >= takaraja;
}

function laskeKisanStatusJaTyyli(alkuStr, loppuStr) {
  if (!alkuStr) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };

  const nollatunnit = (d) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const tanaandDate = nollatunnit(new Date());
  const alkuDate = parsiPaivamaara(alkuStr);
  const loppuDate = loppuStr ? parsiPaivamaara(loppuStr) : alkuDate;

  if (!alkuDate || !loppuDate) {
    return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
  }

  if (tanaandDate < alkuDate) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
  if (tanaandDate > loppuDate) return { teksti: "Päättynyt", tyyli: { background: '#f1f3f4', color: '#3c4043' }, status: 'paattynyt' };
  return { teksti: "Käynnissä", tyyli: { background: '#e6f4ea', color: '#137333' }, status: 'kaynnissa' };
}

function normalisoiStatusArvo(arvo) {
  const norm = String(arvo || '').trim().toUpperCase();
  if (!norm) return null;

  if (['PÄÄTTYNYT', 'PAATTYNYT', 'FINISHED', 'CLOSED', 'LOPPUNUT'].includes(norm)) return 'paattynyt';
  if (['KÄYNNISSÄ', 'KAYNNISSA', 'ONGOING', 'RUNNING', 'LIVE'].includes(norm)) return 'kaynnissa';
  if (['TULOSSA', 'UPCOMING', 'PENDING'].includes(norm)) return 'tulossa';
  return null;
}

function haeStatusOverrideSpekseista(speksitCsv) {
  if (!speksitCsv || typeof speksitCsv !== 'string' || speksitCsv.trim().length < 2) return null;

  const rivit = parseCsvRows(speksitCsv);
  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  const avainSanat = new Set([
    'STATUS',
    'KISASTATUS',
    'KISA_STATUS',
    'KILPAILUNSTATUS',
    'KILPAILU_STATUS',
    'COMPETITIONSTATUS',
    'KISAPAATTYNYT',
    'KISA_PAATTYNYT',
    'KILPAILUPAATTYNYT',
    'KILPAILU_PAATTYNYT'
  ]);

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());
    const normalisoidut = solut.map((s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, ''));

    for (let i = 0; i < normalisoidut.length; i++) {
      const avain = normalisoidut[i];
      if (!avainSanat.has(avain)) continue;

      const ehdokasArvot = [
        solut[i + 1],
        solut[i + 2],
        solut[i],
        ...solut
      ].filter(Boolean);

      for (const ehdokas of ehdokasArvot) {
        const status = normalisoiStatusArvo(ehdokas);
        if (status) return status;

        const boolNorm = String(ehdokas).trim().toLowerCase();
        if (['1', 'true', 'yes', 'on', 'x'].includes(boolNorm) && avain.includes('PAATTYNYT')) {
          return 'paattynyt';
        }
      }
    }
  }

  return null;
}

function laskeKisanEfektiivinenStatus(alkuStr, loppuStr, speksitCsv) {
  const oletus = laskeKisanStatusJaTyyli(alkuStr, loppuStr);
  const override = haeStatusOverrideSpekseista(speksitCsv);
  if (!override) return oletus;

  if (override === 'paattynyt') {
    return { teksti: 'Päättynyt', tyyli: { background: '#f1f3f4', color: '#3c4043' }, status: 'paattynyt' };
  }
  if (override === 'kaynnissa') {
    return { teksti: 'Käynnissä', tyyli: { background: '#e6f4ea', color: '#137333' }, status: 'kaynnissa' };
  }
  return { teksti: 'Tulossa', tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
}

export default function App() {
  const [kisat, setKisat] = useState([]);
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('tulokset');
  const [ladataanKisalista, setLadataanKisalista] = useState(true);

  const [kisaCache, setKisaCache] = useState({});
  const [ladataanKisaa, setLadataanKisaa] = useState(false);
  const [virhe, setVirhe] = useState(null);
  const kisaCacheRef = useRef(kisaCache);

  useEffect(() => {
    kisaCacheRef.current = kisaCache;
  }, [kisaCache]);

  // TAULUKKO on kokeellinen: oletus päällä devissä, tuotannossa pois ellei erikseen aktivoida
  const taulukkoLippuEnv = String(import.meta.env.VITE_ENABLE_TAULUKKO ?? '').toLowerCase();
  const onkoTaulukkoKytkettyPaalle = taulukkoLippuEnv === '1' || taulukkoLippuEnv === 'true'
    ? true
    : taulukkoLippuEnv === '0' || taulukkoLippuEnv === 'false'
      ? false
      : Boolean(import.meta.env.DEV);

  const avaaKisaNakyma = (kisa) => {
    setAktiivinenSivu('tulokset');
    setValittuKisa(kisa);
    window.history.pushState(
      { view: 'competition', competitionId: kisa.id, directLink: false },
      '',
      `${window.location.pathname}${window.location.search}#kisa-${kisa.id}`
    );
  };

  const palaaEtusivulle = () => {
    if (window.history.state?.view === 'competition' && !window.history.state?.directLink) {
      window.history.back();
      return;
    }

    setValittuKisa(null);
    setAktiivinenSivu('tulokset');
    window.history.replaceState({ view: 'home' }, '', `${window.location.pathname}${window.location.search}`);
  };

  const muotoileIsoPaivamaaraSuomeksi = (pvmStr) => {
    if (!pvmStr || !pvmStr.includes('-')) return pvmStr;
    const osat = pvmStr.split('-');
    if (osat.length !== 3) return pvmStr;
    return `${parseInt(osat[2], 10)}.${parseInt(osat[1], 10)}.${osat[0]}`;
  };

  const tulkitseTotuusarvo = (arvo) => {
    if (arvo == null) return null;
    const normalisoitu = String(arvo).trim().toLowerCase();
    if (!normalisoitu) return null;

    if (['1', 'true', 'yes', 'on'].includes(normalisoitu)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalisoitu)) return false;
    return null;
  };

  const arvioiJoukkuekisaNimesta = (kisaNimi) => String(kisaNimi || '').includes('SM');

  // 1. HAETAAN KILPAILUREKISTERI
  useEffect(() => {
    async function haeKisalistaCsv() {
      try {
        setLadataanKisalista(true);
        setVirhe(null);

        const url = `/api/rekisteri`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Kilpailurekisterin haku epäonnistui: ${response.status}`);
        }
        const csvText = await response.text();

        //console.log("Reactiin saapunut raaka teksti:", csvText);

        const raakaRivit = parseCsvRows(csvText);

        //console.log("Parsitut raakarivit (taulukko):", raakaRivit);
        const parsitutKisat = [];

        for (let i = 0; i < raakaRivit.length; i++) {
          const row = raakaRivit[i];

          if (i === 0 && (row[1]?.toLowerCase().includes('nimi') || row[0]?.toLowerCase().includes('id'))) {
            continue;
          }

          if (row[1] || row[0]) {
            const joukkueKisaAsetus = tulkitseTotuusarvo(row[5]);
            parsitutKisat.push({
              id: row[0] || i.toString(),
              nimi: row[1] || "Nimetön kisa",
              alkuPvm: muotoileIsoPaivamaaraSuomeksi(row[2]),
              loppuPvm: muotoileIsoPaivamaaraSuomeksi(row[3]),
              apiUrl: row[4] || "",
              joukkueKisaAsetus
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
      const hash = window.location.hash || '';
      window.history.replaceState({ view: 'home' }, '', `${window.location.pathname}${window.location.search}${hash}`);
    }

    const kasitteleSelaimenTakaisin = () => {
      setValittuKisa(null);
      setAktiivinenSivu('tulokset');
    };

    window.addEventListener('popstate', kasitteleSelaimenTakaisin);
    return () => window.removeEventListener('popstate', kasitteleSelaimenTakaisin);
  }, []);

  // 1b. Tuetaan suoraa deep linkiä kilpailuun: /#kisa-{id}
  useEffect(() => {
    if (ladataanKisalista || kisat.length === 0 || valittuKisa) return;

    const hash = window.location.hash || '';
    if (!hash.startsWith('#kisa-')) return;

    const hashId = decodeURIComponent(hash.slice('#kisa-'.length));
    if (!hashId) return;

    const loydettyKisa = kisat.find((k) => String(k.id) === hashId);
    if (!loydettyKisa) return;

    setAktiivinenSivu('tulokset');
    setValittuKisa(loydettyKisa);

    if (window.history.state?.view !== 'competition' || window.history.state?.competitionId !== loydettyKisa.id) {
      window.history.replaceState(
        { view: 'competition', competitionId: loydettyKisa.id, directLink: true },
        '',
        `${window.location.pathname}${window.location.search}#kisa-${loydettyKisa.id}`
      );
    }
  }, [kisat, ladataanKisalista, valittuKisa]);

  // 2. REAALIAIKAINEN LIVE-DATAHAKU VALITULLE KISALLE
  useEffect(() => {
    if (!valittuKisa || !valittuKisa.apiUrl) return;

    const sheetId = valittuKisa.apiUrl;

    async function haeSuoratCsvData() {
      try {
        setVirhe(null);
        if (!kisaCacheRef.current[sheetId]) {
          setLadataanKisaa(true);
        }

        // 1. Selvitetään status heti alussa, jotta tiedetään mitä ladataan
        const speksitOverrideCsv = kisaCacheRef.current[sheetId]?.speksitCsvRaw;
        const kisanStatusInfo = laskeKisanEfektiivinenStatus(valittuKisa.alkuPvm, valittuKisa.loppuPvm, speksitOverrideCsv);
        const onkoKisaTulossa = kisanStatusInfo.status === 'tulossa';
        const onkoKisaPaattynyt = kisanStatusInfo.status === 'paattynyt';
        const onkoIlmoittautuminenAikaIkkunaOhi = laskeOnkoIlmoittautuminenPaattynyt(valittuKisa.alkuPvm);
        const onkoJoukkueTuloksetSallittu = valittuKisa.joukkueKisaAsetus ?? arvioiJoukkuekisaNimesta(valittuKisa.nimi);

        // 2. Rakennetaan dynaaminen lista ladattavista välilehdistä
        const sheetNamesToFetch = [];

        // ILMOITTAUTUNEET: Vain jos kisa on tulossa EIKÄ aikaraja (klo 10) ole umpeutunut
        if (onkoKisaTulossa && !onkoIlmoittautuminenAikaIkkunaOhi) {
          sheetNamesToFetch.push('Ilmoittautuneet');
        }

        // ERÄLUETTELO / RYHMÄJAKO: Tarvitaan ennen kisaa ja kisan aikana
        if (!onkoKisaPaattynyt) {
          sheetNamesToFetch.push('Ryhmäjako');
        }

        // TULOKSET & SPEKSIT: Vain kun kisa on käynnissä tai päättynyt
        if (!onkoKisaTulossa) {
          sheetNamesToFetch.push('Tulokset Y');

          if (onkoJoukkueTuloksetSallittu) {
            sheetNamesToFetch.push('NEW_Joukkue');
          }

          sheetNamesToFetch.push('KISANSPEKSIT');
        }

        if (sheetNamesToFetch.length === 0) {
          setLadataanKisaa(false);
          return;
        }

        // 3. Tehdään YKSI batch-pyyntö kaikille välilehdille kerralla
        const queryParams = new URLSearchParams({
          sheetId,
          mode: 'batchCsv'
        });

        // KORJAUS: Ei encodeURIComponentia tässä, URLSearchParams hoitaa sen itse!
        sheetNamesToFetch.forEach(name => queryParams.append('sheetNames', name));

        // Lisätään cache-buster estämään selaimen liian tiukka välimuisti live-tilanteissa
        queryParams.append('_cb', Date.now().toString());

        const fetchStartTime = performance.now();

        const response = await fetch(`/api/kisaData?${queryParams.toString()}`);
        if (!response.ok) {
          throw new Error(`Datan haku epäonnistui: ${response.status}`);
        }

        const fetchEndTime = performance.now();
        const batchResult = await response.json();
        const parseEndTime = performance.now();

        console.log(`[FETCH] Verkko-aika: ${(fetchEndTime - fetchStartTime).toFixed(0)}ms`);
        console.log(`[FETCH] Parsinta: ${(parseEndTime - fetchEndTime).toFixed(0)}ms`);
        if (batchResult.timing) {
          console.log(`[FETCH] Serverin aika: ${batchResult.timing.total_ms}ms (meta: ${batchResult.timing.meta_ms}ms, csv: ${batchResult.timing.csv_ms}ms)`);
        }
        console.log(`[FETCH] Kokonaisaika: ${(parseEndTime - fetchStartTime).toFixed(0)}ms`);

        const csvByName = batchResult.csvByName || {};

        // DEBUG: Näytä puuttuvat levyt konsolissa
        if (batchResult.notFound?.length > 0) {
          console.warn('[BATCH] Puuttuvat levyt:', batchResult.notFound);
          console.warn('[BATCH] Saatavilla olevat levyt:', batchResult.availableSheets);
          console.warn('[BATCH] Debug:', batchResult.debug);
        }

        const uusiData = {
          henkilotCsvRaw: "",
          joukkueetCsvRaw: "",
          eratCsvRaw: "",
          ilmoittautuneetCsvRaw: "",
          speksitCsvRaw: ""
        };

        const vanhaData = kisaCacheRef.current[sheetId] || {};

        // Mapitetaan vastaanotetut CSV:t
        uusiData.ilmoittautuneetCsvRaw = csvByName['Ilmoittautuneet'] || "";
        uusiData.eratCsvRaw = csvByName['Ryhmäjako'] || "";
        uusiData.joukkueetCsvRaw = csvByName['NEW_Joukkue'] || "";
        uusiData.speksitCsvRaw = csvByName['KISANSPEKSIT'] || "";

        if (!onkoKisaTulossa) {
          uusiData.henkilotCsvRaw = csvByName['Tulokset Y'] || "";
        }

        // Päivitetään välimuisti yhdistämällä uudet tiedot ja mahdolliset vanhat säilytettävät tiedot
        setKisaCache(prevCache => ({
          ...prevCache,
          [sheetId]: {
            henkilotCsvRaw: uusiData.henkilotCsvRaw || vanhaData.henkilotCsvRaw || "",
            joukkueetCsvRaw: uusiData.joukkueetCsvRaw || vanhaData.joukkueetCsvRaw || "",
            eratCsvRaw: uusiData.eratCsvRaw || vanhaData.eratCsvRaw || "",
            ilmoittautuneetCsvRaw: uusiData.ilmoittautuneetCsvRaw || vanhaData.ilmoittautuneetCsvRaw || "",
            speksitCsvRaw: uusiData.speksitCsvRaw || vanhaData.speksitCsvRaw || ""
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

  if (ladataanKisalista) {
    return <div style={tyylit.LatausKeskitys}>Ladataan kilpailurekisteriä...</div>;
  }

  // --- NÄKYMÄ 1: ETUSIVU ---
  if (!valittuKisa) {
    return (
      <div style={tyylit.KokoSivu}>
        <header style={tyylit.EtusivunOtsikkoAlue}>
          <h1 style={tyylit.EtusivunOtsikko}>🎯 T&T Tulospalvelu</h1>
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
  const kisanStatusInfo = laskeKisanEfektiivinenStatus(valittuKisa.alkuPvm, valittuKisa.loppuPvm, nykyisenKisanData?.speksitCsvRaw);

  const onkoKisaTulossa = kisanStatusInfo.status === 'tulossa';
  const onkoKisaPaattynyt = kisanStatusInfo.status === 'paattynyt';
  const onkoIlmoittautuminenAikaIkkunaOhi = laskeOnkoIlmoittautuminenPaattynyt(valittuKisa.alkuPvm);

  // SÄÄNNÖT ERI SIVUJEN NÄKYVYYDELLE
  const onkoTuloksetSallittu = !onkoKisaTulossa;
  const onkoTaulukkoSallittu = onkoTuloksetSallittu && onkoTaulukkoKytkettyPaalle;
  const onkoIlmoittautuneita = !onkoIlmoittautuminenAikaIkkunaOhi && nykyisenKisanData?.ilmoittautuneetCsvRaw?.trim().length > 10;
  const onkoEraluetteloa = !onkoKisaPaattynyt;
  const onkoJoukkueTuloksetSallittu = valittuKisa.joukkueKisaAsetus ?? arvioiJoukkuekisaNimesta(valittuKisa.nimi);
  const onkoJoukkueKisa = onkoTuloksetSallittu && onkoJoukkueTuloksetSallittu && hasCsvDataRows(nykyisenKisanData?.joukkueetCsvRaw, 2);
  const onkoTaulukkoNakyma = aktiivinenSivu === 'taulukko';
  const kilpailuNakymaMaxWidth = onkoTaulukkoNakyma ? 'min(96vw, 1320px)' : '560px';

  // Estetään käyttäjää jäämästä loukkuun piilotetulle välilehdelle
  if (onkoKisaTulossa && aktiivinenSivu !== 'ilmoittautuneet' && aktiivinenSivu !== 'erakirjaus') {
    setAktiivinenSivu(onkoIlmoittautuneita ? 'ilmoittautuneet' : 'erakirjaus');
  } else if (!onkoIlmoittautuneita && aktiivinenSivu === 'ilmoittautuneet') {
    setAktiivinenSivu(onkoTuloksetSallittu ? 'tulokset' : 'erakirjaus');
  } else if (onkoKisaPaattynyt && aktiivinenSivu !== 'tulokset' && !(onkoTaulukkoSallittu && aktiivinenSivu === 'taulukko') && aktiivinenSivu !== 'joukkueet') {
    setAktiivinenSivu('tulokset');
  } else if (!onkoTaulukkoSallittu && aktiivinenSivu === 'taulukko') {
    setAktiivinenSivu('tulokset');
  } else if (!onkoJoukkueKisa && aktiivinenSivu === 'joukkueet') {
    setAktiivinenSivu(onkoTuloksetSallittu ? 'tulokset' : 'erakirjaus');
  }

  return (
    <div style={tyylit.KokoSivu}>
      <header style={{ ...tyylit.Ylapalkki, maxWidth: kilpailuNakymaMaxWidth }}>
        <button onClick={palaaEtusivulle} style={tyylit.TakaisinNappi}>⬅️ ETUSIVU</button>
        <h1 style={tyylit.KisanOtsikko}>
          {valittuKisa.nimi} {ladataanKisaa && "🔄"}
        </h1>
        <div style={tyylit.UusiKisaPvm}>
          {muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
        </div>
        {virhe && <div style={tyylit.VirheIlmoitus}>{virhe}</div>}
      </header>

      <nav style={{ ...tyylit.NaviPalkki, maxWidth: kilpailuNakymaMaxWidth }}>
        {onkoTuloksetSallittu && (
          <button onClick={() => setAktiivinenSivu('tulokset')} style={aktiivinenSivu === 'tulokset' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>🏆 TULOKSET</button>
        )}
        {onkoTaulukkoSallittu && (
          <button onClick={() => setAktiivinenSivu('taulukko')} style={aktiivinenSivu === 'taulukko' ? tyylit.NaviNappiAktiivinen : tyylit.NaviNappi}>📊 TAULUKKO</button>
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
        <main style={{ ...tyylit.SisaltoAlue, maxWidth: kilpailuNakymaMaxWidth }}>
          {aktiivinenSivu === 'tulokset' && onkoTuloksetSallittu && nykyisenKisanData && (
            <HenkiloTulokset
              rawCsv={nykyisenKisanData.henkilotCsvRaw}
              speksitCsv={nykyisenKisanData.speksitCsvRaw} // UUSI PROP
              kisaStatus={kisanStatusInfo.status}
            />
          )}
          {aktiivinenSivu === 'taulukko' && onkoTaulukkoSallittu && nykyisenKisanData && (
            <HenkiloTaulukko data={nykyisenKisanData} kisaStatus={kisanStatusInfo.status} />
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
              <JoukkueTulokset data={nykyisenKisanData} kisaStatus={kisanStatusInfo.status} />
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
