// Mobiilikirjaus sovelluksena: palvelutyöntekijä (public/kirjaus-sw.js), asennus aloitusnäytölle,
// taustalähetys ja Takaisin-painikkeen vahti.
import { useEffect, useRef, useState } from 'react';

const SYNK_TAGI = 'kirjaus-lahetys';
const POISTUMISEN_ODOTUS_MS = 1500;

// Vain tuotantokoosteessa (myös Vercelin esikatselu): kehityspalvelimella välimuisti haittaisi.
export function rekisteroiPalvelutyontekija() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/kirjaus-sw.js', { scope: '/kirjaus' }).catch(() => {});
}

// Pyytää selainta lähettämään kortit taustalla, kun yhteys palaa (Chrome/Android; muualla ei tee mitään).
// Palauttaa lupauksen: true, jos pyyntö rekisteröitiin.
export function pyydaTaustalahetys() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return Promise.resolve(false);
  return navigator.serviceWorker.ready
    .then(async (r) => {
      if (!r.sync) return false;
      await r.sync.register(SYNK_TAGI);
      return true;
    })
    .catch(() => false);
}

const onAsennettu = () => window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true;

export const onIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Selain tarjoaa asennusta (beforeinstallprompt) kerran, usein ennen kuin rata on auki: kuunnellaan heti
// moduulin latautuessa ja säilytetään tarjous, kunnes valikko näyttää Asenna-painikkeen.
let asennusKehote = null;
const asennusKuuntelijat = new Set();
const ilmoitaAsennus = () => asennusKuuntelijat.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    asennusKehote = e;
    ilmoitaAsennus();
  });
  window.addEventListener('appinstalled', () => {
    asennusKehote = null;
    ilmoitaAsennus();
  });
}

// { asennettu, asenna: funktio tai null }: asenna on käytössä, kun selain tarjoaa asennusta (Chrome, Edge, Samsung).
export function useAsennus() {
  const [, setVersio] = useState(0);
  useEffect(() => {
    const paivita = () => setVersio((v) => v + 1);
    asennusKuuntelijat.add(paivita);
    return () => asennusKuuntelijat.delete(paivita);
  }, []);
  const kehote = asennusKehote;
  const asenna = kehote ? async () => {
    kehote.prompt();
    await kehote.userChoice.catch(() => null);
    asennusKehote = null;
    ilmoitaAsennus();
  } : null;
  return { asennettu: onAsennettu(), asenna };
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
      // Poistuminen vahvistettu: ei kysytä uudelleen sulkemisen yhteydessä (beforeunload). Jos edellistä sivua
      // ei ole (avattu QR-koodista tai asennettuna), sivu jää auki ja vahti palaa käyttöön seuraavasta napautuksesta.
      poistutaan = true;
      window.kirjausPoistuu = true;
      window.history.back();
      setTimeout(() => {
        poistutaan = false;
        window.kirjausPoistuu = false;
      }, POISTUMISEN_ODOTUS_MS);
    };
    document.addEventListener('pointerdown', aseta, true);
    window.addEventListener('popstate', takaisin);
    return () => {
      document.removeEventListener('pointerdown', aseta, true);
      window.removeEventListener('popstate', takaisin);
    };
  }, []);
}

// Androidin ja tietokoneen Chromessa selain ja asennettu sovellus jakavat saman tallennuksen ja laitetunnuksen.
// Chromen "Vaihda sovellukseen" / "Avaa sovelluksessa" avaa sovelluksen mutta jättää välilehden auki, eikä sivu voi
// sulkea välilehteä itse. Vanha välilehti voisi silloin tallentaa vanhemman tilansa sovelluksen tilan päälle, joten
// rata tai ryhmä on auki kirjaamassa vain yhdessä ikkunassa: aktiivinen ikkuna ilmoittaa itsestään kanavalla, ja
// toinen pysähtyy ja kertoo, missä kirjaus jatkuu. (iPhonessa Safari ja sovellus eivät jaa tallennusta: ne ovat
// palvelimelle eri laitteita, ja rata siirtyy niiden välillä siirtolinkillä.)
const IKKUNAKANAVA = 'kirjaus-ikkuna';

// Aktiivisen ikkunan vastaus toisen ikkunan ilmoitukseen samasta radasta tai ryhmästä: 'pysahdy', 'vastaa'
// (tämä jatkaa, ja vastaus pysäyttää ilmoittajan) tai 'ohita'. Sovellus voittaa selaimen, ellei käyttäjä valinnut
// selainta (pakota); muuten uusin ikkuna voittaa. Vastaus ei koskaan ole pakotettu, joten viestit eivät kierrä.
export function ikkunanVastaus(oma, viesti) {
  if (!viesti || viesti.id === oma.id || viesti.kohde !== oma.kohde) return 'ohita';
  if (!viesti.pakota && oma.sovellus && !viesti.sovellus) return 'vastaa';
  return 'pysahdy';
}

// { toisaalla, jatkaTassa, kierros }: toisaalla = null, kun tämä ikkuna kirjaa, muuten { sovellus } (missä kirjaus
// jatkuu). jatkaTassa ottaa kirjauksen takaisin tähän ikkunaan; kierros kasvaa silloin, jotta näkymä luetaan
// uudelleen tallennuksesta (toinen ikkuna on voinut muuttaa sitä).
export function useIkkunaVahti(kohde) {
  const [toisaalla, setToisaalla] = useState(null);
  const [kierros, setKierros] = useState(0);
  const [oma] = useState(() => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, sovellus: onAsennettu() }));
  const toisaallaRef = useRef(null);
  const kanavaRef = useRef(null);

  useEffect(() => {
    if (!kohde || typeof BroadcastChannel === 'undefined') return undefined;
    const kanava = new BroadcastChannel(IKKUNAKANAVA);
    kanavaRef.current = kanava;
    const ilmoitus = { ...oma, kohde };
    kanava.onmessage = (e) => {
      if (toisaallaRef.current) return;
      const vastaus = ikkunanVastaus(ilmoitus, e.data);
      if (vastaus === 'vastaa') kanava.postMessage(ilmoitus);
      if (vastaus === 'pysahdy') {
        toisaallaRef.current = { sovellus: Boolean(e.data.sovellus) };
        setToisaalla(toisaallaRef.current);
      }
    };
    kanava.postMessage(ilmoitus);
    return () => {
      kanava.close();
      kanavaRef.current = null;
    };
  }, [kohde, oma]);

  const jatkaTassa = () => {
    toisaallaRef.current = null;
    setToisaalla(null);
    setKierros((n) => n + 1);
    kanavaRef.current?.postMessage({ ...oma, kohde, pakota: true });
  };

  return { toisaalla, jatkaTassa, kierros, sovellus: oma.sovellus };
}
