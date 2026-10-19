// Compak inline -linja: ampujat tulevat radalle aikataulun järjestyksessä ja etenevät asemat 1–5.
// Kierros: linjalla olevat ampujat ampuvat vuorotellen yhden sarjan (yksittäinen = 1 kiekko, tupla = 2)
// aseman ohjelman mukaan, asemajärjestyksessä 1 → 5, kunnes kaikki ovat ampuneet asemansa 5 kiekkoa.
// Sitten kaikki siirtyvät asemaa eteenpäin, asemalta 5 poistutaan ja jonon seuraava tulee asemalle 1.
// Tauko (laitteelta tai aikataulun TAUKO-rivi): seuraava ei tule linjaan ennen kuin linja on tyhjä.
// Koko päivän vuorot lasketaan jonosta ja ohjelmasta, joten seuraava vuoro selviää pelkistä merkinnöistä
// (myös uudelleenlatauksen, perumisen ja toisen laitteen merkintöjen jälkeen).
import { ASEMAN_KOHTEET, KOHTEITA, merkitOf } from './kortit.js';

export const ASEMIA = KOHTEITA / ASEMAN_KOHTEET;
const SARJAT = { S: 1, Y: 1, D: 2, T: 2 };

// Valmiit asemaohjelmat (yksittäiset ensin): 5 yksittäistä, 3 + tupla, 1 + 2 tuplaa.
export const ASEMAVAIHTOEHDOT = [[1, 1, 1, 1, 1], [1, 1, 1, 2], [1, 2, 2]];

const asemaKelpaa = (sarjat) => sarjat.length > 0 && sarjat.reduce((s, n) => s + n, 0) === ASEMAN_KOHTEET;

// "SSD | SDD | SSSD | SDD | SSSSS" (S/Y yksittäinen, D/T tupla; erottimena | , ; / tai välilyönti asemien välissä).
// Yksi asema käy kaikille asemille. Palauttaa [[1, 1, ...], ...] (ASEMIA asemaa) tai null.
export function jasennaOhjelma(teksti) {
  const puhdas = String(teksti || '').toUpperCase().trim();
  if (!puhdas) return null;
  let osat = puhdas.split(/[|,;/]+/).map((o) => o.trim()).filter(Boolean);
  if (osat.length === 1 && osat[0].split(/\s+/).length === ASEMIA) osat = osat[0].split(/\s+/);
  const asemat = osat.map((osa) => [...osa.replace(/[\s+]/g, '')].map((m) => SARJAT[m] || 0));
  if (!asemat.every((a) => a.every((n) => n > 0) && asemaKelpaa(a))) return null;
  if (asemat.length === 1) return Array.from({ length: ASEMIA }, () => [...asemat[0]]);
  return asemat.length === ASEMIA ? asemat : null;
}

export const asemaTekstiksi = (sarjat) => sarjat.map((n) => (n === 2 ? 'D' : 'S')).join('');
export const ohjelmaTekstiksi = (ohjelma) => ohjelma.map(asemaTekstiksi).join(' | ');

// Radan jono lisäysten ja ohitusten jälkeen. lisatyt: [{ nro, nimi, jalkeen }] lisätään jalkeen-numeron perään
// (samaan kohtaan lisätyt lisäysjärjestyksessä); jalkeen null = alkuun, puuttuva = loppuun.
export function radanLinjajono(jono, { lisatyt = [], ohitetut = [] } = {}) {
  const lisatytNrot = new Set(lisatyt.map((l) => l.nro));
  const ohi = new Set(ohitetut);
  const tulos = jono.filter((a) => !lisatytNrot.has(a.nro));
  const samaanKohtaan = new Map();
  lisatyt.forEach((l) => {
    // Jonosta siirretty (esim. ohitettu, joka saapui myöhemmin) pitää nimensä.
    const jonossa = jono.find((a) => a.nro === l.nro);
    const ampuja = { nro: l.nro, nimi: jonossa?.nimi || l.nimi || '', aika: '' };
    const ankkuri = l.jalkeen === null ? 0 : tulos.findIndex((a) => a.nro === l.jalkeen) + 1;
    if (l.jalkeen === undefined || ankkuri === 0 && l.jalkeen !== null) {
      tulos.push(ampuja);
      return;
    }
    const aiemmat = samaanKohtaan.get(l.jalkeen) || new Set();
    let paikka = ankkuri;
    while (paikka < tulos.length && aiemmat.has(tulos[paikka].nro)) paikka++;
    tulos.splice(paikka, 0, ampuja);
    samaanKohtaan.set(l.jalkeen, aiemmat.add(l.nro));
  });
  return tulos.filter((a) => !ohi.has(a.nro));
}

// Koko päivän vuorot: [{ nro, asema (0..4), kierros, alku, loppu }] (kohteet alku..loppu-1 kortilla).
// tauot: numerot, joiden edellä linja tyhjennetään (lisäksi jonon taukoEnnen-merkinnät).
export function laskeVuorot(jono, ohjelma, tauot = []) {
  const tauko = new Set(tauot);
  const vuorot = [];
  let linja = [];
  let seuraava = 0;
  let kierros = 0;
  while (seuraava < jono.length || linja.length > 0) {
    const tulija = jono[seuraava];
    if (tulija && !(linja.length > 0 && (tauko.has(tulija.nro) || tulija.taukoEnnen))) {
      linja.push({ nro: tulija.nro, asema: 0 });
      seuraava++;
    }
    const jarjestys = [...linja].sort((a, b) => a.asema - b.asema);
    const pisin = Math.max(...jarjestys.map((a) => ohjelma[a.asema].length));
    for (let sarja = 0; sarja < pisin; sarja++) {
      jarjestys.forEach(({ nro, asema }) => {
        const sarjat = ohjelma[asema];
        if (sarja >= sarjat.length) return;
        const alku = asema * ASEMAN_KOHTEET + sarjat.slice(0, sarja).reduce((s, n) => s + n, 0);
        vuorot.push({ nro, asema, kierros, alku, loppu: alku + sarjat[sarja] });
      });
    }
    kierros++;
    linja = linja.map((a) => ({ ...a, asema: a.asema + 1 })).filter((a) => a.asema < ASEMIA);
  }
  return vuorot;
}

const vuoroValmis = (vuoro, kortit) => {
  const merkit = merkitOf(kortit, vuoro.nro);
  for (let i = vuoro.alku; i < vuoro.loppu; i++) if (merkit[i] === '-') return false;
  return true;
};

// Tilanne merkinnöistä: ensimmäinen vuoro, jonka kiekot eivät ole kaikki merkitty.
// Palauttaa { vuoro, kohta: { nro, i }, linja: [{ nro, asema }] } tai null (kaikki ammuttu).
export function linjanTilanne(vuorot, kortit) {
  const indeksi = vuorot.findIndex((v) => !vuoroValmis(v, kortit));
  if (indeksi === -1) return null;
  const vuoro = vuorot[indeksi];
  const merkit = merkitOf(kortit, vuoro.nro);
  let i = vuoro.alku;
  while (merkit[i] !== '-') i++;

  const linja = [];
  const nahty = new Set();
  for (const v of vuorot) {
    if (v.kierros > vuoro.kierros) break;
    if (v.kierros === vuoro.kierros && !nahty.has(v.nro)) {
      nahty.add(v.nro);
      linja.push({ nro: v.nro, asema: v.asema });
    }
  }
  linja.sort((a, b) => a.asema - b.asema);
  return { vuoro, kohta: { nro: vuoro.nro, i }, linja };
}

// Ampujat, jotka eivät ole vielä tulleet linjaan nykyisellä kierroksella tai aiemmin (jonon järjestyksessä).
export function tulevatAmpujat(jono, vuorot, kierros) {
  const tulleet = new Set(vuorot.filter((v) => v.kierros <= kierros).map((v) => v.nro));
  return jono.filter((a) => !tulleet.has(a.nro));
}
