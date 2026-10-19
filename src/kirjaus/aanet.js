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
const AANET = {
  osuma: { aalto: 'square', savelet: [[1320, 0, 0.09]] },
  // Nolla: matala, karhea summeri, joka laskee (kaksi hieman eri taajuutta värisee keskenään).
  nolla: { aalto: 'sawtooth', savelet: [[190, 0, 0.38, 110], [197, 0, 0.38, 115]] },
  // Tuplan toinen kiekko kuulostaa eri tavalla, ettei kahta peräkkäistä merkintää sekoita yhdeksi.
  osuma2: { aalto: 'square', savelet: [[1320, 0, 0.06], [1760, 0.08, 0.08]] },
  nolla2: { aalto: 'sawtooth', savelet: [[150, 0, 0.12, 120], [157, 0, 0.12, 125], [150, 0.17, 0.2, 90], [157, 0.17, 0.2, 95]] },
  peru: { aalto: 'triangle', savelet: [[660, 0, 0.08], [440, 0.1, 0.12]] },
  korjaus: { aalto: 'triangle', savelet: [[523, 0, 0.08], [784, 0.1, 0.12]] }
};

export function soita(nimi) {
  const aani = AANET[nimi];
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
    voimakkuus.gain.exponentialRampToValueAtTime(0.8, nyt + alku + 0.005);
    if (kesto > 0.2) voimakkuus.gain.setValueAtTime(0.8, nyt + alku + kesto - 0.08);
    voimakkuus.gain.exponentialRampToValueAtTime(0.0001, nyt + alku + kesto);
    oskillaattori.connect(voimakkuus).connect(ctx.destination);
    oskillaattori.start(nyt + alku);
    oskillaattori.stop(nyt + alku + kesto + 0.02);
  }
}
