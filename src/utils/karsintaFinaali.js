// Karsinnan jälkeinen finaali tulosvälilehden FINAALI-sarakkeessa (esim. Compakin top-6-finaali). Finaali alkaa
// nollasta: kaikkien ampujien näkymässä ja High Gunissa finaalin ampuneet ovat ensin finaalin tuloksen mukaan
// (tasatuloksen ratkaisee RATKO), muut karsinnan mukaan; sarjojen sijoitukset ovat karsinnan (TULOS) mukaan
// (henkiloTulokset.js: sijoitusPisteet). Pudotuspelikaavio (FINAALI-välilehti) on eri asia.

// Normalisoitu otsikko (A-Z0-9): FINAALI tai FINAL.
const onFinaaliOtsikko = (otsikko) => otsikko === 'FINAALI' || otsikko === 'FINAL';

export function etsiFinaaliSarake(otsikotNormalisoitu) {
  return (otsikotNormalisoitu || []).findIndex((o) => onFinaaliOtsikko(String(o || '')));
}

// Toinen ratkosarake on RATKOn oikealla puolella, paitsi jos siinä on finaali. -1 = ei saraketta.
export const ratko2Sarake = (idxRatko, idxFinaali) => (idxRatko === -1 || idxRatko + 1 === idxFinaali ? -1 : idxRatko + 1);
// RATKO-sarake ei voi olla FINAALI-sarake (otsikoton RATKO arvataan asemien perään, missä finaali voi olla).
export const ratkoSarake = (idxRatko, idxFinaali) => (idxRatko === idxFinaali ? -1 : idxRatko);

const kokonaisluku = (arvo) => {
  const teksti = String(arvo ?? '').trim();
  return /^-?\d+$/.test(teksti) ? Number(teksti) : null;
};

// Aseman solun pisteet kuten taulukon kaava ne laskee: alkava luku ('24*' = 24), muu (tyhjä, DNF, -) = 0.
const asemanPisteet = (arvo) => Number.parseInt(String(arvo ?? '').trim(), 10) || 0;

// { tulos, finaali }: tulos on karsinnan tulos. Jos sheetin TULOS on asemien summa + finaali (kaava laskee finaalin
// mukaan), finaali vähennetään. asemat: asemien solut. finaali on finaalin tulos: tyhjä, kun solussa ei ole lukua
// tai luku on 0 (kaava antaa finaalia ampumattomille 0 tai -).
export function erotaFinaali(tulos, finaali, asemat = []) {
  const finaaliLuku = kokonaisluku(finaali);
  const tulosLuku = kokonaisluku(tulos);
  if (finaaliLuku === null || tulosLuku === null) return { tulos, finaali: '' };

  const naytettava = finaaliLuku > 0 ? String(finaaliLuku) : '';
  const asemaSumma = asemat.reduce((s, arvo) => s + asemanPisteet(arvo), 0);
  if (finaaliLuku !== 0 && asemat.length > 0 && tulosLuku === asemaSumma + finaaliLuku) {
    return { tulos: String(tulosLuku - finaaliLuku), finaali: naytettava };
  }
  return { tulos: String(tulosLuku), finaali: naytettava };
}

// Asemasarakkeet: otsikosta 1 alkava yhtenäinen numero-otsikoiden jakso (kuten parsiTaulukkoAmpujat).
function asemaSarakkeet(otsikotNormalisoitu) {
  const otsikot = (otsikotNormalisoitu || []).map((o) => String(o || ''));
  const alku = otsikot.indexOf('1');
  const sarakkeet = [];
  for (let i = alku; alku !== -1 && i < otsikot.length && /^\d+$/.test(otsikot[i]); i++) sarakkeet.push(i);
  return sarakkeet;
}

// Ampujan rivin tulos ja finaali, sama kortti- ja taulukkonäkymälle. Ilman FINAALI-saraketta finaali on null ja
// tulos sheetin TULOS.
export function rivinTulos(rivi, otsikotNormalisoitu, idxTulos, idxFinaali) {
  const tulos = rivi[idxTulos] || '0';
  if (idxFinaali === -1) return { tulos, finaali: null };
  return erotaFinaali(tulos, rivi[idxFinaali], asemaSarakkeet(otsikotNormalisoitu).map((i) => rivi[i]));
}
