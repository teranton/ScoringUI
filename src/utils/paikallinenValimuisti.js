// Selaimen oma välimuisti (localStorage): rekisteri ja viimeksi avattujen kisojen data.
// Tallennettu data näytetään heti, ja tuore haetaan taustalla. Kaikki virheet ohitetaan:
// sovellus toimii samoin ilman tallennustilaa (yksityinen ikkuna, täysi kiintiö).

const ETULIITE = 'scoringui:v1:';
const REKISTERI_AVAIN = `${ETULIITE}rekisteri`;
const KISA_ETULIITE = `${ETULIITE}kisa:`;
export const MAKS_KISOJA = 20;

function oletusTallennus() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function lue(tallennus, avain) {
  try {
    const raaka = tallennus?.getItem(avain);
    return raaka ? JSON.parse(raaka) : null;
  } catch {
    return null;
  }
}

function kirjoita(tallennus, avain, arvo) {
  try {
    tallennus?.setItem(avain, JSON.stringify(arvo));
    return true;
  } catch {
    return false;
  }
}

function kisaAvaimet(tallennus) {
  const avaimet = [];
  try {
    for (let i = 0; i < (tallennus?.length || 0); i++) {
      const avain = tallennus.key(i);
      if (avain?.startsWith(KISA_ETULIITE)) avaimet.push(avain);
    }
  } catch {
    // Ohitetaan.
  }
  return avaimet;
}

export function lueRekisteri(tallennus = oletusTallennus()) {
  const arvo = lue(tallennus, REKISTERI_AVAIN);
  return typeof arvo?.csv === 'string' ? arvo : null;
}

export function tallennaRekisteri(csv, tallennus = oletusTallennus(), nyt = Date.now()) {
  kirjoita(tallennus, REKISTERI_AVAIN, { csv, tallennettu: nyt });
}

// Palauttaa { [sheetId]: kisaData } kaikista tallennetuista kisoista.
export function lueKisat(tallennus = oletusTallennus()) {
  const kisat = {};
  for (const avain of kisaAvaimet(tallennus)) {
    const arvo = lue(tallennus, avain);
    if (arvo && typeof arvo.data === 'object' && arvo.data) {
      kisat[avain.slice(KISA_ETULIITE.length)] = arvo.data;
    }
  }
  return kisat;
}

// Poistaa vanhimmat, kunnes kisoja on korkeintaan maks.
function karsiVanhimmat(tallennus, maks) {
  const avaimet = kisaAvaimet(tallennus)
    .map((avain) => ({ avain, tallennettu: Number(lue(tallennus, avain)?.tallennettu) || 0 }))
    .sort((a, b) => a.tallennettu - b.tallennettu);
  while (avaimet.length > maks) {
    try {
      tallennus.removeItem(avaimet.shift().avain);
    } catch {
      return;
    }
  }
}

export function tallennaKisa(sheetId, data, tallennus = oletusTallennus(), nyt = Date.now()) {
  if (!tallennus || !sheetId) return;
  const avain = `${KISA_ETULIITE}${sheetId}`;
  const arvo = { data, tallennettu: nyt };
  if (kirjoita(tallennus, avain, arvo)) {
    karsiVanhimmat(tallennus, MAKS_KISOJA);
    return;
  }
  // Kiintiö täynnä: poistetaan vanhimpia kisoja yksi kerrallaan, kunnes tallennus onnistuu.
  for (let jaljella = kisaAvaimet(tallennus).length - 1; jaljella >= 0; jaljella--) {
    karsiVanhimmat(tallennus, jaljella);
    if (kirjoita(tallennus, avain, arvo)) return;
  }
}
