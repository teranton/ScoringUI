// src/App.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import HenkiloTulokset from './HenkiloTulokset';
import HenkiloTaulukko from './HenkiloTaulukko';
import JoukkueTulokset from './JoukkueTulokset';
import RyhmaJako from './RyhmaJako';
import Ilmoittautuneet from './Ilmoittautuneet';
import { parseCsvRows } from './utils/csv';
import { parseAsemaSpeksitRows } from './utils/henkiloTulokset';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';

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

function haeStatusOverrideSpekseista(speksitData) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  const avainSanat = new Set([
    'STATUS', 'KISASTATUS', 'KISA_STATUS', 'KILPAILUNSTATUS', 'KILPAILU_STATUS',
    'COMPETITIONSTATUS', 'KISAPAATTYNYT', 'KISA_PAATTYNYT', 'KILPAILUPAATTYNYT', 'KILPAILU_PAATTYNYT'
  ]);

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());
    const normalisoidut = solut.map((s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, ''));

    for (let i = 0; i < normalisoidut.length; i++) {
      const avain = normalisoidut[i];
      if (!avainSanat.has(avain)) continue;

      const ehdokasArvot = [
        solut[i + 1], solut[i + 2], solut[i], ...solut
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

function laskeKisanEfektiivinenStatus(alkuStr, loppuStr, speksitData) {
  const oletus = laskeKisanStatusJaTyyli(alkuStr, loppuStr);
  const override = haeStatusOverrideSpekseista(speksitData);
  if (!override) return oletus;

  if (override === 'paattynyt') {
    return { teksti: 'Päättynyt', tyyli: { background: '#f1f3f4', color: '#3c4043' }, status: 'paattynyt' };
  }
  if (override === 'kaynnissa') {
    return { teksti: 'Käynnissä', tyyli: { background: '#e6f4ea', color: '#137333' }, status: 'kaynnissa' };
  }
  return { teksti: 'Tulossa', tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
}

function statusToBadgeVariant(status) {
  if (status === 'kaynnissa') return 'ongoing';
  if (status === 'paattynyt') return 'ended';
  return 'upcoming';
}

function labelForStatus(status, locale) {
  if (locale === 'en') {
    if (status === 'kaynnissa') return 'Ongoing';
    if (status === 'paattynyt') return 'Ended';
    return 'Upcoming';
  }

  if (status === 'kaynnissa') return 'Käynnissä';
  if (status === 'paattynyt') return 'Päättynyt';
  return 'Tulossa';
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'default';
    const saved = window.localStorage.getItem('scoringui_theme');
    return ['default', 'ocean', 'forest'].includes(saved) ? saved : 'default';
  });
  const [locale, setLocale] = useState(() => {
    if (typeof window === 'undefined') return 'fi';
    const saved = window.localStorage.getItem('scoringui_locale');
    return saved === 'en' ? 'en' : 'fi';
  });
  const [kisat, setKisat] = useState([]);
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('tulokset');
  const [ladataanKisalista, setLadataanKisalista] = useState(true);

  const [kisaCache, setKisaCache] = useState({});
  const [ladataanKisaa, setLadataanKisaa] = useState(false);
  const [virhe, setVirhe] = useState(null);
  const kisaCacheRef = useRef(kisaCache);
  const fetchInFlightRef = useRef({});

  useEffect(() => {
    kisaCacheRef.current = kisaCache;
  }, [kisaCache]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('scoringui_locale', locale);
    }
  }, [locale]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('scoringui_theme', theme);
    }
  }, [theme]);

  const tx = useMemo(() => {
    if (locale === 'en') {
      return {
        appTitle: '🎯 T&T Competition Results',
        appSubtitle: 'Live and archived competition results',
        loadingRegistry: 'Loading competition registry...',
        backHome: 'Back to Home',
        results: 'Results',
        table: 'Table',
        registrations: 'Registrations',
        heatList: 'Heat List',
        teamResults: 'Team Results',
        themeLabel: 'Theme',
        themeDefault: 'Default',
        themeOcean: 'Ocean',
        themeForest: 'Forest',
        fetchingCompetitionData: 'Fetching competition data...'
      };
    }

    return {
      appTitle: '🎯 T&T Tulospalvelu',
      appSubtitle: 'Tämänkin voi tehdä helpommin',
      loadingRegistry: 'Ladataan kilpailurekisteriä...',
      backHome: 'Takaisin etusivulle',
      results: 'Tulokset',
      table: 'Taulukko',
      registrations: 'Ilmoittautuneet',
      heatList: 'Erälista',
      teamResults: 'Joukkuetulokset',
      themeLabel: 'Teema',
      themeDefault: 'Oletus',
      themeOcean: 'Meri',
      themeForest: 'Metsa',
      fetchingCompetitionData: 'Haetaan kilpailun tietoja...'
    };
  }, [locale]);

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

        const url = `https://docs.google.com/spreadsheets/d/${REKISTERI_SHEET_ID}/export?format=csv`;
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

  // 2. REAALIAIKAINEN BATCH-DATAHAKU BACKENDISTÄ (Yksivaiheinen, ultra-optimoitu kutsu)
// 2. REAALIAIKAINEN BATCH-DATAHAKU BACKENDISTÄ (Säästeliäs päivitys)
useEffect(() => {
  if (!valittuKisa || !valittuKisa.apiUrl) return;

  const sheetId = valittuKisa.apiUrl;

  // Tarkistetaan kisan tämänhetkinen status ennen hakuja
  // Huom: Koska speksitDataa ei ole vielä ladattu, tämä pohjaa tässä vaiheessa pvm-tietoihin
  const alustavaStatusInfo = laskeKisanStatusJaTyyli(valittuKisa.alkuPvm, valittuKisa.loppuPvm);
  const onkoStaattinen = alustavaStatusInfo.status === 'paattynyt';

  async function haeYhdistettyKisaData() {
    if (fetchInFlightRef.current[sheetId]) return;
    fetchInFlightRef.current[sheetId] = true;

    try {
      setVirhe(null);
      if (!kisaCacheRef.current[sheetId]) {
        setLadataanKisaa(true);
      }

      const startTime = performance.now();
      const sivut = ['Tulokset Y', 'NEW_Joukkue', 'Ryhmäjako', 'Ilmoittautuneet', 'KISANSPEKSIT'];
      
      const params = new URLSearchParams();
      params.append('mode', 'batchCsv');
      params.append('sheetId', sheetId);
      sivut.forEach(nimi => params.append('sheetNames', nimi));

      const response = await fetch(`/api/kisaData?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`KisaDatan haku epäonnistui palvelimelta. Status: ${response.status}`);
      }

      const tulos = await response.json();
      const csvByName = tulos.csvByName || {};
      const vanhaData = kisaCacheRef.current[sheetId] || {};

      console.log(`[CLIENT FETCH] Data ladattu (${onkoStaattinen ? 'STAATTINEN' : 'LIVE'}): ${(performance.now() - startTime).toFixed(0)}ms`);

      setKisaCache(prevCache => ({
        ...prevCache,
        [sheetId]: {
          henkilotCsvRaw: csvByName['Tulokset Y'] || vanhaData.henkilotCsvRaw || "",
          joukkueetCsvRaw: csvByName['NEW_Joukkue'] || vanhaData.joukkueetCsvRaw || "",
          eratCsvRaw: csvByName['Ryhmäjako'] || vanhaData.eratCsvRaw || "",
          ilmoittautuneetCsvRaw: csvByName['Ilmoittautuneet'] || vanhaData.ilmoittautuneetCsvRaw || "",
          speksitCsvRaw: csvByName['KISANSPEKSIT'] || vanhaData.speksitCsvRaw || ""
        }
      }));

    } catch (err) {
      console.error("Datan päivitys epäonnistui palvelimelta:", err);
      setVirhe("Tietojen päivitys epäonnistui taustalla.");
    } finally {
      fetchInFlightRef.current[sheetId] = false;
      setLadataanKisaa(false);
    }
  }

  // Haetaan data aina vähintään kerran, kun kisanäkymä avataan
  haeYhdistettyKisaData();

  // Jos kisa on päättynyt, ÄLÄ luo intervallia lainkaan!
  if (onkoStaattinen) {
    return; 
  }

  // Live-kisoille käynnistetään taustapäivitys
  const kasitteleNakymattomyys = () => {
    if (!document.hidden) haeYhdistettyKisaData();
  };

  const intervalli = setInterval(() => {
    if (!document.hidden) haeYhdistettyKisaData();
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

  const nykyisenKisanData = valittuKisa ? kisaCache[valittuKisa.apiUrl] : null;

  const nykyisenKisanParsitutRivit = useMemo(() => {
    if (!nykyisenKisanData) {
      return {
        henkilotRows: [],
        joukkueRows: [],
        speksitRows: []
      };
    }

    return {
      henkilotRows: parseCsvRows(nykyisenKisanData.henkilotCsvRaw || ''),
      joukkueRows: parseCsvRows(nykyisenKisanData.joukkueetCsvRaw || ''),
      speksitRows: parseCsvRows(nykyisenKisanData.speksitCsvRaw || '')
    };
  }, [
    nykyisenKisanData?.henkilotCsvRaw,
    nykyisenKisanData?.joukkueetCsvRaw,
    nykyisenKisanData?.speksitCsvRaw
  ]);

  const nykyisenKisanSpeksit = useMemo(
    () => parseAsemaSpeksitRows(nykyisenKisanParsitutRivit.speksitRows),
    [nykyisenKisanParsitutRivit.speksitRows]
  );

  const kisanStatusInfo = valittuKisa
    ? laskeKisanEfektiivinenStatus(valittuKisa.alkuPvm, valittuKisa.loppuPvm, nykyisenKisanParsitutRivit.speksitRows)
    : { status: 'tulossa' };

  const onkoKisaTulossa = kisanStatusInfo.status === 'tulossa';
  const onkoKisaPaattynyt = kisanStatusInfo.status === 'paattynyt';
  const onkoIlmoittautuminenAikaIkkunaOhi = valittuKisa
    ? laskeOnkoIlmoittautuminenPaattynyt(valittuKisa.alkuPvm)
    : true;

  const onkoTuloksetSallittu = !onkoKisaTulossa;
  const onkoTaulukkoSallittu = onkoTuloksetSallittu && onkoTaulukkoKytkettyPaalle;
  const onkoIlmoittautuneita = !onkoIlmoittautuminenAikaIkkunaOhi && nykyisenKisanData?.ilmoittautuneetCsvRaw?.trim().length > 10;
  const onkoJoukkueTuloksetSallittu = valittuKisa
    ? (valittuKisa.joukkueKisaAsetus ?? arvioiJoukkuekisaNimesta(valittuKisa.nimi))
    : false;

  const onkoJoukkueKisa = onkoTuloksetSallittu
    && onkoJoukkueTuloksetSallittu
    && nykyisenKisanParsitutRivit.joukkueRows.length >= 2;

  useEffect(() => {
    if (!valittuKisa) return;

    if (onkoKisaTulossa && aktiivinenSivu !== 'ilmoittautuneet' && aktiivinenSivu !== 'erakirjaus') {
      setAktiivinenSivu(onkoIlmoittautuneita ? 'ilmoittautuneet' : 'erakirjaus');
      return;
    }

    if (!onkoIlmoittautuneita && aktiivinenSivu === 'ilmoittautuneet') {
      setAktiivinenSivu(onkoTuloksetSallittu ? 'tulokset' : 'erakirjaus');
      return;
    }

    if (onkoKisaPaattynyt && aktiivinenSivu !== 'tulokset' && !(onkoTaulukkoSallittu && aktiivinenSivu === 'taulukko') && aktiivinenSivu !== 'joukkueet') {
      setAktiivinenSivu('tulokset');
      return;
    }

    if (!onkoTaulukkoSallittu && aktiivinenSivu === 'taulukko') {
      setAktiivinenSivu('tulokset');
      return;
    }

    if (!onkoJoukkueKisa && aktiivinenSivu === 'joukkueet') {
      setAktiivinenSivu(onkoTuloksetSallittu ? 'tulokset' : 'erakirjaus');
    }
  }, [
    aktiivinenSivu,
    onkoIlmoittautuneita,
    onkoJoukkueKisa,
    onkoKisaPaattynyt,
    onkoKisaTulossa,
    onkoTaulukkoSallittu,
    onkoTuloksetSallittu,
    valittuKisa
  ]);

  if (ladataanKisalista) {
    return <div data-theme={theme} className="px-4 py-16 text-center text-[hsl(var(--muted-foreground))]">{tx.loadingRegistry}</div>;
  }

  // --- NÄKYMÄ 1: ETUSIVU ---
  if (!valittuKisa) {
    return (
      <div data-theme={theme} className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 bg-[hsl(var(--background))] px-4 py-8 text-[hsl(var(--foreground))]">
        <header className="space-y-2">
          <div className="relative">
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">{tx.appTitle}</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{tx.appSubtitle}</p>
            </div>
            <div className="absolute right-0 top-0 flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">{tx.themeLabel}</span>
              <Button type="button" size="sm" variant={theme === 'default' ? 'default' : 'outline'} onClick={() => setTheme('default')}>{tx.themeDefault}</Button>
              <Button type="button" size="sm" variant={theme === 'ocean' ? 'default' : 'outline'} onClick={() => setTheme('ocean')}>{tx.themeOcean}</Button>
              <Button type="button" size="sm" variant={theme === 'forest' ? 'default' : 'outline'} onClick={() => setTheme('forest')}>{tx.themeForest}</Button>
              <Button type="button" size="sm" variant={locale === 'fi' ? 'default' : 'outline'} onClick={() => setLocale('fi')}>FI</Button>
              <Button type="button" size="sm" variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>EN</Button>
            </div>
          </div>
        </header>

        {virhe && <div className="text-sm font-medium text-rose-600">{virhe}</div>}

        <div className="flex flex-col gap-3">
          {kisat.map(kisa => {
            const statusData = laskeKisanStatusJaTyyli(kisa.alkuPvm, kisa.loppuPvm);
            return (
              <Card
                key={kisa.id}
                onClick={() => {
                  if (!kisa.apiUrl) return;
                  avaaKisaNakyma(kisa);
                }}
                className={`cursor-pointer transition-all hover:border-[hsl(var(--border))] hover:shadow-md ${!kisa.apiUrl ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex flex-col gap-1">
                    <div className="text-lg font-semibold text-[hsl(var(--foreground))]">{kisa.nimi}</div>
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                    {muotoileKisaPaivatTekstiksi(kisa.alkuPvm, kisa.loppuPvm)}
                    </div>
                  </div>
                    <Badge variant={statusToBadgeVariant(statusData.status)}>{labelForStatus(statusData.status, locale)}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // --- NÄKYMÄ 2: VALITUN KISAN NÄKYMÄ ---
  const onkoEraluetteloa = !onkoKisaPaattynyt;
  const onkoTaulukkoNakyma = aktiivinenSivu === 'taulukko';
  const kilpailuNakymaMaxWidth = onkoTaulukkoNakyma ? 'min(96vw, 1320px)' : '560px';

  return (
    <div data-theme={theme} className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 bg-[hsl(var(--background))] px-4 py-6 text-[hsl(var(--foreground))]" style={{ maxWidth: kilpailuNakymaMaxWidth }}>
      <Card>
        <CardHeader className="gap-2 border-b border-[hsl(var(--border))] pb-4">
          <div className="flex items-center justify-between gap-2">
            <Button onClick={palaaEtusivulle} variant="outline" size="sm" className="w-fit">{tx.backHome}</Button>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">{tx.themeLabel}</span>
              <Button type="button" size="sm" variant={theme === 'default' ? 'default' : 'outline'} onClick={() => setTheme('default')}>{tx.themeDefault}</Button>
              <Button type="button" size="sm" variant={theme === 'ocean' ? 'default' : 'outline'} onClick={() => setTheme('ocean')}>{tx.themeOcean}</Button>
              <Button type="button" size="sm" variant={theme === 'forest' ? 'default' : 'outline'} onClick={() => setTheme('forest')}>{tx.themeForest}</Button>
              <Button type="button" size="sm" variant={locale === 'fi' ? 'default' : 'outline'} onClick={() => setLocale('fi')}>FI</Button>
              <Button type="button" size="sm" variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>EN</Button>
            </div>
          </div>
          <CardTitle className="text-2xl">
            {valittuKisa.nimi} {ladataanKisaa && <span className="text-[hsl(var(--muted-foreground))]">↻</span>}
          </CardTitle>
          <CardDescription>
            {muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
          </CardDescription>
          {virhe && <div className="text-sm font-medium text-rose-600">{virhe}</div>}
        </CardHeader>
      </Card>

      <nav className="flex w-full flex-wrap gap-2">
        {onkoTuloksetSallittu && (
          <Button onClick={() => setAktiivinenSivu('tulokset')} variant={aktiivinenSivu === 'tulokset' ? 'default' : 'outline'} size="sm">{tx.results}</Button>
        )}
        {onkoTaulukkoSallittu && (
          <Button onClick={() => setAktiivinenSivu('taulukko')} variant={aktiivinenSivu === 'taulukko' ? 'default' : 'outline'} size="sm">{tx.table}</Button>
        )}
        {onkoIlmoittautuneita && (
          <Button onClick={() => setAktiivinenSivu('ilmoittautuneet')} variant={aktiivinenSivu === 'ilmoittautuneet' ? 'default' : 'outline'} size="sm">{tx.registrations}</Button>
        )}
        {onkoEraluetteloa && (
          <Button onClick={() => setAktiivinenSivu('erakirjaus')} variant={aktiivinenSivu === 'erakirjaus' ? 'default' : 'outline'} size="sm">{tx.heatList}</Button>
        )}
        {onkoJoukkueKisa && (
          <Button onClick={() => setAktiivinenSivu('joukkueet')} variant={aktiivinenSivu === 'joukkueet' ? 'default' : 'outline'} size="sm">{tx.teamResults}</Button>
        )}
      </nav>

      {ladataanKisaa && !nykyisenKisanData ? (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm text-[hsl(var(--muted-foreground))]">{tx.fetchingCompetitionData}</div>
      ) : (
        <main className="w-full flex-1">
          {aktiivinenSivu === 'tulokset' && onkoTuloksetSallittu && nykyisenKisanData && (
            <HenkiloTulokset
              rawCsv={nykyisenKisanData.henkilotCsvRaw}
              speksitCsv={nykyisenKisanData.speksitCsvRaw}
              rawRows={nykyisenKisanParsitutRivit.henkilotRows}
              parsedSpeksit={nykyisenKisanSpeksit}
              kisaStatus={kisanStatusInfo.status}
              locale={locale}
            />
          )}
          {aktiivinenSivu === 'taulukko' && onkoTaulukkoSallittu && nykyisenKisanData && (
            <HenkiloTaulukko data={nykyisenKisanData} parsedRows={nykyisenKisanParsitutRivit} parsedSpeksit={nykyisenKisanSpeksit} kisaStatus={kisanStatusInfo.status} locale={locale} />
          )}
          {aktiivinenSivu === 'ilmoittautuneet' && onkoIlmoittautuneita && (
            <Ilmoittautuneet rawCsv={nykyisenKisanData.ilmoittautuneetCsvRaw} locale={locale} />
          )}
          {aktiivinenSivu === 'erakirjaus' && onkoEraluetteloa && (
            <div>
              <RyhmaJako data={nykyisenKisanData} locale={locale} />
            </div>
          )}
          {aktiivinenSivu === 'joukkueet' && onkoJoukkueKisa && (
            <div>
              <JoukkueTulokset data={nykyisenKisanData} parsedRows={nykyisenKisanParsitutRivit} kisaStatus={kisanStatusInfo.status} locale={locale} />
            </div>
          )}
        </main>
      )}
    </div>
  );
}
