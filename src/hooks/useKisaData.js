// Kisadata: välimuisti (myös localStorage), etusivun käynnissä olevien kisojen speksit,
// avatun kisan haku ja live-päivitys sekä esihaku, kun osoitin pysähtyy kisakortille.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onkoCsvVirheellinen } from '../utils/csv';
import { laskeKisanPaivaStatus, laskeRankingStatus, laskeStatusKisalle } from '../utils/kisaStatus';
import { haeKisanVuosi } from '../utils/kilpailurekisteri';
import { rankingValilehdenNimi } from '../utils/rankingTulokset';
import { lueKisat, tallennaKisa } from '../utils/paikallinenValimuisti';
import { trackAnalyticsEvent } from '../utils/analytiikka';

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

export function useKisaData({ kisat, valittuKisa }) {
  const [kisaCache, setKisaCache] = useState(() => lueKisat());
  const [ladataanKisaaBySheet, setLadataanKisaaBySheet] = useState({});
  // Kisadatan virhe tallennetaan kisakohtaisesti, jotta vanhan kisan haku ei näytä tai tyhjennä virhettä toisessa kisassa.
  const [kisaVirheBySheet, setKisaVirheBySheet] = useState({});
  const kisaCacheRef = useRef(kisaCache);
  const fetchInFlightRef = useRef({});
  // Etusivun speksihaulla on oma lippunsa, ettei se estä samaan aikaan avatun kisan täyttä hakua.
  const speksitInFlightRef = useRef({});
  const esihakuAjastinRef = useRef(null);
  const esihakuKaynnissaRef = useRef(false);

  useEffect(() => {
    kisaCacheRef.current = kisaCache;
  }, [kisaCache]);

  const kisaStatusById = useMemo(() => {
    const statusMap = {};

    for (const kisa of kisat) {
      const speksitRaw = kisa?.apiUrl ? (kisaCache[kisa.apiUrl]?.speksitCsvRaw || '') : '';
      statusMap[kisa.id] = laskeStatusKisalle(kisa, speksitRaw);
    }

    return statusMap;
  }, [kisat, kisaCache]);

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
        } else if (laskeKisanPaivaStatus(kisa).status !== 'kaynnissa') {
          return false;
        }

        const onkoVanhentunut = !viimeisinSpeksitHaku || (nyt - viimeisinSpeksitHaku) >= STATUS_OVERRIDE_REFRESH_MS;

        return onkoVanhentunut;
      });

      if (haettavat.length === 0) return;

      const sheetIds = [...new Set(haettavat.map((k) => k.apiUrl))];

      for (const sheetId of sheetIds) {
        if (speksitInFlightRef.current[sheetId]) continue;
        speksitInFlightRef.current[sheetId] = true;

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
          speksitInFlightRef.current[sheetId] = false;
        }
      }
    }

    haeatKisaSpeksitBatch();
    const virkistysIntervalli = setInterval(haeatKisaSpeksitBatch, STATUS_OVERRIDE_REFRESH_MS);
    return () => clearInterval(virkistysIntervalli);
  }, [kisat, valittuKisa]);

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

  const nykyisenKisanData = valittuKisa ? kisaCache[valittuKisa.apiUrl] : null;
  const ladataanKisaa = valittuKisa?.apiUrl ? Boolean(ladataanKisaaBySheet[valittuKisa.apiUrl]) : false;
  const valitunKisanVirhe = valittuKisa?.apiUrl ? kisaVirheBySheet[valittuKisa.apiUrl] : null;

  return { kisaStatusById, nykyisenKisanData, ladataanKisaa, valitunKisanVirhe, ajastaEsihaku, peruEsihaku };
}
