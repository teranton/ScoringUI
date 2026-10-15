// src/App.jsx
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import HenkiloTulokset from './HenkiloTulokset';
import JoukkueTulokset from './JoukkueTulokset';
import Ilmoittautuneet from './Ilmoittautuneet';
import MateriaaliNakyma from './MateriaaliNakyma';
import RankingTulokset from './RankingTulokset';
import { onkoCsvVirheellinen, parseCsvRows } from './utils/csv';
import { muodostaTulosteAikataulu } from './utils/aikatauluRadat';
import { extractMaterialGuidesFromRows, extractSponsorLogosFromRows } from './utils/materials';
import { parseAsemaSpeksitRows } from './utils/henkiloTulokset';
import { laskeSeuraavaAktiivinenSivu } from './utils/competitionView';
import { onkoDevTila } from './utils/devTila';
import {
  laskeKisanStatusJaTyyli,
  laskeOnkoIlmoittautuminenPaattynyt,
  laskeRankingStatus,
  laskeStatusKisalle
} from './utils/kisaStatus';
import { rankingValilehdenNimi } from './utils/rankingTulokset';
import {
  haeAikatauluMalliSpekseista,
  haeAikatauluNakyvyysSpekseista,
  haeAikatauluRyhmittelySpekseista,
  haeSponsoriLogoNakyvyysSpekseista
} from './utils/kisaAsetukset';
import {
  arvioiJoukkuekisaNimesta,
  haeKisanVuosi,
  parsiKilpailurekisteri,
  ryhmitteleKisatVuosittain
} from './utils/kilpailurekisteri';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Trophy, Table2, ClipboardList, CalendarDays, Users, ChevronRight, ChevronDown, Home, Hourglass, FileText, Printer } from 'lucide-react';
import { haeTekstit } from './i18n';
import { lueKisat, lueRekisteri, tallennaKisa, tallennaRekisteri } from './utils/paikallinenValimuisti';

// Taulukko-, aikataulu- ja tulostenäkymät ladataan omina paloinaan vasta, kun ne avataan.
// TulosteTaulukko tulee HenkiloTaulukon mukana, koska se renderöidään beforeprintissä synkronisesti.
const HenkiloTaulukko = lazy(() => import('./HenkiloTaulukko'));
const AikatauluNakyma = lazy(() => import('./AikatauluNakyma'));
const AikatauluRyhmaNakyma = lazy(() => import('./AikatauluRyhmaNakyma'));
const TulosteAikataulu = lazy(() => import('./TulosteAikataulu'));
const lataaTulosteTulokset = () => import('./TulosteTulokset');

const STATUS_OVERRIDE_REFRESH_MS = 60 * 1000;
// Päättyneen kisan data haetaan avattaessa uudelleen vain, jos se on tätä vanhempi.
const PAATTYNEEN_TUOREUS_MS = 60 * 60 * 1000;
// Käynnissä olevan kisan esihakua ei tehdä, jos data on tätä tuoreempi.
const LIVE_ESIHAKU_VALI_MS = 15 * 1000;
// Avoinna olevan kisan päivitysväli; ranking muuttuu harvoin, joten se päivitetään harvemmin.
const LIVE_PAIVITYS_VALI_MS = 20 * 1000;
const RANKING_PAIVITYS_VALI_MS = 60 * 1000;
// Esihaku alkaa vasta, kun osoitin on pysynyt kortilla näin kauan: listan yli pyyhkäisy ei hae jokaista kisaa.
const ESIHAKU_VIIVE_MS = 150;
let analyticsTrack = null;

function statusToBadgeVariant(status) {
  if (status === 'kaynnissa') return 'ongoing';
  if (status === 'tauolla') return 'paused';
  if (status === 'paattynyt') return 'ended';
  return 'upcoming';
}

function labelForStatus(status, locale) {
  const tekstit = haeTekstit('kisaStatus', locale);
  return Object.prototype.hasOwnProperty.call(tekstit, status) ? tekstit[status] : tekstit.tulossa;
}

function trackAnalyticsEvent(eventName, properties = {}) {
  try {
    if (typeof analyticsTrack === 'function') {
      analyticsTrack(eventName, properties);
    }
  } catch {
    // Ignore analytics tracking errors to avoid affecting UI behavior.
  }
}

function onkoPreviewOverrideAktiivinen() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const value = String(params.get('preview') || params.get('showHidden') || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(value);
  } catch {
    return false;
  }
}

function naytetaankoPiilotetutKisat() {
  const env = String(import.meta.env.VITE_SHOW_HIDDEN_COMPETITIONS ?? '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(env) || onkoPreviewOverrideAktiivinen();
}

function naytettavatKisatRekisterista(csvText, naytaPiilotetut) {
  const kisat = parsiKilpailurekisteri(parseCsvRows(csvText));
  return naytaPiilotetut ? kisat : kisat.filter((kisa) => !kisa.piilotettu);
}

function rankingValilehti(kisa) {
  return rankingValilehdenNimi(haeKisanVuosi(kisa));
}

function sivutKisalle(kisa, onkoStaattinen) {
  if (kisa?.onkoRanking) return [rankingValilehti(kisa), 'KISAT', 'KISANSPEKSIT'];
  return onkoStaattinen
    ? ['Tulokset Y', 'NEW_Joukkue', 'KISANSPEKSIT']
    : ['Tulokset Y', 'NEW_Joukkue', 'Ryhmäjako', 'Ilmoittautuneet', 'KISANSPEKSIT', 'Aikataulu', 'Aikataulu La', 'Aikataulu Su'];
}

function kisaDataUrl(sheetId, sivut) {
  const params = new URLSearchParams();
  params.append('sheetId', sheetId);
  sivut.forEach((nimi) => params.append('sheetNames', nimi));
  return `/api/kisa?${params.toString()}`;
}

export default function App() {
  const theme = 'default';
  const locale = 'fi';
  // Selaimeen tallennettu rekisteri näytetään heti; tuore haetaan taustalla.
  const [tallennettuRekisteri] = useState(() => lueRekisteri());
  const [kisat, setKisat] = useState(() => (
    tallennettuRekisteri ? naytettavatKisatRekisterista(tallennettuRekisteri.csv, naytetaankoPiilotetutKisat()) : []
  ));
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('tulokset');
  const [ladataanKisalista, setLadataanKisalista] = useState(() => !tallennettuRekisteri);

  const [kisaCache, setKisaCache] = useState(() => lueKisat());
  const [ladataanKisaaBySheet, setLadataanKisaaBySheet] = useState({});
  const [virhe, setVirhe] = useState(null);
  // Kisadatan virhe tallennetaan kisakohtaisesti, jotta vanhan kisan haku ei näytä tai tyhjennä virhettä toisessa kisassa.
  const [kisaVirheBySheet, setKisaVirheBySheet] = useState({});
  const [avoinnaVanhatVuodet, setAvoinnaVanhatVuodet] = useState({});
  const [aktiivinenAikatauluKey, setAktiivinenAikatauluKey] = useState('');
  // Tulostuksen aloitusaika; null kun tulosluettelon tulostus ei ole käynnissä.
  const [tulosteenAika, setTulosteenAika] = useState(null);
  // Tulosluettelo ladataan ennen tulostusta, ettei window.print() avaudu ennen kuin luettelo on sivulla.
  const [TulosteTulokset, setTulosteTulokset] = useState(null);
  // Taulukkonäkymän tulosteen juurielementti; HenkiloTaulukko renderöi tulosteen siihen (portaali).
  const [taulukkoTulosteJuuri, setTaulukkoTulosteJuuri] = useState(null);
  const [devTila] = useState(() => onkoDevTila());
  const kisaCacheRef = useRef(kisaCache);
  const fetchInFlightRef = useRef({});
  const esihakuAjastinRef = useRef(null);
  const esihakuKaynnissaRef = useRef(false);
  // Etusivun vierityskohta talteen, kun kisa avataan; palautetaan, kun palataan listalle.
  const etusivunVieritysRef = useRef(0);
  // Kohta, johon vieritetään seuraavan näkymänvaihdon jälkeen (null: ei vieritetä, esim. suora linkki tai sivun lataus).
  const vieritysKohdeRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    // Load analytics lazily so ad blockers cannot prevent app rendering.
    import('@vercel/analytics')
      .then((module) => {
        if (isCancelled) return;
        analyticsTrack = typeof module?.track === 'function' ? module.track : null;
      })
      .catch(() => {
        analyticsTrack = null;
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    kisaCacheRef.current = kisaCache;
  }, [kisaCache]);

  const tx = haeTekstit('app', locale);
  const txTuloste = haeTekstit('tulosteTulokset', locale);

  // Tulosluettelo renderöidään ensin, sitten avataan selaimen tulostusikkuna.
  useEffect(() => {
    if (!tulosteenAika || typeof window === 'undefined') return undefined;
    const lopeta = () => setTulosteenAika(null);
    // Kaikki selaimet eivät lähetä afterprint-tapahtumaa; print-mediakyselyn päättyminen lopettaa myös.
    const printMedia = window.matchMedia?.('print');
    const kunMediaMuuttuu = (event) => {
      if (!event.matches) lopeta();
    };
    window.addEventListener('afterprint', lopeta);
    printMedia?.addEventListener?.('change', kunMediaMuuttuu);
    const ajastin = window.setTimeout(() => window.print(), 0);
    return () => {
      window.clearTimeout(ajastin);
      window.removeEventListener('afterprint', lopeta);
      printMedia?.removeEventListener?.('change', kunMediaMuuttuu);
    };
  }, [tulosteenAika]);

  const tulostaTulokset = async () => {
    try {
      const moduuli = await lataaTulosteTulokset();
      setTulosteTulokset(() => moduuli.default);
      setTulosteenAika(new Date());
    } catch (virhe) {
      console.error('Tulosluettelon lataus epäonnistui', virhe);
    }
  };

  const taulukkoLippuEnv = String(import.meta.env.VITE_ENABLE_TAULUKKO ?? '').toLowerCase();
  const onkoTaulukkoKytkettyPaalle = taulukkoLippuEnv === '1' || taulukkoLippuEnv === 'true'
    ? true
    : taulukkoLippuEnv === '0' || taulukkoLippuEnv === 'false'
      ? false
      : Boolean(import.meta.env.DEV);

  const aikatauluPreviewOverrideEnv = String(
    import.meta.env.VITE_TIMETABLE_PREVIEW_OVERRIDE
      ?? import.meta.env.VITE_FORCE_TIMETABLE_VISIBLE
      ?? ''
  ).toLowerCase();
  const onkoAikatauluPreviewOverride = ['1', 'true', 'yes', 'on'].includes(aikatauluPreviewOverrideEnv);
  const onkoPiilotettujenKisojenOverride = naytetaankoPiilotetutKisat();
  const yhteysSahkoposti = String(import.meta.env.VITE_CONTACT_EMAIL || 'tt.tulospalvelu@gmail.com').trim();

  const kisaStatusById = useMemo(() => {
    const statusMap = {};

    for (const kisa of kisat) {
      const speksitRaw = kisa?.apiUrl ? (kisaCache[kisa.apiUrl]?.speksitCsvRaw || '') : '';
      statusMap[kisa.id] = laskeStatusKisalle(kisa, speksitRaw);
    }

    return statusMap;
  }, [kisat, kisaCache]);

  const avaaKisaNakyma = (kisa) => {
    trackAnalyticsEvent('competition_open', {
      competitionId: String(kisa?.id || ''),
      competitionName: String(kisa?.nimi || ''),
      status: String(kisaStatusById[kisa?.id]?.status || '')
    });
    etusivunVieritysRef.current = window.scrollY;
    vieritysKohdeRef.current = 0;
    setAktiivinenSivu('tulokset');
    setValittuKisa(kisa);
    window.history.pushState(
      { view: 'competition', competitionId: kisa.id, directLink: false },
      '',
      `${window.location.pathname}${window.location.search}#kisa-${kisa.id}`
    );
  };

  const palaaEtusivulle = () => {
    trackAnalyticsEvent('back_home', {
      competitionId: String(valittuKisa?.id || ''),
      fromView: String(aktiivinenSivu || '')
    });
    if (window.history.state?.view === 'competition' && !window.history.state?.directLink) {
      window.history.back();
      return;
    }

    vieritysKohdeRef.current = 0;
    setValittuKisa(null);
    setAktiivinenSivu('tulokset');
    window.history.replaceState({ view: 'home' }, '', `${window.location.pathname}${window.location.search}`);
  };

  // 1. HAETAAN KILPAILUREKISTERI (CDN-välimuistissa oleva /api/rekisteri; tallennettu lista on jo näkyvissä)
  useEffect(() => {
    let peruttu = false;

    async function haeKisalistaCsv() {
      try {
        const response = await fetch('/api/rekisteri');
        if (!response.ok) {
          throw new Error(`Kilpailurekisterin haku epäonnistui: ${response.status}`);
        }
        const csvText = await response.text();
        if (onkoCsvVirheellinen(csvText, 10)) throw new Error('Kilpailurekisteri on tyhjä tai virheellinen');
        if (peruttu) return;

        setKisat(naytettavatKisatRekisterista(csvText, onkoPiilotettujenKisojenOverride));
        setVirhe(null);
        tallennaRekisteri(csvText);
      } catch (error) {
        console.error("Virhe kilpailurekisterin haussa:", error);
        // Tallennettu lista jää näkyviin, jos sellainen on.
        if (!peruttu && !tallennettuRekisteri) setVirhe("Kilpailurekisterin lataus epäonnistui.");
      } finally {
        if (!peruttu) setLadataanKisalista(false);
      }
    }

    haeKisalistaCsv();
    return () => {
      peruttu = true;
    };
  }, [onkoPiilotettujenKisojenOverride, tallennettuRekisteri]);

  // 1b. HAETAAN SPEKSIT ETUSIVULLE VAIN KÄYNNISSÄ OLEVILLE KISOILLE
  // ja virkistetään säännöllisesti, jotta manuaaliset status-override -muutokset päivittyvät.
  useEffect(() => {
    if (valittuKisa || kisat.length === 0) return; // Etusivulla ollessa ja vain silloin

    async function haeatKisaSpeksitBatch() {
      const nyt = Date.now();
      const haettavat = kisat.filter((kisa) => {
        if (!kisa.apiUrl) return false;

        const cacheData = kisaCacheRef.current[kisa.apiUrl] || null;
        const viimeisinSpeksitHaku = Number(cacheData?.speksitFetchedAt || 0);

        if (kisa.onkoRanking) {
          // Kauden rankingia seurataan koko kauden (se voi päättyä FINISHED-asetuksella ennen loppupäivää).
          // Edellisten vuosien ranking ilman loppupäivää haetaan kerran, jotta sen tila näkyy oikein.
          if (laskeRankingStatus(kisa.alkuPvm, kisa.loppuPvm, '').status !== 'kaynnissa') return false;
          if (laskeRankingStatus(kisa.alkuPvm, kisa.loppuPvm, cacheData?.speksitCsvRaw || '').status === 'paattynyt') return false;
          if (haeKisanVuosi(kisa) < new Date().getFullYear() && viimeisinSpeksitHaku) return false;
        } else if (laskeKisanStatusJaTyyli(kisa.alkuPvm, kisa.loppuPvm).status !== 'kaynnissa') {
          return false;
        }

        const onkoVanhentunut = !viimeisinSpeksitHaku || (nyt - viimeisinSpeksitHaku) >= STATUS_OVERRIDE_REFRESH_MS;

        return onkoVanhentunut;
      });

      if (haettavat.length === 0) return;

      const sheetIds = [...new Set(haettavat.map((k) => k.apiUrl))];

      for (const sheetId of sheetIds) {
        if (fetchInFlightRef.current[sheetId]) continue;
        fetchInFlightRef.current[sheetId] = true;

        try {
          const response = await fetch(kisaDataUrl(sheetId, ['KISANSPEKSIT']));
          if (!response.ok) continue;

          const tulos = await response.json();
          const csvByName = tulos.csvByName || {};
          const fetchedAt = Date.now();

          setKisaCache((prevCache) => ({
            ...prevCache,
            [sheetId]: {
              ...(prevCache[sheetId] || {}),
              speksitCsvRaw: csvByName['KISANSPEKSIT'] || prevCache[sheetId]?.speksitCsvRaw || "",
              speksitFetchedAt: fetchedAt
            }
          }));
        } catch (err) {
          console.error(`Speksit-haku epäonnistui sheetille ${sheetId}:`, err);
        } finally {
          fetchInFlightRef.current[sheetId] = false;
        }
      }
    }

    haeatKisaSpeksitBatch();
    const virkistysIntervalli = setInterval(haeatKisaSpeksitBatch, STATUS_OVERRIDE_REFRESH_MS);
    return () => clearInterval(virkistysIntervalli);
  }, [kisat, valittuKisa]);

  // Sivu vierii koko ikkunana, joten listan vierityskohta jäisi muuten voimaan avatussa kisassa
  // (mobiilissa vanha kisa aukesi keskeltä tuloslistaa). Kisa avautuu aina ylhäältä.
  const valitunKisanId = valittuKisa?.id ?? null;
  useLayoutEffect(() => {
    if (vieritysKohdeRef.current === null) return;
    window.scrollTo(0, vieritysKohdeRef.current);
    vieritysKohdeRef.current = null;
  }, [valitunKisanId]);

  useEffect(() => {
    if (!window.history.state?.view) {
      const hash = window.location.hash || '';
      window.history.replaceState({ view: 'home' }, '', `${window.location.pathname}${window.location.search}${hash}`);
    }

    const kasitteleSelaimenTakaisin = () => {
      vieritysKohdeRef.current = etusivunVieritysRef.current;
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

    // Synkronointi ulkoisesta lähteestä (URL-hash): suora linkki ja selaimen Eteenpäin-painike.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  useEffect(() => {
    trackAnalyticsEvent('view_change', {
      view: String(valittuKisa ? aktiivinenSivu : 'home'),
      competitionId: String(valittuKisa?.id || '')
    });
  }, [aktiivinenSivu, valittuKisa]);

  const valitunKisanSpeksitRaw = valittuKisa?.apiUrl ? (kisaCache[valittuKisa.apiUrl]?.speksitCsvRaw || '') : '';
  const valitunKisanEfektiivinenStatus = valittuKisa
    ? laskeStatusKisalle(valittuKisa, valitunKisanSpeksitRaw).status
    : 'tulossa';

  // 2. KISADATAN HAKU BACKENDISTÄ. Sama funktio palvelee kisan avausta, live-päivitystä ja esihakua.
  const haeKisaData = useCallback(async (kisa, onkoStaattinen, esihaku = false) => {
    const sheetId = kisa.apiUrl;
    const kisaId = kisa.id;
    if (fetchInFlightRef.current[sheetId]) return;
    fetchInFlightRef.current[sheetId] = true;

    try {
      if (!kisaCacheRef.current[sheetId]) {
        setLadataanKisaaBySheet((prev) => ({ ...prev, [sheetId]: true }));
      }

      const startTime = performance.now();
      const sivut = sivutKisalle(kisa, onkoStaattinen);
      const response = await fetch(kisaDataUrl(sheetId, sivut));
      if (!response.ok) {
        throw new Error(`KisaDatan haku epäonnistui palvelimelta. Status: ${response.status}`);
      }

      const tulos = await response.json();
      const csvByName = tulos.csvByName || {};
      const vanhaData = kisaCacheRef.current[sheetId] || {};
      const durationMs = Math.round(performance.now() - startTime);

      console.log(`[CLIENT FETCH] Data ladattu (${onkoStaattinen ? 'STAATTINEN' : 'LIVE'}, ${tulos.timing?.source || '?'}): ${durationMs}ms`);

      trackAnalyticsEvent('competition_fetch', {
        competitionId: String(kisaId || ''),
        mode: onkoStaattinen ? 'static' : 'live',
        ok: 'true',
        durationMs,
        sheets: String(sivut.length),
        source: String(tulos.timing?.source || ''),
        prefetch: esihaku ? 'true' : 'false'
      });

      const uusiData = {
        henkilotCsvRaw: csvByName['Tulokset Y'] || vanhaData.henkilotCsvRaw || "",
        joukkueetCsvRaw: csvByName['NEW_Joukkue'] || vanhaData.joukkueetCsvRaw || "",
        eratCsvRaw: csvByName['Ryhmäjako'] || vanhaData.eratCsvRaw || "",
        ilmoittautuneetCsvRaw: csvByName['Ilmoittautuneet'] || vanhaData.ilmoittautuneetCsvRaw || "",
        aikatauluCsvRaw: csvByName['Aikataulu'] || vanhaData.aikatauluCsvRaw || "",
        aikatauluLaCsvRaw: onkoStaattinen
          ? (csvByName['Aikataulu La'] || vanhaData.aikatauluLaCsvRaw || "")
          : (csvByName['Aikataulu La'] || ""),
        aikatauluSuCsvRaw: onkoStaattinen
          ? (csvByName['Aikataulu Su'] || vanhaData.aikatauluSuCsvRaw || "")
          : (csvByName['Aikataulu Su'] || ""),
        rankingCsvRaw: kisa.onkoRanking ? (csvByName[sivut[0]] || vanhaData.rankingCsvRaw || "") : "",
        rankingKisatCsvRaw: kisa.onkoRanking ? (csvByName['KISAT'] || vanhaData.rankingKisatCsvRaw || "") : "",
        speksitCsvRaw: csvByName['KISANSPEKSIT'] || vanhaData.speksitCsvRaw || "",
        speksitFetchedAt: csvByName['KISANSPEKSIT'] ? Date.now() : (vanhaData.speksitFetchedAt || 0),
        haettu: Date.now()
      };
      setKisaCache((prevCache) => ({ ...prevCache, [sheetId]: uusiData }));
      tallennaKisa(sheetId, uusiData);
      // Virhe tyhjennetään vasta onnistuneen haun jälkeen, ettei se välky jokaisella epäonnistuvalla päivityksellä.
      setKisaVirheBySheet((prev) => (prev[sheetId] ? { ...prev, [sheetId]: null } : prev));

    } catch (err) {
      console.error("Datan päivitys epäonnistui palvelimelta:", err);
      // Myös esihaun virhe näytetään: jos kisa avataan esihaun aikana, avaus odottaa juuri tätä hakua.
      setKisaVirheBySheet((prev) => ({ ...prev, [sheetId]: "Tietojen päivitys epäonnistui taustalla." }));
      trackAnalyticsEvent('competition_fetch', {
        competitionId: String(kisaId || ''),
        mode: onkoStaattinen ? 'static' : 'live',
        ok: 'false',
        prefetch: esihaku ? 'true' : 'false'
      });
    } finally {
      fetchInFlightRef.current[sheetId] = false;
      setLadataanKisaaBySheet((prev) => {
        if (!prev[sheetId]) return prev;
        return { ...prev, [sheetId]: false };
      });
    }
  }, []);

  useEffect(() => {
    if (!valittuKisa || !valittuKisa.apiUrl) return;

    const sheetId = valittuKisa.apiUrl;

    const onkoStaattinen = valitunKisanEfektiivinenStatus === 'paattynyt';
    const cacheData = kisaCacheRef.current[sheetId] || null;
    // Rankingin kisojen nimet (KISAT) puuttuvat myös selaimeen ennen niiden lisäämistä tallennetusta datasta.
    const puuttuuPakollistaKisaDataa = !cacheData || (valittuKisa.onkoRanking
      ? onkoCsvVirheellinen(cacheData.rankingCsvRaw, 10) || onkoCsvVirheellinen(cacheData.rankingKisatCsvRaw, 2)
      : onkoCsvVirheellinen(cacheData.henkilotCsvRaw, 10)
        || onkoCsvVirheellinen(cacheData.joukkueetCsvRaw, 10)
        || onkoCsvVirheellinen(cacheData.speksitCsvRaw, 2));
    const onkoDataTuore = Boolean(cacheData) && (Date.now() - Number(cacheData.haettu || 0)) < PAATTYNEEN_TUOREUS_MS;

    // Haetaan data aina vähintään kerran, kun kisanäkymä avataan.
    // Päättyneessä kisassa vältetään turha lisähaku, jos data on välimuistissa ja alle tunnin vanhaa.
    if (!onkoStaattinen || puuttuuPakollistaKisaDataa || !onkoDataTuore) {
      haeKisaData(valittuKisa, onkoStaattinen);
    } else {
      // Päättynyt kisa, jonka data on kunnossa välimuistissa: vanha live-päivityksen virhe ei enää koske sitä.
      setKisaVirheBySheet((prev) => (prev[sheetId] ? { ...prev, [sheetId]: null } : prev));
    }

    // Jos kisa on päättynyt, ÄLÄ luo intervallia lainkaan!
    if (onkoStaattinen) {
      return;
    }

    // Live-kisoille käynnistetään taustapäivitys
    const kasitteleNakymattomyys = () => {
      if (!document.hidden) haeKisaData(valittuKisa, false);
    };

    const intervalli = setInterval(() => {
      if (!document.hidden) haeKisaData(valittuKisa, false);
    }, valittuKisa.onkoRanking ? RANKING_PAIVITYS_VALI_MS : LIVE_PAIVITYS_VALI_MS);

    document.addEventListener('visibilitychange', kasitteleNakymattomyys);
    return () => {
      clearInterval(intervalli);
      document.removeEventListener('visibilitychange', kasitteleNakymattomyys);
    };
  }, [valittuKisa, valitunKisanEfektiivinenStatus, haeKisaData]);

  // Esihaku etusivulla, kun hiiri tai näppäimistön fokus pysähtyy kisakortille: data on usein valmis klikkauksen hetkellä.
  // Kosketusta ei käytetä, koska vierityskin alkaa kosketuksella. Esihakuja on käynnissä korkeintaan yksi kerrallaan,
  // jotta Googlen lukukiintiö ei täyty.
  const esihaeKisa = useCallback(async (kisa) => {
    if (!kisa?.apiUrl || esihakuKaynnissaRef.current) return;
    const data = kisaCacheRef.current[kisa.apiUrl];
    const onkoStaattinen = kisaStatusById[kisa.id]?.status === 'paattynyt';
    const ika = Date.now() - Number(data?.haettu || 0);
    const onkoKunnossa = data && !onkoCsvVirheellinen(kisa.onkoRanking ? data.rankingCsvRaw : data.henkilotCsvRaw, 10);
    if (onkoKunnossa && ika < (onkoStaattinen ? PAATTYNEEN_TUOREUS_MS : LIVE_ESIHAKU_VALI_MS)) return;
    esihakuKaynnissaRef.current = true;
    try {
      await haeKisaData(kisa, onkoStaattinen, true);
    } finally {
      esihakuKaynnissaRef.current = false;
    }
  }, [kisaStatusById, haeKisaData]);

  const peruEsihaku = useCallback(() => {
    clearTimeout(esihakuAjastinRef.current);
    esihakuAjastinRef.current = null;
  }, []);

  const ajastaEsihaku = useCallback((kisa) => {
    peruEsihaku();
    esihakuAjastinRef.current = setTimeout(() => {
      esihakuAjastinRef.current = null;
      esihaeKisa(kisa);
    }, ESIHAKU_VIIVE_MS);
  }, [esihaeKisa, peruEsihaku]);

  useEffect(() => peruEsihaku, [peruEsihaku]);

  const muotoileKisaPaivatTekstiksi = (alku, loppu) => {
    if (!alku) return 'Päivämäärä ei tiedossa';
    if (!loppu || alku === loppu) return `📅 ${alku}`;
    return `📅 ${alku} – ${loppu}`;
  };

  const kuluvaVuosi = new Date().getFullYear();

  const kisaRyhmat = useMemo(() => ryhmitteleKisatVuosittain(kisat, kuluvaVuosi), [kisat, kuluvaVuosi]);

  const nykyisenKisanData = valittuKisa ? kisaCache[valittuKisa.apiUrl] : null;
  const ladataanKisaa = valittuKisa?.apiUrl ? Boolean(ladataanKisaaBySheet[valittuKisa.apiUrl]) : false;
  const valitunKisanVirhe = valittuKisa?.apiUrl ? kisaVirheBySheet[valittuKisa.apiUrl] : null;

  // Riippuvuutena raaka-CSV-merkkijonot, jotta taustapäivitys ilman muutoksia ei parsi dataa uudelleen.
  const henkilotCsvRaw = nykyisenKisanData?.henkilotCsvRaw || '';
  const joukkueetCsvRaw = nykyisenKisanData?.joukkueetCsvRaw || '';
  const speksitCsvRaw = nykyisenKisanData?.speksitCsvRaw || '';
  const nykyisenKisanParsitutRivit = useMemo(() => ({
    henkilotRows: parseCsvRows(henkilotCsvRaw),
    joukkueRows: parseCsvRows(joukkueetCsvRaw),
    speksitRows: parseCsvRows(speksitCsvRaw)
  }), [henkilotCsvRaw, joukkueetCsvRaw, speksitCsvRaw]);

  const nykyisenKisanSpeksit = useMemo(
    () => parseAsemaSpeksitRows(nykyisenKisanParsitutRivit.speksitRows),
    [nykyisenKisanParsitutRivit.speksitRows]
  );

  const kisanStatusInfo = valittuKisa
    ? laskeStatusKisalle(valittuKisa, nykyisenKisanParsitutRivit.speksitRows)
    : { status: 'tulossa' };

  const onkoKisaTulossa = kisanStatusInfo.status === 'tulossa';
  const onkoKisaPaattynyt = kisanStatusInfo.status === 'paattynyt';
  const onkoIlmoittautuminenAikaIkkunaOhi = valittuKisa
    ? (kisanStatusInfo.status === 'tulossa'
      ? false
      : laskeOnkoIlmoittautuminenPaattynyt(valittuKisa.alkuPvm))
    : true;

  const aikatauluCsvRaw = nykyisenKisanData?.aikatauluCsvRaw;
  const aikatauluLaCsvRaw = nykyisenKisanData?.aikatauluLaCsvRaw;
  const aikatauluSuCsvRaw = nykyisenKisanData?.aikatauluSuCsvRaw;
  const aikatauluCsvList = useMemo(() => {

    const extractAikatauluLabel = (rawCsv, fallback) => {
      const rows = parseCsvRows(rawCsv || '');
      const titleRow = rows[0] || [];
      const first = String(titleRow[0] || '').trim();
      const second = String(titleRow[1] || '').trim();
      if (second) return second;
      const pipeIndex = first.indexOf('|');
      if (pipeIndex !== -1) {
        const suffix = first.slice(pipeIndex + 1).trim();
        if (suffix) return suffix;
      }
      return fallback;
    };

    const candidates = [
      { key: 'aikataulu-main', raw: aikatauluCsvRaw, fallbackLabel: 'Aikataulu' },
      { key: 'aikataulu-la', raw: aikatauluLaCsvRaw, fallbackLabel: 'Aikataulu La' },
      { key: 'aikataulu-su', raw: aikatauluSuCsvRaw, fallbackLabel: 'Aikataulu Su' }
    ];

    return candidates
      .filter((item) => String(item.raw || '').trim().length > 10)
      .map((item) => ({
        key: item.key,
        raw: item.raw,
        label: extractAikatauluLabel(item.raw, item.fallbackLabel)
      }));
  }, [aikatauluCsvRaw, aikatauluLaCsvRaw, aikatauluSuCsvRaw]);

  const valittuAikatauluCsv = useMemo(
    () => aikatauluCsvList.find((item) => item.key === aktiivinenAikatauluKey) || aikatauluCsvList[0] || null,
    [aikatauluCsvList, aktiivinenAikatauluKey]
  );

  const onkoTuloksetSallittu = !onkoKisaTulossa;
  const onkoTaulukkoSallittu = onkoTuloksetSallittu && onkoTaulukkoKytkettyPaalle;
  const onkoIlmoittautuneita = !onkoIlmoittautuminenAikaIkkunaOhi && nykyisenKisanData?.ilmoittautuneetCsvRaw?.trim().length > 10;
  const onkoAikataulua = aikatauluCsvList.length > 0;

  const aikatauluNakyvyysAsetus = useMemo(
    () => haeAikatauluNakyvyysSpekseista(nykyisenKisanParsitutRivit.speksitRows || []),
    [nykyisenKisanParsitutRivit.speksitRows]
  );

  const kisanSponsorit = useMemo(
    () => extractSponsorLogosFromRows(nykyisenKisanParsitutRivit.speksitRows || []),
    [nykyisenKisanParsitutRivit.speksitRows]
  );
  const sponsoriLogoNakyvyysAsetus = useMemo(
    () => haeSponsoriLogoNakyvyysSpekseista(nykyisenKisanParsitutRivit.speksitRows || []),
    [nykyisenKisanParsitutRivit.speksitRows]
  );
  const aikatauluRyhmittelyAsetus = useMemo(
    () => haeAikatauluRyhmittelySpekseista(nykyisenKisanParsitutRivit.speksitRows || []) || 'inline',
    [nykyisenKisanParsitutRivit.speksitRows]
  );
  const aikatauluMalliAsetus = useMemo(
    () => haeAikatauluMalliSpekseista(nykyisenKisanParsitutRivit.speksitRows || []) || 'inline',
    [nykyisenKisanParsitutRivit.speksitRows]
  );
  const kaytaRyhmaAikatauluNakymaa = aikatauluMalliAsetus === 'groups' || aikatauluRyhmittelyAsetus !== 'inline';
  // Compak-aikataululla (rata-ruudukko) on oma A4-tuloste. Se on sivulla aina aikataulunäkymässä, jotta
  // myös selaimen oma tulostus (Ctrl+P) tulostaa sen eikä näytön ruudukkoa.
  const tulosteAikataulu = useMemo(
    () => (kaytaRyhmaAikatauluNakymaa || !valittuAikatauluCsv
      ? null
      : muodostaTulosteAikataulu(parseCsvRows(valittuAikatauluCsv.raw || ''))),
    [kaytaRyhmaAikatauluNakymaa, valittuAikatauluCsv]
  );
  const naytaAikatauluOtsikonSponsorilogot = sponsoriLogoNakyvyysAsetus !== 'off';
  const onkoAikatauluSallittu = onkoAikataulua && (() => {
    if (onkoAikatauluPreviewOverride) return !onkoKisaPaattynyt;
    if (aikatauluNakyvyysAsetus === 'off') return false;
    if (aikatauluNakyvyysAsetus === 'after-start') return onkoTuloksetSallittu && !onkoKisaPaattynyt;
    return !onkoKisaPaattynyt;
  })();
  const tulostetaanAikataulu = !tulosteenAika && aktiivinenSivu === 'aikataulu' && onkoAikatauluSallittu && Boolean(tulosteAikataulu);
  // Taulukkonäkymässä tulostetaan taulukon oma A4-tuloste (myös Ctrl+P), ei vieritettävää näytön taulukkoa.
  const tulostetaanTaulukko = !tulosteenAika && aktiivinenSivu === 'taulukko' && onkoTaulukkoSallittu && Boolean(nykyisenKisanData?.henkilotCsvRaw);
  const onkoMateriaaleja = useMemo(() => {
    const rivit = nykyisenKisanParsitutRivit.speksitRows || [];
    return extractMaterialGuidesFromRows(rivit).length > 0;
  }, [nykyisenKisanParsitutRivit.speksitRows]);

  const onkoJoukkueTuloksetSallittu = valittuKisa
    ? (valittuKisa.joukkueKisaAsetus ?? arvioiJoukkuekisaNimesta(valittuKisa.nimi))
    : false;

  const onkoJoukkueKisa = onkoTuloksetSallittu
    && onkoJoukkueTuloksetSallittu
    && nykyisenKisanParsitutRivit.joukkueRows.length >= 2;

  // Jos valittu välilehti ei ole sallittu, vaihdetaan se jo renderöinnin aikana (ei ylimääräistä effect-kierrosta).
  const seuraavaAktiivinenSivu = laskeSeuraavaAktiivinenSivu({
    valittuKisa,
    aktiivinenSivu,
    onkoAikatauluSallittu,
    onkoIlmoittautuneita,
    onkoMateriaaleja,
    onkoJoukkueKisa,
    onkoKisaPaattynyt,
    onkoKisaTulossa,
    onkoTaulukkoSallittu,
    onkoTuloksetSallittu
  });
  if (seuraavaAktiivinenSivu !== aktiivinenSivu) {
    setAktiivinenSivu(seuraavaAktiivinenSivu);
  }

  if (ladataanKisalista) {
    return <div data-theme={theme} className="px-4 py-16 text-center text-[hsl(var(--muted-foreground))]">{tx.loadingRegistry}</div>;
  }

  const renderKisaKortti = (kisa) => {
    const statusData = kisaStatusById[kisa.id] || laskeKisanStatusJaTyyli(kisa.alkuPvm, kisa.loppuPvm);
    const onValittavissa = Boolean(kisa.apiUrl);

    return (
      <button
        type="button"
        key={kisa.id}
        disabled={!onValittavissa}
        onClick={() => {
          if (!onValittavissa) return;
          avaaKisaNakyma(kisa);
        }}
        onPointerEnter={(event) => { if (onValittavissa && event.pointerType === 'mouse') ajastaEsihaku(kisa); }}
        onPointerLeave={peruEsihaku}
        onFocus={() => { if (onValittavissa) ajastaEsihaku(kisa); }}
        onBlur={peruEsihaku}
        className="w-full text-left"
        aria-disabled={!onValittavissa}
      >
        <Card
          className={`transition-all hover:border-[hsl(var(--border))] hover:shadow-md ${onValittavissa ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2`}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <div translate="no" className="text-lg font-semibold text-[hsl(var(--foreground))]">{kisa.nimi}</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                {muotoileKisaPaivatTekstiksi(kisa.alkuPvm, kisa.loppuPvm)}
              </div>
            </div>
            <Badge variant={statusToBadgeVariant(statusData.status)}>{labelForStatus(statusData.status, locale)}</Badge>
          </CardContent>
        </Card>
      </button>
    );
  };

  // --- NÄKYMÄ 1: ETUSIVU ---
  if (!valittuKisa) {
    return (
      <div data-theme={theme} className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-3 bg-[hsl(var(--background))] px-3 py-3 text-[hsl(var(--foreground))] md:gap-4 md:px-4 md:py-5">
        <header className="space-y-2">
          <div className="relative">
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">{tx.appTitle}</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{tx.appSubtitle}</p>
            </div>
            {/*
            Later enable controls by restoring this block:
            <div className="absolute right-0 top-0 flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">{tx.themeLabel}</span>
              <Button type="button" size="sm" variant={theme === 'default' ? 'default' : 'outline'} onClick={() => setTheme('default')}>{tx.themeDefault}</Button>
              <Button type="button" size="sm" variant={theme === 'ocean' ? 'default' : 'outline'} onClick={() => setTheme('ocean')}>{tx.themeOcean}</Button>
              <Button type="button" size="sm" variant={theme === 'forest' ? 'default' : 'outline'} onClick={() => setTheme('forest')}>{tx.themeForest}</Button>
              <Button type="button" size="sm" variant={locale === 'fi' ? 'default' : 'outline'} onClick={() => setLocale('fi')}>FI</Button>
              <Button type="button" size="sm" variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>EN</Button>
            </div>
            */}
          </div>
        </header>

        {virhe && <div className="text-sm font-medium text-rose-600">{virhe}</div>}

        <div className="flex flex-col gap-3 md:gap-4">
          {kisaRyhmat.aktiiviset.map((ryhma) => (
            <section key={`aktiivinen-${ryhma.vuosi}`} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {ryhma.vuosi}
              </h2>
              <div className="flex flex-col gap-2.5 md:gap-3">
                {ryhma.kisat.map(renderKisaKortti)}
              </div>
            </section>
          ))}

          {kisaRyhmat.vanhat.map((ryhma) => {
            const onAuki = Boolean(avoinnaVanhatVuodet[ryhma.vuosi]);
            return (
              <section key={`vanha-${ryhma.vuosi}`} className="space-y-2">
                <button
                  type="button"
                  onClick={() => setAvoinnaVanhatVuodet((prev) => ({ ...prev, [ryhma.vuosi]: !prev[ryhma.vuosi] }))}
                  className="flex w-full items-center justify-between rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--muted))]/30"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                    {onAuki ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                    {ryhma.vuosi}
                  </span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{ryhma.kisat.length} kisaa</span>
                </button>

                {onAuki && (
                  <div className="flex flex-col gap-2.5 md:gap-3">
                    {ryhma.kisat.map(renderKisaKortti)}
                  </div>
                )}
              </section>
            );
          })}

          {kisaRyhmat.ilmanVuotta.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Muut</h2>
              <div className="flex flex-col gap-2.5 md:gap-3">
                {kisaRyhmat.ilmanVuotta.map(renderKisaKortti)}
              </div>
            </section>
          )}
        </div>

        <footer className="pt-2 text-center text-xs text-[hsl(var(--muted-foreground))]">
          {tx.contactLabel}:{' '}
          <a href={`mailto:${yhteysSahkoposti}`} className="underline hover:text-[hsl(var(--foreground))]">
            {yhteysSahkoposti}
          </a>
        </footer>
      </div>
    );
  }

  // --- NÄKYMÄ 2: VALITUN KISAN NÄKYMÄ ---
  const kilpailuNakymaMaxWidth = 'min(96vw, 1320px)';

  return (
    <div data-theme={theme} className={`mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-2.5 bg-[hsl(var(--background))] px-3 py-2.5 text-[hsl(var(--foreground))] md:gap-3 md:px-4 md:py-4 app-print-page-root${tulosteenAika || tulostetaanAikataulu || tulostetaanTaulukko ? ' app-tulostetaan' : ''}`} style={{ maxWidth: kilpailuNakymaMaxWidth }}>
      <Card className="app-print-hide-header">
        <CardHeader className="gap-1.5 border-b border-[hsl(var(--border))] pb-3.5">
          <div className="flex items-center justify-between gap-2">
            <Button onClick={palaaEtusivulle} variant="outline" size="sm" className="w-fit gap-1.5">
              <Home className="h-4 w-4" aria-hidden="true" />
              {tx.backHome}
            </Button>
            {/*
            Later enable controls by restoring this block:
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">{tx.themeLabel}</span>
              <Button type="button" size="sm" variant={theme === 'default' ? 'default' : 'outline'} onClick={() => setTheme('default')}>{tx.themeDefault}</Button>
              <Button type="button" size="sm" variant={theme === 'ocean' ? 'default' : 'outline'} onClick={() => setTheme('ocean')}>{tx.themeOcean}</Button>
              <Button type="button" size="sm" variant={theme === 'forest' ? 'default' : 'outline'} onClick={() => setTheme('forest')}>{tx.themeForest}</Button>
              <Button type="button" size="sm" variant={locale === 'fi' ? 'default' : 'outline'} onClick={() => setLocale('fi')}>FI</Button>
              <Button type="button" size="sm" variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>EN</Button>
            </div>
            */}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-2xl font-bold tracking-normal">
                <span translate="no">{valittuKisa.nimi}</span> {ladataanKisaa && <Hourglass className="ml-1 inline h-4 w-4 animate-pulse text-[hsl(var(--muted-foreground))]" aria-label="Loading" />}
              </CardTitle>
              <CardDescription>
                {muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
              </CardDescription>
            </div>
            <Badge variant={statusToBadgeVariant(kisanStatusInfo.status)}>{labelForStatus(kisanStatusInfo.status, locale)}</Badge>
          </div>
          {valitunKisanVirhe && <div className="text-sm font-medium text-rose-600">{valitunKisanVirhe}</div>}
        </CardHeader>
      </Card>

      {!valittuKisa.onkoRanking && <nav className="flex w-full gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden app-print-hide-nav">
        {onkoTuloksetSallittu && (
          <Button onClick={() => setAktiivinenSivu('tulokset')} variant={aktiivinenSivu === 'tulokset' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            {tx.results}
          </Button>
        )}
        {onkoTaulukkoSallittu && (
          <Button onClick={() => setAktiivinenSivu('taulukko')} variant={aktiivinenSivu === 'taulukko' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <Table2 className="h-4 w-4" aria-hidden="true" />
            {tx.table}
          </Button>
        )}
        {onkoJoukkueKisa && (
          <Button onClick={() => setAktiivinenSivu('joukkueet')} variant={aktiivinenSivu === 'joukkueet' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <Users className="h-4 w-4" aria-hidden="true" />
            {tx.teamResults}
          </Button>
        )}
        {onkoIlmoittautuneita && (
          <Button onClick={() => setAktiivinenSivu('ilmoittautuneet')} variant={aktiivinenSivu === 'ilmoittautuneet' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {tx.registrations}
          </Button>
        )}
        {onkoAikatauluSallittu && (
          <Button onClick={() => setAktiivinenSivu('aikataulu')} variant={aktiivinenSivu === 'aikataulu' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {tx.timetable}
          </Button>
        )}
        {onkoMateriaaleja && (
          <Button onClick={() => setAktiivinenSivu('materiaalit')} variant={aktiivinenSivu === 'materiaalit' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <FileText className="h-4 w-4" aria-hidden="true" />
            {tx.materials}
          </Button>
        )}
        {devTila && onkoTuloksetSallittu && nykyisenKisanData?.henkilotCsvRaw && (
          <Button onClick={tulostaTulokset} variant="outline" size="sm" className="ml-auto gap-1.5">
            <Printer className="h-4 w-4" aria-hidden="true" />
            {txTuloste.button}
          </Button>
        )}
      </nav>}

      {ladataanKisaa && !nykyisenKisanData ? (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm text-[hsl(var(--muted-foreground))]">{tx.fetchingCompetitionData}</div>
      ) : valittuKisa.onkoRanking ? (
        <main className="w-full flex-1">
          {nykyisenKisanData && (
            <div className="mx-auto w-full max-w-3xl">
              <RankingTulokset
                rawCsv={nykyisenKisanData.rankingCsvRaw}
                kisatCsv={nykyisenKisanData.rankingKisatCsvRaw}
                locale={locale}
              />
            </div>
          )}
        </main>
      ) : (
        <main className="w-full flex-1">
          {aktiivinenSivu === 'tulokset' && onkoTuloksetSallittu && nykyisenKisanData && (
            <div className="mx-auto w-full max-w-3xl">
              <HenkiloTulokset
                rawCsv={nykyisenKisanData.henkilotCsvRaw}
                speksitCsv={nykyisenKisanData.speksitCsvRaw}
                rawRows={nykyisenKisanParsitutRivit.henkilotRows}
                parsedSpeksit={nykyisenKisanSpeksit}
                kisaStatus={kisanStatusInfo.status}
                locale={locale}
              />
            </div>
          )}
          {aktiivinenSivu === 'taulukko' && onkoTaulukkoSallittu && nykyisenKisanData && (
            <Suspense fallback={<NakymaLatautuu teksti={tx.fetchingCompetitionData} />}>
            <HenkiloTaulukko
              data={nykyisenKisanData}
              parsedRows={nykyisenKisanParsitutRivit}
              parsedSpeksit={nykyisenKisanSpeksit}
              kisaStatus={kisanStatusInfo.status}
              locale={locale}
              tulosteJuuri={tulostetaanTaulukko ? taulukkoTulosteJuuri : null}
              kisaNimi={valittuKisa.nimi}
              kisaPaivat={muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
            />
            </Suspense>
          )}
          {aktiivinenSivu === 'ilmoittautuneet' && onkoIlmoittautuneita && (
            <div className="mx-auto w-full max-w-3xl">
              <Ilmoittautuneet
                rawCsv={nykyisenKisanData.ilmoittautuneetCsvRaw}
                locale={locale}
                showCompetitionNumbers={onkoAikatauluSallittu}
              />
            </div>
          )}
          {aktiivinenSivu === 'aikataulu' && onkoAikatauluSallittu && (
            <div className="space-y-3">
              {aikatauluCsvList.length > 1 && (
                <div className="flex w-full gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden app-print-hide-nav">
                  {aikatauluCsvList.map((item) => (
                    <Button
                      key={`aikataulu-switch-${item.key}`}
                      type="button"
                      size="sm"
                      variant={valittuAikatauluCsv?.key === item.key ? 'default' : 'outline'}
                      onClick={() => setAktiivinenAikatauluKey(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              )}

              {Boolean(valittuAikatauluCsv) && (
                <Suspense fallback={<NakymaLatautuu teksti={tx.fetchingCompetitionData} />}>
                {kaytaRyhmaAikatauluNakymaa ? (
                  <AikatauluRyhmaNakyma
                    rawCsv={valittuAikatauluCsv?.raw || ''}
                    locale={locale}
                    sponsorLogos={kisanSponsorit}
                    showGlobalSponsorLogos={naytaAikatauluOtsikonSponsorilogot}
                    defaultGroupingMode={aikatauluRyhmittelyAsetus}
                    competitionStartDate={valittuKisa?.alkuPvm || ''}
                  />
                ) : (
                  <AikatauluNakyma
                    rawCsv={valittuAikatauluCsv?.raw || ''}
                    locale={locale}
                    sponsorLogos={kisanSponsorit}
                    showGlobalSponsorLogos={naytaAikatauluOtsikonSponsorilogot}
                    defaultGroupingMode={aikatauluRyhmittelyAsetus}
                    omaTuloste={Boolean(tulosteAikataulu)}
                  />
                )}
                </Suspense>
              )}
            </div>
          )}
          {aktiivinenSivu === 'materiaalit' && onkoMateriaaleja && nykyisenKisanData && (
            <div className="mx-auto w-full max-w-3xl">
              <MateriaaliNakyma specsCsv={nykyisenKisanData.speksitCsvRaw} locale={locale} />
            </div>
          )}
          {aktiivinenSivu === 'joukkueet' && onkoJoukkueKisa && (
            <div className="mx-auto w-full max-w-3xl">
              <JoukkueTulokset data={nykyisenKisanData} parsedRows={nykyisenKisanParsitutRivit} kisaStatus={kisanStatusInfo.status} locale={locale} />
            </div>
          )}
        </main>
      )}

      <footer className="pt-1 text-center text-xs text-[hsl(var(--muted-foreground))]">
        {tx.contactLabel}:{' '}
        <a href={`mailto:${yhteysSahkoposti}`} className="underline hover:text-[hsl(var(--foreground))]">
          {yhteysSahkoposti}
        </a>
      </footer>

      {tulosteenAika && TulosteTulokset && nykyisenKisanData?.henkilotCsvRaw && (
        <TulosteTulokset
          rawRows={nykyisenKisanParsitutRivit.henkilotRows}
          parsedSpeksit={nykyisenKisanSpeksit}
          kisaNimi={valittuKisa.nimi}
          kisaPaivat={muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
          kisaStatus={kisanStatusInfo.status}
          tulostusaika={tulosteenAika}
          locale={locale}
        />
      )}
      {tulostetaanTaulukko && <div ref={setTaulukkoTulosteJuuri} className="tuloste-root" lang={locale} />}
      {tulostetaanAikataulu && (
        <Suspense fallback={null}>
        <TulosteAikataulu
          aikataulu={tulosteAikataulu}
          otsikko={valittuAikatauluCsv.label}
          kisaNimi={valittuKisa.nimi}
          kisaPaivat={muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
          locale={locale}
        />
        </Suspense>
      )}
    </div>
  );
}

function NakymaLatautuu({ teksti }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm text-[hsl(var(--muted-foreground))]">{teksti}</div>
  );
}
