// Mobiilikirjaus sovelluksena: palvelutyöntekijä (public/kirjaus-sw.js), asennus aloitusnäytölle,
// taustalähetys ja Takaisin-painikkeen vahti.
import { useEffect, useRef, useState } from 'react';

const SYNK_TAGI = 'kirjaus-lahetys';

// Vain tuotantokoosteessa (myös Vercelin esikatselu): kehityspalvelimella välimuisti haittaisi.
export function rekisteroiPalvelutyontekija() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/kirjaus-sw.js', { scope: '/kirjaus' }).catch(() => {});
}

// Pyytää selainta lähettämään kortit taustalla, kun yhteys palaa (Chrome/Android; muualla ei tee mitään).
export function pyydaTaustalahetys() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((r) => r.sync?.register(SYNK_TAGI))
    .catch(() => {});
}

const onAsennettu = () => window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true;

export const onIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// { asennettu, asenna: funktio tai null }: asenna on käytössä, kun selain tarjoaa asennusta (Chrome, Edge, Samsung).
export function useAsennus() {
  const [kehote, setKehote] = useState(null);
  const [asennettu, setAsennettu] = useState(onAsennettu);
  useEffect(() => {
    const tarjous = (e) => {
      e.preventDefault();
      setKehote(e);
    };
    const valmis = () => {
      setKehote(null);
      setAsennettu(true);
    };
    window.addEventListener('beforeinstallprompt', tarjous);
    window.addEventListener('appinstalled', valmis);
    return () => {
      window.removeEventListener('beforeinstallprompt', tarjous);
      window.removeEventListener('appinstalled', valmis);
    };
  }, []);
  const asenna = kehote ? async () => {
    kehote.prompt();
    await kehote.userChoice.catch(() => null);
    setKehote(null);
  } : null;
  return { asennettu, asenna };
}

// Takaisin-painike (Android, selain) ei poistu sivulta suoraan: sivulle lisätään oma historiamerkintä, ja kun
// se poistuu, kasittele() päättää: true = pysytään (merkintä palaa seuraavalla napautuksella), false = poistutaan.
// Merkintä lisätään vasta napautuksesta, koska Chrome ohittaa ilman käyttäjän toimintaa lisätyt merkinnät.
export function useTakaisinVahti(kasittele) {
  const kasitteleRef = useRef(kasittele);
  useEffect(() => { kasitteleRef.current = kasittele; }, [kasittele]);

  useEffect(() => {
    let asetettu = window.history.state?.kirjausVahti === true;
    let poistutaan = false;
    const aseta = () => {
      if (asetettu || poistutaan) return;
      window.history.pushState({ kirjausVahti: true }, '');
      asetettu = true;
    };
    const takaisin = () => {
      if (poistutaan) return;
      asetettu = false;
      if (kasitteleRef.current()) return;
      poistutaan = true;
      window.history.back();
    };
    document.addEventListener('pointerdown', aseta, true);
    window.addEventListener('popstate', takaisin);
    return () => {
      document.removeEventListener('pointerdown', aseta, true);
      window.removeEventListener('popstate', takaisin);
    };
  }, []);
}
