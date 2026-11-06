// Kehitystila keskeneräisille ominaisuuksille. Päälle: ?dev=1 osoitteessa tai VITE_DEV_TILA=1.
// URL-parametri voittaa ympäristömuuttujan, joten ?dev=0 piilottaa ominaisuudet myös dev-buildissa.

export function tulkitseLippu(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

// Järjestäjän esikatselu: ?preview=1 (tai vanha ?showHidden=1) näyttää piilotetut kisat ja hakee kisan datan ohi
// välimuistien (api/rekisteri.js, api/kisa.js), jotta taulukkoon tehty muutos näkyy heti.
export function onkoEsikatselu(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const params = new URLSearchParams(search || '');
    return tulkitseLippu(params.get('preview') || params.get('showHidden')) === true;
  } catch {
    return false;
  }
}

export function onkoDevTila(search = typeof window !== 'undefined' ? window.location.search : '', envArvo = import.meta.env?.VITE_DEV_TILA) {
  try {
    const urlLippu = tulkitseLippu(new URLSearchParams(search || '').get('dev'));
    if (urlLippu !== null) return urlLippu;
  } catch {
    // Virheellinen osoite: käytetään ympäristömuuttujaa.
  }
  return tulkitseLippu(envArvo) === true;
}
