// Reititys: etusivu tai avattu kisa (#kisa-<id>), selaimen Takaisin-painike ja vierityskohdan palautus.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { trackAnalyticsEvent } from '../utils/analytiikka';

export function useKisaReititys({ kisat, ladataanKisalista }) {
  const [valittuKisa, setValittuKisa] = useState(null);
  const [aktiivinenSivu, setAktiivinenSivu] = useState('tulokset');
  // Kasvaa selaimen Takaisin/Eteenpäin-siirrossa, jotta hash luetaan uudelleen (Eteenpäin kisaan).
  const [historiaSiirto, setHistoriaSiirto] = useState(0);
  // Etusivun vierityskohta talteen, kun kisa avataan; palautetaan, kun palataan listalle.
  const etusivunVieritysRef = useRef(0);
  // Kohta, johon vieritetään seuraavan näkymänvaihdon jälkeen (null: ei vieritetä, esim. suora linkki tai sivun lataus).
  const vieritysKohdeRef = useRef(null);

  const avaaKisa = (kisa) => {
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
      setAktiivinenSivu('tulokset');
      setHistoriaSiirto((n) => n + 1);
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
  }, [kisat, ladataanKisalista, valittuKisa, historiaSiirto]);

  useEffect(() => {
    trackAnalyticsEvent('view_change', {
      view: String(valittuKisa ? aktiivinenSivu : 'home'),
      competitionId: String(valittuKisa?.id || '')
    });
  }, [aktiivinenSivu, valittuKisa]);

  return { valittuKisa, aktiivinenSivu, setAktiivinenSivu, avaaKisa, palaaEtusivulle };
}
