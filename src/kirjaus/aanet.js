// Kirjauksen äänet (Web Audio): osuma ja nolla kuulostavat selvästi erilaisilta, jotta kirjaaja tietää
// merkinnän katsomatta näyttöä. Ääniä ei ladata tiedostoina; ne syntetisoidaan napautuksen hetkellä.
// Selain sallii äänen vasta käyttäjän napautuksesta, joten konteksti luodaan ensimmäisellä äänellä.
let konteksti = null;

function kontekstiKayttoon() {
  const Luokka = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!Luokka) return null;
  if (!konteksti) konteksti = new Luokka();
  if (konteksti.state === 'suspended') konteksti.resume();
  return konteksti;
}

// Äänet: [taajuus Hz, alku s, kesto s, lopputaajuus Hz (valinnainen liuku)] samalla aaltomuodolla.
// voimakkuus: huippu 0–1 (pehmeämmät äänet hiljempaa, ettei kuulosta säröltä).
const AANET = {
  osuma: { aalto: 'square', voimakkuus: 0.8, savelet: [[1320, 0, 0.09]] },
  peru: { aalto: 'triangle', voimakkuus: 0.8, savelet: [[660, 0, 0.08], [440, 0.1, 0.12]] },
  korjaus: { aalto: 'triangle', voimakkuus: 0.8, savelet: [[523, 0, 0.08], [784, 0.1, 0.12]] }
};

// Nollan äänivaihtoehdot (valitaan laitteella). nolla laskee; nolla2 (tuplan molemmat ohi, toinen) nousee.
export const NOLLA_AANET = {
  kaksisavel: {
    nimi: 'Kaksisävel',
    nolla: { aalto: 'triangle', voimakkuus: 0.9, savelet: [[392, 0, 0.14], [262, 0.16, 0.2]] },
    nolla2: { aalto: 'triangle', voimakkuus: 0.9, savelet: [[262, 0, 0.14], [392, 0.16, 0.2]] }
  },
  pehmea: {
    nimi: 'Pehmeä summeri',
    nolla: { aalto: 'square', voimakkuus: 0.35, savelet: [[320, 0, 0.28, 200]] },
    nolla2: { aalto: 'square', voimakkuus: 0.35, savelet: [[200, 0, 0.28, 320]] }
  },
  kopautus: {
    nimi: 'Kaksi kopausta',
    nolla: { aalto: 'sine', voimakkuus: 1, savelet: [[240, 0, 0.13], [170, 0.17, 0.16]] },
    nolla2: { aalto: 'sine', voimakkuus: 1, savelet: [[170, 0, 0.13], [240, 0.17, 0.16]] }
  }
};
export const OLETUS_NOLLA_AANI = 'kaksisavel';

export function soita(nimi, nollaAani = OLETUS_NOLLA_AANI) {
  const vaihtoehto = NOLLA_AANET[nollaAani] || NOLLA_AANET[OLETUS_NOLLA_AANI];
  const aani = AANET[nimi] || vaihtoehto[nimi];
  const ctx = aani && kontekstiKayttoon();
  if (!ctx) return;
  const nyt = ctx.currentTime;
  for (const [taajuus, alku, kesto, loppuTaajuus] of aani.savelet) {
    const oskillaattori = ctx.createOscillator();
    const voimakkuus = ctx.createGain();
    oskillaattori.type = aani.aalto;
    oskillaattori.frequency.setValueAtTime(taajuus, nyt + alku);
    if (loppuTaajuus) oskillaattori.frequency.exponentialRampToValueAtTime(loppuTaajuus, nyt + alku + kesto);
    // Nopea nousu ja lasku, ettei ääni naksahda.
    voimakkuus.gain.setValueAtTime(0.0001, nyt + alku);
    voimakkuus.gain.exponentialRampToValueAtTime(aani.voimakkuus, nyt + alku + 0.005);
    voimakkuus.gain.exponentialRampToValueAtTime(0.0001, nyt + alku + kesto);
    oskillaattori.connect(voimakkuus).connect(ctx.destination);
    oskillaattori.start(nyt + alku);
    oskillaattori.stop(nyt + alku + kesto + 0.02);
  }
}
