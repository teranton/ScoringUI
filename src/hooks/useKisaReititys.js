// Reititys: etusivu tai avattu kisa (#kisa-<id>), selaimen Takaisin-painike ja vierityskohdan palautus.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { trackAnalyticsEvent } from '../utils/analytiikka';
import { kisaHash, parsiKisaHash } from '../utils/competitionView';

export function useKisaReititys({ kisat, ladataanKisalista }) {
  const [valittuKisa, setValittuKisa] = useState(null);
  // 'oletus': sivu valitaan kisan tilan mukaan (competitionView.js), kun kisan tiedot ovat tiedossa.
  const [aktiivinenSivu, setAktiivinenSivu] = useState('oletus');
  // Kasvaa selaimen Takaisin/Eteenpäin-siirrossa, jotta hash luetaan uudelleen (Eteenpäin kisaan).
  const [historiaSiirto, setHistoriaSiirto] = useState(0);
  // Etusivun vierityskohta talteen, kun kisa avataan; palautetaan, kun palataan listalle.
  const etusivunVieritysRef = useRef(0);
  // Kohta, johon vieritetään seuraavan näkymänvaihdon jälkeen (null: ei vieritetä, esim. suora linkki tai sivun lataus).
  const vieritysKohdeRef = useRef(null);

  // Avaa kisan; sivu (esim. 'ilmoittautuneet' etusivun kortin painikkeesta) tai oletussivu kisan tilan mukaan.
  const avaaKisa = (kisa, sivu = null) => {
    etusivunVieritysRef.current = window.scrollY;
    vieritysKohdeRef.current = 0;
    setAktiivinenSivu(sivu || 'oletus');
    setValittuKisa(kisa);
    window.history.pushState(
      { view: 'competition', competitionId: kisa.id, directLink: false },
      '',
      `${window.location.pathname}${window.location.search}${kisaHash(kisa.id, sivu)}`
    );
  };

  // Käyttäjän valitsema välilehti. Osoite päivitetään alla (myös kun kielletty sivu vaihdetaan sallittuun).
  const valitseSivu = (sivu) => setAktiivinenSivu(sivu);

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
    setAktiivinenSivu('oletus');
    window.history.replaceState({ view: 'home' }, '', `${window.location.pathname}${window.location.search}`);
  };

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
      // Eteenpäin kisaan: etusivun kohta talteen ja kisa ylhäältä. Takaisin etusivulle: palautetaan kohta.
      if ((window.location.hash || '').startsWith('#kisa-')) {
        etusivunVieritysRef.current = window.scrollY;
        vieritysKohdeRef.current = 0;
      } else {
        vieritysKohdeRef.current = etusivunVieritysRef.current;
      }
      setValittuKisa(null);
      setAktiivinenSivu('oletus');
      setHistoriaSiirto((n) => n + 1);
    };

    window.addEventListener('popstate', kasitteleSelaimenTakaisin);
    return () => window.removeEventListener('popstate', kasitteleSelaimenTakaisin);
  }, []);

  useEffect(() => {
    if (ladataanKisalista || kisat.length === 0 || valittuKisa) return;

    const osoite = parsiKisaHash(window.location.hash);
    if (!osoite) return;

    const loydettyKisa = kisat.find((k) => String(k.id) === osoite.id);
    if (!loydettyKisa) return;

    // Synkronointi ulkoisesta lähteestä (URL-hash): suora linkki ja selaimen Eteenpäin-painike.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAktiivinenSivu(osoite.sivu || 'oletus');
    setValittuKisa(loydettyKisa);

    if (window.history.state?.view !== 'competition' || window.history.state?.competitionId !== loydettyKisa.id) {
      window.history.replaceState(
        { view: 'competition', competitionId: loydettyKisa.id, directLink: true },
        '',
        `${window.location.pathname}${window.location.search}${kisaHash(loydettyKisa.id, osoite.sivu)}`
      );
    }
  }, [kisat, ladataanKisalista, valittuKisa, historiaSiirto]);

  // Valittu välilehti osoitteeseen (#kisa-<id>/<sivu>) ilman uutta historiariviä, jotta linkin voi jakaa ja sivun
  // päivitys pysyy samalla välilehdellä; Takaisin vie edelleen etusivulle. Oletussivu ei näy osoitteessa.
  const valitunKisanIdOsoitteeseen = valittuKisa?.id ?? null;
  useEffect(() => {
    if (valitunKisanIdOsoitteeseen === null || aktiivinenSivu === 'oletus') return;
    const uusi = kisaHash(valitunKisanIdOsoitteeseen, aktiivinenSivu);
    if (window.location.hash === uusi) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${uusi}`);
  }, [valitunKisanIdOsoitteeseen, aktiivinenSivu]);

  useEffect(() => {
    if (aktiivinenSivu === 'oletus') return;
    trackAnalyticsEvent('view_change', {
      view: String(valittuKisa ? aktiivinenSivu : 'home'),
      competitionId: String(valittuKisa?.id || '')
    });
  }, [aktiivinenSivu, valittuKisa]);

  // Sivun otsikko: avatun kisan nimi, jotta jaettu linkki ja selaimen välilehti kertovat kisan.
  const valitunKisanNimi = valittuKisa?.nimi || '';
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const alkuperainen = document.title;
    if (valitunKisanNimi) document.title = `${valitunKisanNimi} · ${alkuperainen}`;
    return () => { document.title = alkuperainen; };
  }, [valitunKisanNimi]);

  return { valittuKisa, aktiivinenSivu, setAktiivinenSivu, valitseSivu, avaaKisa, palaaEtusivulle };
}
