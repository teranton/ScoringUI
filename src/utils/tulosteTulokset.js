// Tulostettavat tulokset: kaikki sarjat peräkkäin tulostaulukon muodossa (TulosteTaulukko), sijoitukset samalla
// logiikalla kuin näytöllä.
import { laskeHenkilosijoitukset, laskeNaytettavatRatkoIdt, ratkoPalkintoSijaOletus } from './henkiloTulokset.js';
import { listaaSarjat, onkoRatkoNakyvissa } from './henkiloTaulukko.js';

// Kaikkien ampujien osio, sama tunniste kuin näytön OPEN (Y) -valinnassa. Sarjaa Y ei tulosteta erikseen.
export const KAIKKI_SARJAT = 'OPEN (Y)';

// Sarjat siinä järjestyksessä kuin näytön sarjapainikkeet: ensin OPEN (Y), sitten muut ilman Y-sarjaa.
export function listaaTulosteSarjat(ampujat) {
  return [KAIKKI_SARJAT, ...listaaSarjat(ampujat).filter((sarja) => sarja.toUpperCase() !== 'Y')];
}

const onkoTulosta = (ampuja) => (parseInt(ampuja.kokonaistulos ?? ampuja.tulos, 10) || 0) > 0;
const onkoArvo = (arvo) => String(arvo ?? '').trim() !== '';

// TulosteTaulukon sarakkeet { sarja, seura, la, su, ratko } tulostettavan sarjan ampujista, ettei sivulle jää
// tyhjiä sarakkeita (esim. Su ennen toista päivää).
export function laskeTulosteSarakkeet(ampujat, sarja, ratkoIdt) {
  return {
    sarja: sarja === KAIKKI_SARJAT,
    seura: ampujat.some((a) => onkoArvo(a.seura)),
    la: ampujat.some((a) => onkoArvo(a.la)),
    su: ampujat.some((a) => onkoArvo(a.su)),
    ratko: ampujat.some((a) => onkoRatkoNakyvissa(a, ratkoIdt))
  };
}

// Palauttaa [{ sarja, ampujat, ratkoIdt, sarakkeet }] TulosteTaulukolle. ampujat sijajärjestyksessä
// (laskeHenkilosijoitukset järjestää); ilman tulosta olevilla ei sijaa, ja ratko-sarake näyttää statuksen (DNS ...).
export function muodostaTulosteSarjat(ampujat, { ratkoSija = ratkoPalkintoSijaOletus } = {}) {
  if (!ampujat?.length) return [];
  return listaaTulosteSarjat(ampujat).map((sarja) => {
    const sijoitetut = laskeHenkilosijoitukset(ampujat, sarja, ratkoSija);
    const ratkoIdt = laskeNaytettavatRatkoIdt(sijoitetut, sarja, ratkoSija);
    const sarjanAmpujat = sijoitetut.map((a) => (onkoTulosta(a) ? a : { ...a, laskettuSija: '' }));
    return { sarja, ampujat: sarjanAmpujat, ratkoIdt, sarakkeet: laskeTulosteSarakkeet(sarjanAmpujat, sarja, ratkoIdt) };
  });
}
