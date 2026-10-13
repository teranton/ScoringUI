// Selaimen oma välimuisti (localStorage): rekisteri ja viimeksi avattujen kisojen data.
// Tallennettu data näytetään heti, ja tuore haetaan taustalla. Kaikki virheet ohitetaan:
// sovellus toimii samoin ilman tallennustilaa (yksityinen ikkuna, täysi kiintiö).

const ETULIITE = 'scoringui:v1:';
const REKISTERI_AVAIN = `${ETULIITE}rekisteri`;
const KISA_ETULIITE = `${ETULIITE}kisa:`;
const INDEKSI_AVAIN = `${ETULIITE}kisaindeksi`;
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

// Tallennusajat erillisessä indeksissä, jotta karsinta ei jäsennä jokaisen kisan dataa.
function lueIndeksi(tallennus) {
  const indeksi = lue(tallennus, INDEKSI_AVAIN);
  const tulos = indeksi && typeof indeksi === 'object' ? { ...indeksi } : {};
  // Indeksistä puuttuvat (esim. rikkinäinen indeksi) karsitaan ensimmäisinä.
  for (const avain of kisaAvaimet(tallennus)) {
    const sheetId = avain.slice(KISA_ETULIITE.length);
    if (!(sheetId in tulos)) tulos[sheetId] = 0;
  }
  return tulos;
}

// Poistaa vanhimmat, kunnes kisoja on korkeintaan maks. Palauttaa päivitetyn indeksin.
function karsiVanhimmat(tallennus, indeksi, maks) {
  const jarjestys = Object.keys(indeksi).sort((a, b) => (Number(indeksi[a]) || 0) - (Number(indeksi[b]) || 0));
  while (jarjestys.length > maks) {
    const sheetId = jarjestys.shift();
    try {
      tallennus.removeItem(`${KISA_ETULIITE}${sheetId}`);
    } catch {
      break;
    }
    delete indeksi[sheetId];
  }
  return indeksi;
}

export function tallennaKisa(sheetId, data, tallennus = oletusTallennus(), nyt = Date.now()) {
  if (!tallennus || !sheetId) return;
  const avain = `${KISA_ETULIITE}${sheetId}`;
  const arvo = { data, tallennettu: nyt };
  let indeksi = lueIndeksi(tallennus);
  let tallennettu = kirjoita(tallennus, avain, arvo);
  // Kiintiö täynnä: poistetaan vanhimpia kisoja yksi kerrallaan, kunnes tallennus onnistuu.
  for (let jaljella = Object.keys(indeksi).length - 1; !tallennettu && jaljella >= 0; jaljella--) {
    delete indeksi[sheetId];
    indeksi = karsiVanhimmat(tallennus, indeksi, jaljella);
    tallennettu = kirjoita(tallennus, avain, arvo);
  }
  if (!tallennettu) return;
  indeksi[sheetId] = nyt;
  kirjoita(tallennus, INDEKSI_AVAIN, karsiVanhimmat(tallennus, indeksi, MAKS_KISOJA));
}
