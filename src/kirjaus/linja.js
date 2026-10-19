// Compak inline -linja: ampujat tulevat radalle aikataulun järjestyksessä ja etenevät asemat 1–5.
// Kierros: linjalla olevat ampujat ampuvat vuorotellen yhden sarjan (yksittäinen = 1 kiekko, tupla = 2)
// radan ohjelman mukaan, asemajärjestyksessä 1 → 5, kunnes kaikki ovat ampuneet asemansa 5 kiekkoa.
// Sitten kaikki siirtyvät asemaa eteenpäin, asemalta 5 poistutaan ja jonon seuraava tulee asemalle 1.
// Tauko (laitteelta tai aikataulun TAUKO-rivi): seuraava ei tule linjaan ennen kuin linja on tyhjä.
// Koko päivän vuorot lasketaan jonosta, ohjelmasta ja laitteen muutoksista (lisätyt, ohitetut, tauot,
// keskeyttäneet), joten seuraava vuoro selviää merkinnöistä myös uudelleenlatauksen ja perumisen jälkeen.
// Laitteen muutokset ovat vain tällä laitteella; laitteen vaihto on oma vaiheensa (design-dokumentin vaihe 4).
import { ASEMAN_KOHTEET, KOHTEITA, merkitOf } from './kortit.js';

export const ASEMIA = KOHTEITA / ASEMAN_KOHTEET;
const SARJAT = { S: 1, Y: 1, D: 2, T: 2 };

// Radan ohjelma on sama kaikilla asemilla, yksittäiset aina ennen tuplia: 3 + tupla, 1 + 2 tuplaa tai 5 yksittäistä.
export const OHJELMAT = [[1, 1, 1, 2], [1, 2, 2], [1, 1, 1, 1, 1]];

export const ohjelmaTekstiksi = (sarjat) => sarjat.map((n) => (n === 2 ? 'D' : 'S')).join('');

// "SSSD", "S S S D", "SDD", "YTT" (S/Y yksittäinen, D/T tupla) → [1, 1, 1, 2] tai null.
export function jasennaOhjelma(teksti) {
  const sarjat = [...String(teksti || '').toUpperCase().replace(/[\s+]/g, '')].map((m) => SARJAT[m] || 0);
  const tunnettu = OHJELMAT.find((o) => o.length === sarjat.length && o.every((n, i) => n === sarjat[i]));
  return tunnettu || null;
}

// Radan jono lisäysten ja ohitusten jälkeen.
// lisatyt: [{ nro, nimi, jalkeen, kierroksesta }] lisätään jalkeen-numeron perään (samaan kohtaan lisätyt
// lisäysjärjestyksessä; jalkeen null = alkuun, puuttuva tai jonosta puuttuva = loppuun). kierroksesta: lisätty
// tulee linjaan aikaisintaan sillä kierroksella, ettei jo ammuttu kierros muutu.
// Jonosta poistetun (ohitettu tai siirretty) aikataulun tauko siirtyy seuraavalle.
export function radanLinjajono(jono, { lisatyt = [], ohitetut = [] } = {}) {
  const lisatytNrot = new Set(lisatyt.map((l) => l.nro));
  const ohi = new Set(ohitetut);
  const tulos = [];
  let tauko = false;
  jono.forEach((a) => {
    if (lisatytNrot.has(a.nro) || ohi.has(a.nro)) {
      tauko = tauko || Boolean(a.taukoEnnen);
      return;
    }
    tulos.push(tauko ? { ...a, taukoEnnen: true } : a);
    tauko = false;
  });

  const samaanKohtaan = new Map();
  let odottavat = lisatyt.filter((l) => !ohi.has(l.nro));
  // Ankkuri voi olla myöhemmin lisätty: kierretään, kunnes mikään ei enää löydä paikkaansa.
  for (let edistyi = true; edistyi && odottavat.length > 0;) {
    edistyi = false;
    odottavat = odottavat.filter((l) => {
      const ankkuri = l.jalkeen === null ? 0 : tulos.findIndex((a) => a.nro === l.jalkeen) + 1;
      if (l.jalkeen === undefined || (l.jalkeen !== null && ankkuri === 0)) return true;
      const aiemmat = samaanKohtaan.get(l.jalkeen) || new Set();
      let paikka = ankkuri;
      while (paikka < tulos.length && aiemmat.has(tulos[paikka].nro)) paikka++;
      tulos.splice(paikka, 0, lisattava(jono, l));
      samaanKohtaan.set(l.jalkeen, aiemmat.add(l.nro));
      edistyi = true;
      return false;
    });
  }
  odottavat.forEach((l) => tulos.push(lisattava(jono, l)));
  return tulos;
}

// Jonosta siirretty (esim. ohitettu, joka saapui myöhemmin) pitää nimensä.
function lisattava(jono, l) {
  const jonossa = jono.find((a) => a.nro === l.nro);
  return { nro: l.nro, nimi: jonossa?.nimi || l.nimi || '', aika: '', aikaisintaan: l.kierroksesta || 0 };
}

// Koko päivän vuorot: [{ nro, asema (0..4), kierros, alku, loppu }] (kohteet alku..loppu-1 kortilla).
// ohjelma: aseman sarjat, esim. [1, 1, 1, 2]. Jonon taukoEnnen tyhjentää linjan ennen ampujaa.
export function laskeVuorot(jono, ohjelma) {
  const vuorot = [];
  let linja = [];
  let seuraava = 0;
  let kierros = 0;
  while (seuraava < jono.length || linja.length > 0) {
    const tulija = jono[seuraava];
    if (tulija && (linja.length === 0 || (!tulija.taukoEnnen && (tulija.aikaisintaan || 0) <= kierros))) {
      linja.push({ nro: tulija.nro, asema: 0 });
      seuraava++;
    }
    const jarjestys = [...linja].sort((a, b) => a.asema - b.asema);
    ohjelma.forEach((kiekkoja, sarja) => {
      const alku = ohjelma.slice(0, sarja).reduce((s, n) => s + n, 0);
      jarjestys.forEach(({ nro, asema }) => {
        const kohde = asema * ASEMAN_KOHTEET + alku;
        vuorot.push({ nro, asema, kierros, alku: kohde, loppu: kohde + kiekkoja });
      });
    });
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

// Tilanne merkinnöistä: ensimmäinen vuoro, jonka kiekot eivät ole kaikki merkitty (keskeyttäneiden vuorot ohitetaan).
// Palauttaa { vuoro, kohta: { nro, i }, linja: [{ nro, asema }] } tai null (kaikki ammuttu).
export function linjanTilanne(vuorot, kortit, keskeyttaneet = []) {
  const pois = new Set(keskeyttaneet);
  const indeksi = vuorot.findIndex((v) => !pois.has(v.nro) && !vuoroValmis(v, kortit));
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
