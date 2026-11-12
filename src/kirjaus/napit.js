// Ulkoiset napit: Bluetooth- tai USB-näppäin (tuomarin käsiohjain, esittelykaukosäädin, jalkapoljin) lähettää
// tavallisia näppäinpainalluksia, jotka kirjaus muuttaa merkinnöiksi. Näppäin tunnistetaan KeyboardEvent.code:sta,
// joten näppäimistön kieli ei vaikuta. Tuomarin käsiohjain (ESP32) lähettää x = OSUMA, o = NOLLA, p = PERU.
// Laitteen omat näppäimet opetetaan valikosta; ne tallentuvat tälle laitteelle (kaikille radoille).
export const TOIMINNOT = [
  { avain: 'X', nimi: 'OSUMA' },
  { avain: 'O', nimi: 'NOLLA' },
  { avain: 'PERU', nimi: 'PERU' }
];

// Oletukset: käsiohjaimen kirjaimet ja tavallisen esittelykaukosäätimen näppäimet (seuraava, edellinen, musta ruutu).
export const OLETUSNAPIT = {
  X: ['KeyX', 'PageDown'],
  O: ['KeyO', 'PageUp'],
  PERU: ['KeyP', 'KeyB', 'Period']
};

const AVAIN = 'kirjaus-napit';

// Painalluksen toiminto ('X', 'O', 'PERU') tai null. Pidetty näppäin (toisto), yhdistelmät ja kirjoitus
// tekstikenttään eivät ole merkintöjä.
export function toimintoNappaimesta(e, napit = OLETUSNAPIT) {
  if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey || kirjoituskentta(e.target)) return null;
  const toiminto = TOIMINNOT.find(({ avain }) => (napit[avain] || []).includes(e.code));
  return toiminto ? toiminto.avain : null;
}

function kirjoituskentta(kohde) {
  if (!kohde) return false;
  const tagi = kohde.tagName;
  return tagi === 'INPUT' || tagi === 'TEXTAREA' || tagi === 'SELECT' || Boolean(kohde.isContentEditable);
}

// Opetettu näppäin korvaa toiminnon näppäimet ja poistuu muilta toiminnoilta, ettei sama näppäin tee kahta asiaa.
export function opetaNappi(napit, toiminto, koodi) {
  const uudet = {};
  for (const { avain } of TOIMINNOT) {
    uudet[avain] = avain === toiminto ? [koodi] : (napit[avain] || []).filter((k) => k !== koodi);
  }
  return uudet;
}

// Näppäinkoodi luettavaksi: KeyX → X, Digit1 → 1, Period → ., PageDown → PageDown.
const MERKIT = { Period: '.', Comma: ',', Space: 'välilyönti' };
export function nappiTekstina(koodi) {
  return MERKIT[koodi] || String(koodi).replace(/^Key/, '').replace(/^Digit/, '');
}

export function lueNapit(varasto = globalThis.localStorage) {
  try {
    const tallessa = JSON.parse(varasto?.getItem(AVAIN) || 'null');
    if (!tallessa || typeof tallessa !== 'object') return OLETUSNAPIT;
    const napit = {};
    for (const { avain } of TOIMINNOT) {
      const koodit = tallessa[avain];
      napit[avain] = Array.isArray(koodit) ? koodit.filter((k) => typeof k === 'string') : OLETUSNAPIT[avain];
    }
    return napit;
  } catch {
    return OLETUSNAPIT;
  }
}

export function tallennaNapit(napit, varasto = globalThis.localStorage) {
  try {
    if (napit === OLETUSNAPIT) varasto?.removeItem(AVAIN);
    else varasto?.setItem(AVAIN, JSON.stringify(napit));
  } catch {
    // Tallennus estetty (yksityinen selaus): napit toimivat tämän käynnin ajan.
  }
}
