// src/App.jsx
import { Component, useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import HenkiloTulokset from './HenkiloTulokset';
import JoukkueTulokset from './JoukkueTulokset';
import Ilmoittautuneet from './Ilmoittautuneet';
import MateriaaliNakyma from './MateriaaliNakyma';
import RankingTulokset from './RankingTulokset';
import RyhmaJako from './RyhmaJako';
import { googleClientId } from './utils/googleKayttaja';
import { ryhmaKokoAsetuksesta } from './utils/ryhmaMuokkaus';
import { parseCsvRows } from './utils/csv';
import { muodostaTulosteAikataulu } from './utils/aikatauluRadat';
import { extractMaterialGuidesFromRows, extractSponsorLogosFromRows } from './utils/materials';
import { parseAsemaSpeksitRows } from './utils/henkiloTulokset';
import { lueRadanLaitteet } from './utils/mobiiliLive';
import { onkoRyhmaKortteja } from './utils/mobiiliKiekot';
import { laskeSeuraavaAktiivinenSivu } from './utils/competitionView';
import {
  laskeKisanPaivaStatus,
  laskeOnkoIlmoittautuminenPaattynyt,
  laskeStatusKisalle
} from './utils/kisaStatus';
import { haeOpenSarjaSpekseista } from './utils/openSarja';
import { haeHighGunSpekseista } from './utils/highGun';
import {
  haeAikatauluMalliSpekseista,
  haeAikatauluNakyvyysSpekseista,
  haeAikatauluRyhmittelySpekseista,
  haeEiTuomaroivatSarjatSpekseista,
  haeSponsoriLogoNakyvyysSpekseista
} from './utils/kisaAsetukset';
import {
  arvioiJoukkuekisaNimesta,
  ryhmitteleKisatVuosittain
} from './utils/kilpailurekisteri';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Trophy, Table2, ClipboardList, CalendarDays, Users, ChevronRight, ChevronDown, Home, Hourglass, FileText, Printer, Radio } from 'lucide-react';
import { haeTekstit } from './i18n';
import SaaEnnuste from './components/SaaEnnuste';
import { lataaAnalytiikka, trackAnalyticsEvent } from './utils/analytiikka';
import { useKilpailurekisteri } from './hooks/useKilpailurekisteri';
import { useKisaReititys } from './hooks/useKisaReititys';
import { useKisaData } from './hooks/useKisaData';

// Taulukko-, aikataulu- ja tulostenäkymät ovat omia palojaan. Ne esiladataan, kun kisa avataan,
// joten ne ovat yleensä valmiina ennen kuin näkymä avataan (myös jos yhteys katkeaa radalla).
// TulosteTaulukko tulee HenkiloTaulukon mukana, koska se renderöidään beforeprintissä synkronisesti.
const NAKYMAPALAT = {
  taulukko: () => import('./HenkiloTaulukko'),
  aikataulu: () => import('./AikatauluNakyma'),
  ryhmaAikataulu: () => import('./AikatauluRyhmaNakyma'),
  tulosteAikataulu: () => import('./TulosteAikataulu'),
  tulosteTulokset: () => import('./TulosteTulokset')
};
const HenkiloTaulukko = lazy(NAKYMAPALAT.taulukko);
const AikatauluNakyma = lazy(NAKYMAPALAT.aikataulu);
const AikatauluRyhmaNakyma = lazy(NAKYMAPALAT.ryhmaAikataulu);
const TulosteAikataulu = lazy(NAKYMAPALAT.tulosteAikataulu);
// Ratanäkymä vain kisoille, joissa on mobiilikirjauksen ratoja, joten sitä ei esiladata.
const LiveRadat = lazy(() => import('./LiveRadat'));
// Tulosluettelo renderöidään suoraan ladatusta moduulista (ei lazy), koska print() kutsutaan heti renderöinnin
// jälkeen eikä React.lazy ehdi renderöidä ensimmäisellä kerralla.
const ladatutModuulit = {};

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

export default function App() {
  const theme = 'default';
  const locale = 'fi';
  const { kisat, ladataanKisalista, virhe } = useKilpailurekisteri();
  const { valittuKisa, aktiivinenSivu, setAktiivinenSivu, avaaKisa, palaaEtusivulle } = useKisaReititys({ kisat, ladataanKisalista });
  const { kisaStatusById, nykyisenKisanData, ladataanKisaa, valitunKisanVirhe, ajastaEsihaku, peruEsihaku } = useKisaData({ kisat, valittuKisa });
  const [avoinnaVanhatVuodet, setAvoinnaVanhatVuodet] = useState({});
  const [aktiivinenAikatauluKey, setAktiivinenAikatauluKey] = useState('');
  // Tulostuksen aloitusaika; null kun tulosluettelon tulostus ei ole käynnissä.
  const [tulosteenAika, setTulosteenAika] = useState(null);
  // Ladatut näkymäpalat. Tulosteet ovat sivulla vasta, kun niiden pala on ladattu, ettei tulostus tyhjennä sivua.
  const [ladatutPalat, setLadatutPalat] = useState({});
  const tulostusLatautuuRef = useRef(false);
  const TulosteTulokset = ladatutPalat.tulosteTulokset ? ladatutModuulit.tulosteTulokset.default : null;
  // Taulukkonäkymän tulosteen juurielementti; HenkiloTaulukko renderöi tulosteen siihen (portaali).
  const [taulukkoTulosteJuuri, setTaulukkoTulosteJuuri] = useState(null);

  useEffect(() => lataaAnalytiikka(), []);

  const tx = haeTekstit('app', locale);
  const txTuloste = haeTekstit('tulosteTulokset', locale);
  const txRyhmat = haeTekstit('ryhmaJako', locale);

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

  const lataaPala = useCallback((avain) => NAKYMAPALAT[avain]().then((moduuli) => {
    ladatutModuulit[avain] = moduuli;
    setLadatutPalat((vanha) => (vanha[avain] ? vanha : { ...vanha, [avain]: true }));
    return moduuli;
  }), []);

  const tulostaTulokset = async () => {
    // Valmiiksi ladattu pala tulostetaan heti, jolloin print() on vielä painalluksen sisällä.
    if (ladatutPalat.tulosteTulokset) {
      setTulosteenAika(new Date());
      return;
    }
    if (tulostusLatautuuRef.current) return;
    tulostusLatautuuRef.current = true;
    try {
      await lataaPala('tulosteTulokset');
      setTulosteenAika(new Date());
    } catch (virhe) {
      console.error('Tulosluettelon lataus epäonnistui', virhe);
      window.alert(tx.viewLoadFailed);
    } finally {
      tulostusLatautuuRef.current = false;
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
  const yhteysSahkoposti = String(import.meta.env.VITE_CONTACT_EMAIL || 'tt.tulospalvelu@gmail.com').trim();

  const avaaKisaNakyma = (kisa) => {
    trackAnalyticsEvent('competition_open', {
      competitionId: String(kisa?.id || ''),
      competitionName: String(kisa?.nimi || ''),
      status: String(kisaStatusById[kisa?.id]?.status || '')
    });
    avaaKisa(kisa);
  };


  const muotoileKisaPaivatTekstiksi = (alku, loppu) => {
    if (!alku) return 'Päivämäärä ei tiedossa';
    if (!loppu || alku === loppu) return `📅 ${alku}`;
    return `📅 ${alku} – ${loppu}`;
  };

  const kuluvaVuosi = new Date().getFullYear();

  const kisaRyhmat = useMemo(() => ryhmitteleKisatVuosittain(kisat, kuluvaVuosi), [kisat, kuluvaVuosi]);

  // Esiladataan näkymäpalat, kun ensimmäinen kisa on auki. Epäonnistunut esilataus yritetään uudelleen avattaessa.
  const onkoKisaDataa = Boolean(nykyisenKisanData) && !valittuKisa?.onkoRanking;
  useEffect(() => {
    if (!onkoKisaDataa || typeof window === 'undefined') return undefined;
    const esilataa = () => Object.keys(NAKYMAPALAT).forEach((avain) => lataaPala(avain).catch(() => {}));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(esilataa, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const ajastin = window.setTimeout(esilataa, 200);
    return () => window.clearTimeout(ajastin);
  }, [onkoKisaDataa, lataaPala]);

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
    () => ({
      ...parseAsemaSpeksitRows(nykyisenKisanParsitutRivit.speksitRows),
      openSarja: haeOpenSarjaSpekseista(nykyisenKisanParsitutRivit.speksitRows),
      highGun: haeHighGunSpekseista(nykyisenKisanParsitutRivit.speksitRows)
    }),
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
  const eiTuomaroivatSarjat = useMemo(
    () => haeEiTuomaroivatSarjatSpekseista(nykyisenKisanParsitutRivit.speksitRows || []),
    [nykyisenKisanParsitutRivit.speksitRows]
  );
  const aikatauluMalliAsetus = useMemo(
    () => haeAikatauluMalliSpekseista(nykyisenKisanParsitutRivit.speksitRows || []) || 'inline',
    [nykyisenKisanParsitutRivit.speksitRows]
  );
  // Ryhmien muokkaus järjestäjille (oma Google-kirjautuminen), kunnes kisa on päättynyt.
  const onkoRyhmaMuokkausSallittu = Boolean(valittuKisa?.apiUrl) && Boolean(googleClientId()) && !onkoKisaPaattynyt;
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
  const onkoOmaAikatauluTuloste = Boolean(tulosteAikataulu) && Boolean(ladatutPalat.tulosteAikataulu);
  const tulostetaanAikataulu = !tulosteenAika && aktiivinenSivu === 'aikataulu' && onkoAikatauluSallittu && onkoOmaAikatauluTuloste;
  // Taulukkonäkymässä tulostetaan taulukon oma A4-tuloste (myös Ctrl+P), ei vieritettävää näytön taulukkoa.
  const tulostetaanTaulukko = !tulosteenAika && aktiivinenSivu === 'taulukko' && onkoTaulukkoSallittu && Boolean(nykyisenKisanData?.henkilotCsvRaw) && Boolean(ladatutPalat.taulukko);
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

  // Radat live: mobiilikirjauksen Compak-radat (MOBIILI_LAITTEET), kun kisa on käynnissä.
  const mobiiliLaitteetCsvRaw = nykyisenKisanData?.mobiiliLaitteetCsvRaw || '';
  const onkoLiveRatoja = useMemo(() => lueRadanLaitteet(mobiiliLaitteetCsvRaw).length > 0, [mobiiliLaitteetCsvRaw]);
  // Tulosten kiekkonäkymä: kisassa on ryhmäpuhelimen kortteja (Sporting / FITASC / ESP). Päättyneestä kisasta
  // MOBIILI_RYHMAT ei tule (null): ei tiedossa, kortit haetaan ampujan kortin avauksessa.
  const mobiiliRyhmatCsvRaw = nykyisenKisanData?.mobiiliRyhmatCsvRaw;
  // Compak-radan kortit (MOBIILI Rata N): kisassa on kirjauslaitteen ratoja (MOBIILI_LAITTEET), päättyneessä ei tiedossa.
  const kiekkoLahteet = useMemo(() => (typeof mobiiliRyhmatCsvRaw === 'string'
    ? { ryhma: onkoRyhmaKortteja(mobiiliRyhmatCsvRaw), compak: onkoLiveRatoja }
    : { ryhma: null, compak: null }), [mobiiliRyhmatCsvRaw, onkoLiveRatoja]);
  const onkoLiveSallittu = onkoTuloksetSallittu && !onkoKisaPaattynyt && onkoLiveRatoja;
  // Kaikki taulukossa olevat aikataulut, myös tyhjät: LAYOUT/PÄIVÄ laskee päivät niistä kuten kirjauslaite.
  const aikatauluValilehdet = nykyisenKisanData?.aikatauluValilehdet;
  const liveAikataulut = useMemo(() => [
    { nimi: 'Aikataulu', raw: aikatauluCsvRaw },
    { nimi: 'Aikataulu La', raw: aikatauluLaCsvRaw },
    { nimi: 'Aikataulu Su', raw: aikatauluSuCsvRaw }
  ].filter((a) => (aikatauluValilehdet ? aikatauluValilehdet.includes(a.nimi) : String(a.raw || '').trim())),
  [aikatauluCsvRaw, aikatauluLaCsvRaw, aikatauluSuCsvRaw, aikatauluValilehdet]);

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
    onkoTuloksetSallittu,
    onkoRyhmaMuokkausSallittu,
    onkoLiveSallittu
  });
  if (seuraavaAktiivinenSivu !== aktiivinenSivu) {
    setAktiivinenSivu(seuraavaAktiivinenSivu);
  }

  if (ladataanKisalista) {
    return <div data-theme={theme} className="px-4 py-16 text-center text-[hsl(var(--muted-foreground))]">{tx.loadingRegistry}</div>;
  }

  const renderKisaKortti = (kisa) => {
    const statusData = kisaStatusById[kisa.id] || laskeKisanPaivaStatus(kisa);
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
              <SaaEnnuste kisa={kisa} status={statusData.status} locale={locale} />
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
              <SaaEnnuste kisa={valittuKisa} status={kisanStatusInfo.status} locale={locale} className="mt-1" />
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
        {onkoLiveSallittu && (
          <Button onClick={() => setAktiivinenSivu('live')} variant={aktiivinenSivu === 'live' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <Radio className="h-4 w-4" aria-hidden="true" />
            {tx.liveLanes}
          </Button>
        )}
        {onkoMateriaaleja && (
          <Button onClick={() => setAktiivinenSivu('materiaalit')} variant={aktiivinenSivu === 'materiaalit' ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <FileText className="h-4 w-4" aria-hidden="true" />
            {tx.materials}
          </Button>
        )}
        {onkoTuloksetSallittu && nykyisenKisanData?.henkilotCsvRaw && (
          <Button onClick={tulostaTulokset} variant="outline" size="sm" className="ml-auto gap-1.5">
            <Printer className="h-4 w-4" aria-hidden="true" />
            {txTuloste.button}
          </Button>
        )}
      </nav>}

      {ladataanKisaa && !nykyisenKisanData ? (
        <IlmoitusLaatikko>{tx.fetchingCompetitionData}</IlmoitusLaatikko>
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
                key={valittuKisa.apiUrl}
                rawCsv={nykyisenKisanData.henkilotCsvRaw}
                speksitCsv={nykyisenKisanData.speksitCsvRaw}
                rawRows={nykyisenKisanParsitutRivit.henkilotRows}
                parsedSpeksit={nykyisenKisanSpeksit}
                kisaStatus={kisanStatusInfo.status}
                sheetId={valittuKisa.apiUrl}
                kiekkoLahteet={kiekkoLahteet}
                locale={locale}
              />
            </div>
          )}
          {aktiivinenSivu === 'taulukko' && onkoTaulukkoSallittu && nykyisenKisanData && (
            <NakymaVirheRaja tx={tx}>
            <Suspense fallback={<IlmoitusLaatikko>{tx.loadingView}</IlmoitusLaatikko>}>
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
            </NakymaVirheRaja>
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
                <NakymaVirheRaja tx={tx} key={valittuAikatauluCsv.key}>
                <Suspense fallback={<IlmoitusLaatikko>{tx.loadingView}</IlmoitusLaatikko>}>
                {kaytaRyhmaAikatauluNakymaa ? (
                  <AikatauluRyhmaNakyma
                    rawCsv={valittuAikatauluCsv?.raw || ''}
                    locale={locale}
                    sponsorLogos={kisanSponsorit}
                    showGlobalSponsorLogos={naytaAikatauluOtsikonSponsorilogot}
                    defaultGroupingMode={aikatauluRyhmittelyAsetus}
                    competitionStartDate={valittuKisa?.onkoTesti ? '' : (valittuKisa?.alkuPvm || '')}
                  />
                ) : (
                  <AikatauluNakyma
                    rawCsv={valittuAikatauluCsv?.raw || ''}
                    locale={locale}
                    sponsorLogos={kisanSponsorit}
                    showGlobalSponsorLogos={naytaAikatauluOtsikonSponsorilogot}
                    defaultGroupingMode={aikatauluRyhmittelyAsetus}
                    omaTuloste={onkoOmaAikatauluTuloste}
                  />
                )}
                </Suspense>
                </NakymaVirheRaja>
              )}
            </div>
          )}
          {aktiivinenSivu === 'live' && onkoLiveSallittu && (
            <NakymaVirheRaja tx={tx}>
              <Suspense fallback={<IlmoitusLaatikko>{tx.loadingView}</IlmoitusLaatikko>}>
                <LiveRadat
                  sheetId={valittuKisa.apiUrl}
                  speksitRivit={nykyisenKisanParsitutRivit.speksitRows}
                  aikataulut={liveAikataulut}
                  laitteetCsv={mobiiliLaitteetCsvRaw}
                  naytaJono={onkoAikatauluSallittu}
                  locale={locale}
                />
              </Suspense>
            </NakymaVirheRaja>
          )}
          {aktiivinenSivu === 'ryhmat' && onkoRyhmaMuokkausSallittu && (
            <RyhmaJako
              key={valittuKisa.apiUrl}
              sheetId={valittuKisa.apiUrl}
              ryhmaKoko={ryhmaKokoAsetuksesta(aikatauluRyhmittelyAsetus)}
              ryhmittely={aikatauluRyhmittelyAsetus}
              aikataulut={aikatauluCsvList}
              eiTuomaroivat={eiTuomaroivatSarjat}
              locale={locale}
            />
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
        {onkoRyhmaMuokkausSallittu && aktiivinenSivu !== 'ryhmat' && (
          <div className="pb-1 app-print-hide-nav">
            <button type="button" className="underline hover:text-[hsl(var(--foreground))]" onClick={() => setAktiivinenSivu('ryhmat')}>
              {txRyhmat.openEditor}
            </button>
          </div>
        )}
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
        <NakymaVirheRaja tx={null}>
        <Suspense fallback={null}>
        <TulosteAikataulu
          aikataulu={tulosteAikataulu}
          otsikko={valittuAikatauluCsv.label}
          kisaNimi={valittuKisa.nimi}
          kisaPaivat={muotoileKisaPaivatTekstiksi(valittuKisa.alkuPvm, valittuKisa.loppuPvm)}
          locale={locale}
        />
        </Suspense>
        </NakymaVirheRaja>
      )}
    </div>
  );
}

function IlmoitusLaatikko({ children }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm text-[hsl(var(--muted-foreground))]">{children}</div>
  );
}

// Näkymän virhe (esim. pala ei latautunut verkkokatkon tai uuden julkaisun takia) ei kaada koko sovellusta.
// Uudelleenlatausnappi näytetään vain verkossa, ettei offline-tilassa välimuistista toimiva sovellus katoa.
// Avain (key) nollaa rajan, kun näkymän sisältö vaihtuu.
class NakymaVirheRaja extends Component {
  constructor(props) {
    super(props);
    this.state = { virhe: null };
  }

  static getDerivedStateFromError(virhe) {
    return { virhe };
  }

  componentDidCatch(virhe) {
    console.error('Näkymän lataus epäonnistui', virhe);
  }

  render() {
    if (!this.state.virhe) return this.props.children;
    const { tx } = this.props;
    if (!tx) return null;
    const verkossa = typeof navigator === 'undefined' || navigator.onLine !== false;
    return (
      <IlmoitusLaatikko>
        {verkossa ? tx.viewLoadFailed : tx.viewLoadFailedOffline}{' '}
        {verkossa && (
          <button type="button" className="underline hover:text-[hsl(var(--foreground))]" onClick={() => window.location.reload()}>
            {tx.reloadPage}
          </button>
        )}
      </IlmoitusLaatikko>
    );
  }
}
