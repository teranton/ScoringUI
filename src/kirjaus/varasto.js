// Mobiilikirjauksen paikallinen tallennus (localStorage): ratakoodi, laitteen tunnus ja radan kortit.
// Jokainen merkintä tallennetaan heti, joten sivun sulkeminen tai uudelleenlataus ei hävitä mitään.
const KOODI = 'scoringui:kirjaus:koodi';
const LAITE = 'scoringui:kirjaus:laite';
const radanAvain = (sheetId, sarake) => `scoringui:kirjaus:${sheetId}:${sarake}`;

function lue(avain) {
  try {
    return JSON.parse(window.localStorage.getItem(avain) || 'null');
  } catch {
    return null;
  }
}

function kirjoita(avain, arvo) {
  try {
    if (arvo === null) window.localStorage.removeItem(avain);
    else window.localStorage.setItem(avain, JSON.stringify(arvo));
    return true;
  } catch {
    return false;
  }
}

export const lueKoodi = () => lue(KOODI);
export const tallennaKoodi = (koodi) => kirjoita(KOODI, koodi);

// Tunnus pidetään myös muistissa, ettei se vaihdu sivun aikana, vaikka selain ei sallisi tallennusta.
let muistissa = null;
export function laitteenTunnus() {
  if (muistissa) return muistissa;
  let tunnus = lue(LAITE);
  if (!tunnus) {
    tunnus = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);
    kirjoita(LAITE, tunnus);
  }
  muistissa = tunnus;
  return tunnus;
}

// { kortit, historia, lisatyt, ohitetut, tauot, tauotPois, keskeyttaneet, ohjelma, aanet, avaus }
export const lueRata = (sheetId, sarake) => lue(radanAvain(sheetId, sarake)) || {};
export const tallennaRata = (sheetId, sarake, tila) => kirjoita(radanAvain(sheetId, sarake), tila);
