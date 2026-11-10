// Vercel Web Analytics. Hobby-tilin ilmainen kiintiö on 50 000 tapahtumaa kuukaudessa (sivunäytöt ja omat tapahtumat
// yhteensä), ja keräys pysähtyy, kun se täyttyy. Siksi tapahtumia lähetetään vain kisan avauksesta, ei live-päivityksistä.
// Mainosten esto estää vain Vercelin skriptin (/_vercel/insights/script.js), ei sovellusta: kutsut jäävät jonoon.
import { inject, pageview, track } from '@vercel/analytics';

let viimeisinPolku = null;

// Sivunäytöt kirjataan itse (kirjaaSivunakyma), koska kisa on osoitteen hashissa (#kisa-<id>),
// jota analytiikka ei erottele: automaattisella seurannalla kaikki kisat näkyisivät etusivuna.
export function lataaAnalytiikka() {
  try {
    inject({ framework: 'react', disableAutoTrack: true });
  } catch {
    // Analytiikka ei saa estää sovelluksen käynnistymistä.
  }
}

// Etusivu on '/', avattu kisa '/kisa/<id>'. Sama polku peräkkäin kirjataan kerran.
export function analytiikkaPolku(kisaId) {
  return kisaId == null || kisaId === '' ? '/' : `/kisa/${encodeURIComponent(String(kisaId))}`;
}

// Sivunäytön polku tai null, kun suoran linkin (#kisa-<id>) kisaa vielä odotetaan: se voi löytyä tuoreesta
// rekisteristä, vaikka selaimeen tallennetusta puuttuisi. Näin sama käynti ei kirjaudu ensin etusivuksi.
export function sivunakymanPolku({ valittuKisaId, hashKisaId, kisat, rekisteriHaettu }) {
  if (valittuKisaId != null && valittuKisaId !== '') return analytiikkaPolku(valittuKisaId);
  if (!hashKisaId) return '/';
  const loytyy = (kisat || []).some((k) => String(k.id) === hashKisaId);
  return loytyy || !rekisteriHaettu ? null : '/';
}

export function kirjaaSivunakyma(polku) {
  if (!polku || polku === viimeisinPolku) return;
  viimeisinPolku = polku;
  try {
    pageview({ route: polku === '/' ? '/' : '/kisa/[id]', path: polku });
  } catch {
    // Ignore analytics tracking errors to avoid affecting UI behavior.
  }
}

export function trackAnalyticsEvent(eventName, properties = {}) {
  try {
    track(eventName, properties);
  } catch {
    // Ignore analytics tracking errors to avoid affecting UI behavior.
  }
}
