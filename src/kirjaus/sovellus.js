// Mobiilikirjaus sovelluksena: palvelutyöntekijä (public/kirjaus-sw.js), asennus aloitusnäytölle,
// taustalähetys ja Takaisin-painikkeen vahti.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

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
// rata tai ryhmä kirjaa vain yhdessä ikkunassa. Omistaja on localStoragessa (yhteinen kaikille ikkunoille): ikkuna,
// joka huomaa omistajan vaihtuneen (storage-tapahtuma tai paluu näkyviin, myös taustalla jäädytetty), pysähtyy ja kertoo,
// missä kirjaus jatkuu. (iPhonessa Safari ja sovellus eivät jaa tallennusta: ne ovat palvelimelle eri laitteita, ja
// rata siirtyy niiden välillä siirtolinkillä.)
const IKKUNAKANAVA = 'kirjaus-ikkuna';
const OMISTAJA_AVAIN = 'kirjaus-ikkuna:';
// Näin kauan selain odottaa avatessaan, vastaako auki oleva sovellus (vastaa heti, jos se on käynnissä).
const KYSELYN_ODOTUS_MS = 400;

const lueOmistaja = (kohde) => {
  try {
    return JSON.parse(window.localStorage.getItem(OMISTAJA_AVAIN + kohde) || 'null');
  } catch {
    return null;
  }
};
const asetaOmistaja = (kohde, oma) => {
  try {
    window.localStorage.setItem(OMISTAJA_AVAIN + kohde, JSON.stringify({ id: oma.id, sovellus: oma.sovellus }));
    return true;
  } catch {
    return false;
  }
};

// Avautuva ikkuna: 'ota' (ottaa kirjauksen heti) tai 'kysy' (selain kysyy ensin, onko omistajana oleva sovellus
// käynnissä; käynnissä oleva sovellus pitää kirjauksen). Sovellus ottaa aina, samoin selain, jos omistaja ei ole sovellus.
export function avautuvanPaatos(oma, omistaja) {
  if (oma.sovellus || !omistaja?.sovellus || omistaja.id === oma.id) return 'ota';
  return 'kysy';
}

// Missä kirjaus jatkuu, kun tämä ikkuna on pysäytetty.
export function toisaallaTeksti(omaSovellus, omistajaSovellus) {
  if (omaSovellus === omistajaSovellus) return omaSovellus ? 'toisessa sovellusikkunassa' : 'toisessa välilehdessä';
  return omistajaSovellus ? 'asennetussa sovelluksessa' : 'selaimessa';
}

// { tila, toisaalla, jatkaTassa, kierros, sovellus }: tila 'avataan' (selain odottaa sovelluksen vastausta),
// 'kirjaa' tai 'toisaalla' ({ sovellus } = missä kirjaus jatkuu). jatkaTassa ottaa kirjauksen tähän ikkunaan;
// kierros kasvaa silloin, jotta näkymä luetaan uudelleen tallennuksesta.
export function useIkkunaVahti(kohde) {
  const [oma] = useState(() => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, sovellus: onAsennettu() }));
  const [vahti, setVahti] = useState({ kohde: '', tila: 'avataan', toisaalla: null });
  const [kierros, setKierros] = useState(0);
  const tilaRef = useRef('avataan');
  // "Jatka tässä": otetaan kirjaus kysymättä, vaikka sovellus olisi auki.
  const pakotaRef = useRef(false);

  useEffect(() => {
    if (!kohde) return undefined;
    const aseta = (tila, toisaalla = null) => {
      tilaRef.current = tila;
      // Pysähtyminen piirretään heti (flushSync), jotta näkymän omat näkyvyys- ja tallennuskuuntelijat poistuvat
      // ennen kuin ne ehtivät ajaa: DOM ei kutsu kuuntelijaa, joka poistettiin saman tapahtuman aikana.
      const paivita = () => setVahti({ kohde, tila, toisaalla });
      if (tila === 'toisaalla') flushSync(paivita);
      else paivita();
    };
    const ota = () => {
      if (!asetaOmistaja(kohde, oma)) {
        // Ilman localStoragea ikkunat eivät näe toisiaan: kirjataan kuten ennenkin.
        aseta('kirjaa');
        return;
      }
      kanava?.postMessage({ tyyppi: 'otettu', kohde, id: oma.id });
      aseta('kirjaa');
    };
    // Omistaja vaihtui toisessa ikkunassa: pysähdytään (luetaan nykyinen arvo, joten yhtä aikaa avautuneista
    // ikkunoista viimeksi kirjoittanut jää kirjaamaan).
    const tarkista = () => {
      if (tilaRef.current !== 'kirjaa') return;
      const omistaja = lueOmistaja(kohde);
      if (omistaja && omistaja.id !== oma.id) aseta('toisaalla', { sovellus: Boolean(omistaja.sovellus) });
    };
    const kanava = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(IKKUNAKANAVA);
    let odotus = null;
    if (kanava) {
      kanava.onmessage = (e) => {
        const viesti = e.data;
        if (viesti?.kohde !== kohde || viesti.id === oma.id) return;
        if (viesti.tyyppi === 'kysy' && tilaRef.current === 'kirjaa') kanava.postMessage({ tyyppi: 'kirjaan', kohde, id: oma.id });
        if (viesti.tyyppi === 'kirjaan' && tilaRef.current === 'avataan') {
          clearTimeout(odotus);
          aseta('toisaalla', { sovellus: Boolean(lueOmistaja(kohde)?.sovellus) });
        }
        if (viesti.tyyppi === 'otettu') tarkista();
      };
    }
    const nakyvyys = () => {
      if (document.visibilityState === 'visible') tarkista();
    };
    const muutos = (e) => {
      if (e.key === OMISTAJA_AVAIN + kohde) tarkista();
    };
    // Kaappausvaiheessa ikkunassa: ennen näkymien omia document-kuuntelijoita (ne lähettävät näkyviin palatessa).
    window.addEventListener('visibilitychange', nakyvyys, true);
    window.addEventListener('storage', muutos);

    tilaRef.current = 'avataan';
    const pakota = pakotaRef.current;
    pakotaRef.current = false;
    if (!pakota && avautuvanPaatos(oma, lueOmistaja(kohde)) === 'kysy' && kanava) {
      setVahti({ kohde, tila: 'avataan', toisaalla: null });
      kanava.postMessage({ tyyppi: 'kysy', kohde, id: oma.id });
      odotus = setTimeout(ota, KYSELYN_ODOTUS_MS);
    } else {
      ota();
    }
    return () => {
      clearTimeout(odotus);
      kanava?.close();
      window.removeEventListener('visibilitychange', nakyvyys, true);
      window.removeEventListener('storage', muutos);
    };
  }, [kohde, oma, kierros]);

  const jatkaTassa = () => {
    pakotaRef.current = true;
    setKierros((n) => n + 1);
  };

  // Koodin vaihtuessa näytetään 'avataan', kunnes vahti on ratkaissut uuden kohteen.
  let nykyinen = vahti.kohde === kohde ? vahti : { tila: 'avataan', toisaalla: null };
  if (!kohde) nykyinen = { tila: 'kirjaa', toisaalla: null };
  return { ...nykyinen, jatkaTassa, kierros, sovellus: oma.sovellus };
}
