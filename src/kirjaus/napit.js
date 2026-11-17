// Ulkoiset napit: Bluetooth- tai USB-näppäin (tuomarin käsiohjain, esittelykaukosäädin, jalkapoljin) lähettää
// tavallisia näppäinpainalluksia, jotka kirjaus muuttaa merkinnöiksi. Näppäin tunnistetaan KeyboardEvent.code:sta,
// joten näppäimistön kieli ei vaikuta. Tuomarin käsiohjain (ESP32) lähettää x = OSUMA, o = NOLLA, p = PERU.
// Laitteen omat näppäimet opetetaan valikosta; ne tallentuvat tälle laitteelle (kaikille radoille, varasto.js).
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

// Painalluksen toiminto ('X', 'O', 'PERU') tai null. Pidetty näppäin (toisto), yhdistelmät ja kirjoitus
// tekstikenttään eivät ole merkintöjä.
export function toimintoNappaimesta(e, napit = OLETUSNAPIT) {
  if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey || kirjoituskentta(e.target)) return null;
  const toiminto = TOIMINNOT.find(({ avain }) => (napit[avain] || []).includes(e.code));
  return toiminto ? toiminto.avain : null;
}

export function kirjoituskentta(kohde) {
  if (!kohde) return false;
  const tagi = kohde.tagName;
  return tagi === 'INPUT' || tagi === 'TEXTAREA' || tagi === 'SELECT' || Boolean(kohde.isContentEditable);
}

// Opetettu näppäin lisätään toiminnolle ja poistetaan muilta, ettei sama näppäin tee kahta asiaa. Toiminnon muut
// näppäimet jäävät, joten esim. kaukosäätimen opettaminen ei poista käsiohjaimen kirjainta.
// Palauttaa null, jos näppäintä ei voi käyttää (selain ei kerro koodia).
export function opetaNappi(napit, toiminto, koodi) {
  if (!koodi || koodi === 'Unidentified') return null;
  const uudet = {};
  for (const { avain } of TOIMINNOT) {
    const muut = (napit[avain] || []).filter((k) => k !== koodi);
    uudet[avain] = avain === toiminto ? [...muut, koodi] : muut;
  }
  return uudet;
}

export const onOletus = (napit) => TOIMINNOT.every(({ avain }) =>
  (napit[avain] || []).join() === OLETUSNAPIT[avain].join());

// Näppäinkoodi luettavaksi: KeyX → X, Digit1 → 1, Period → ., PageDown → PageDown.
const MERKIT = { Period: '.', Comma: ',', Space: 'välilyönti' };
export function nappiTekstina(koodi) {
  return MERKIT[koodi] || String(koodi).replace(/^Key/, '').replace(/^Digit/, '');
}

// Laitteelle tallennetut napit (varasto.js). Puuttuva toiminto saa oletuksensa ilman jo käytettyjä näppäimiä.
export function jasennaNapit(tallessa) {
  if (!tallessa || typeof tallessa !== 'object') return OLETUSNAPIT;
  const napit = {};
  for (const { avain } of TOIMINNOT) {
    const koodit = tallessa[avain];
    if (Array.isArray(koodit)) napit[avain] = koodit.filter((k) => typeof k === 'string' && k && k !== 'Unidentified');
  }
  const kaytetyt = new Set(Object.values(napit).flat());
  for (const { avain } of TOIMINNOT) {
    if (!napit[avain]) napit[avain] = OLETUSNAPIT[avain].filter((k) => !kaytetyt.has(k));
  }
  return napit;
}
