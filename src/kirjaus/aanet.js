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

// Äänet: [taajuus Hz, alku s, kesto s] samalla aaltomuodolla.
const AANET = {
  osuma: { aalto: 'square', savelet: [[1320, 0, 0.09]] },
  nolla: { aalto: 'sawtooth', savelet: [[220, 0, 0.13], [220, 0.18, 0.13]] },
  peru: { aalto: 'triangle', savelet: [[660, 0, 0.08], [440, 0.1, 0.12]] },
  korjaus: { aalto: 'triangle', savelet: [[523, 0, 0.08], [784, 0.1, 0.12]] }
};

export function soita(nimi) {
  const aani = AANET[nimi];
  const ctx = aani && kontekstiKayttoon();
  if (!ctx) return;
  const nyt = ctx.currentTime;
  for (const [taajuus, alku, kesto] of aani.savelet) {
    const oskillaattori = ctx.createOscillator();
    const voimakkuus = ctx.createGain();
    oskillaattori.type = aani.aalto;
    oskillaattori.frequency.value = taajuus;
    // Nopea nousu ja lasku, ettei ääni naksahda.
    voimakkuus.gain.setValueAtTime(0.0001, nyt + alku);
    voimakkuus.gain.exponentialRampToValueAtTime(0.8, nyt + alku + 0.005);
    voimakkuus.gain.exponentialRampToValueAtTime(0.0001, nyt + alku + kesto);
    oskillaattori.connect(voimakkuus).connect(ctx.destination);
    oskillaattori.start(nyt + alku);
    oskillaattori.stop(nyt + alku + kesto + 0.02);
  }
}
