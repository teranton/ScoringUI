// Tulostettavat tulokset: kaikki sarjat peräkkäin tulostaulukon muodossa (TulosteTaulukko), sijoitukset samalla
// logiikalla kuin näytöllä.
import { KAIKKI_SARJAT, laskeNaytettavatRatkoIdt, onkoTulosta, ratkoPalkintoSijaOletus } from './henkiloTulokset.js';
import { HIGH_GUN, HIGH_GUN_OLETUS, highGunVoittajat, laskeSarjanSijoitukset, laskentaSarja, sarjanRatkoSija } from './highGun.js';
import { listaaSarjat, onkoRatkoNakyvissa } from './henkiloTaulukko.js';
import { sarjaNakyma, sarjanNimi } from './openSarja.js';

// Kaikkien ampujien osio, sama tunniste kuin näytön Y / Y (OPEN) -valinnassa. Sarjaa Y ei tulosteta erikseen.
export { KAIKKI_SARJAT };

const onkoArvo = (arvo) => String(arvo ?? '').trim() !== '';

// TulosteTaulukon sarakkeet { sarja, seura, la, su, ratko } tulostettavan sarjan ampujista, ettei sivulle jää
// tyhjiä sarakkeita (esim. Su ennen toista päivää).
export function laskeTulosteSarakkeet(ampujat, sarja, ratkoIdt) {
  return {
    sarja: sarja === KAIKKI_SARJAT || sarja === HIGH_GUN,
    seura: ampujat.some((a) => onkoArvo(a.seura)),
    la: ampujat.some((a) => onkoArvo(a.la)),
    su: ampujat.some((a) => onkoArvo(a.su)),
    ratko: ampujat.some((a) => onkoRatkoNakyvissa(a, ratkoIdt))
  };
}

// Palauttaa [{ sarja, nimi, ampujat, ratkoIdt, sarakkeet }] TulosteTaulukolle; nimi on otsikossa näkyvä sarja.
// Sarjat näytön sarjapainikkeiden järjestyksessä: ensin Y tai Y (OPEN) (paitsi luokkakilpailussa), sitten muut.
// openSarja on KISANSPEKSIT-asetus OPEN_SARJA tai null (päätellään sarjoista). highGun { paikat, poisSarjoista }:
// High Gun -osio yhteisen sarjan jälkeen, ja voittajat pois sarjoista, kun poisSarjoista. ampujat sijajärjestyksessä
// (laskeHenkilosijoitukset järjestää); ilman tulosta olevilla ei sijaa, ja ratko-sarake näyttää statuksen (DNS ...).
export function muodostaTulosteSarjat(ampujat, { ratkoSija = ratkoPalkintoSijaOletus, openSarja = null, highGun = HIGH_GUN_OLETUS } = {}) {
  if (!ampujat?.length) return [];
  const { yhteinenSarja, napit } = sarjaNakyma(listaaSarjat(ampujat), openSarja, highGun);
  const voittajat = highGunVoittajat(ampujat, highGun, ratkoSija);
  return napit.map((sarja) => {
    const sijoitetut = laskeSarjanSijoitukset(ampujat, sarja, ratkoSija, highGun, voittajat);
    const ratkoIdt = laskeNaytettavatRatkoIdt(sijoitetut, laskentaSarja(sarja), sarjanRatkoSija(sarja, ratkoSija, highGun));
    const sarjanAmpujat = sijoitetut.map((a) => (onkoTulosta(a) ? a : { ...a, laskettuSija: '' }));
    return { sarja, nimi: sarjanNimi(sarja, yhteinenSarja), ampujat: sarjanAmpujat, ratkoIdt, sarakkeet: laskeTulosteSarakkeet(sarjanAmpujat, sarja, ratkoIdt) };
  });
}
