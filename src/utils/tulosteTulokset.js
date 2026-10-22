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

// Palauttaa [{ sarja, ampujat, ratkoIdt, sarakkeet }] TulosteTaulukolle. ampujat sijajärjestyksessä
// (laskeHenkilosijoitukset järjestää, ilman tulosta olevat lopussa);
// sarakkeet: { sarja, seura, la, su, ratko } sarjan omista tuloksista, ettei sivulle jää tyhjiä sarakkeita.
export function muodostaTulosteSarjat(ampujat, { ratkoSija = ratkoPalkintoSijaOletus } = {}) {
  if (!ampujat?.length) return [];
  return listaaTulosteSarjat(ampujat).map((sarja) => {
    const sijoitetut = laskeHenkilosijoitukset(ampujat, sarja, ratkoSija);
    const ratkoIdt = laskeNaytettavatRatkoIdt(sijoitetut, sarja, ratkoSija);
    const sarjanAmpujat = sijoitetut;
    return {
      sarja,
      ampujat: sarjanAmpujat,
      ratkoIdt,
      sarakkeet: {
        sarja: sarja === KAIKKI_SARJAT,
        seura: sarjanAmpujat.some((a) => String(a.seura || '').trim()),
        la: sarjanAmpujat.some((a) => a.la !== null),
        su: sarjanAmpujat.some((a) => a.su !== null),
        ratko: sarjanAmpujat.some((a) => onkoRatkoNakyvissa(a, ratkoIdt))
      }
    };
  });
}
