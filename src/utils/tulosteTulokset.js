// Tulostettavat tulokset: kaikki sarjat peräkkäin, sijoitukset samalla logiikalla kuin näytöllä.
import { KAIKKI_SARJAT, laskeHenkilosijoitukset, laskeNaytettavatRatkoIdt, ratkoPalkintoSijaOletus } from './henkiloTulokset.js';
import { listaaSarjat, onkoRatkoNakyvissa, parsiTaulukkoAmpujat } from './henkiloTaulukko.js';
import { paatteleOpenSarja, sarjaValinnat, sarjanNimi } from './openSarja.js';

// Kierrokset/asemat tulostetaan vain, jos niitä on alle tämän verran. Muuten päivät ja yhteistulos riittävät.
export const TULOSTE_ERIEN_MAKSIMI = 10;

// Kaikkien ampujien osio, sama tunniste kuin näytön Y / Y (OPEN) -valinnassa. Sarjaa Y ei tulosteta erikseen.
export { KAIKKI_SARJAT };

const onkoTulosta = (ampuja) => (parseInt(ampuja.tulos, 10) || 0) > 0;

function tulosteRivi(ampuja, eraNumerot, ratkoIdt) {
  const ratko = onkoRatkoNakyvissa(ampuja, ratkoIdt)
    ? [ampuja.ratkoNaytto.statusEtiketit.join('/'), ampuja.ratkoNaytto.teksti].filter(Boolean).join(' ')
    : '';
  return {
    id: ampuja.id,
    sija: ampuja.laskettuSija,
    nimi: ampuja.nimi,
    sarja: ampuja.sarja,
    seura: ampuja.seura,
    la: ampuja.la ?? '',
    su: ampuja.su ?? '',
    tulos: ampuja.tulos,
    erat: eraNumerot.map((n) => ampuja.erat[n] ?? ''),
    ratko
  };
}

// Palauttaa { sarjat: [{ sarja, nimi, rivit, eiTulosta, naytaRatko }], eraNumerot, naytaPaivat }.
// Ensin Y tai Y (OPEN) kaikkine ampujineen, sitten muut sarjat kuten näytöllä. Luokkakilpailussa
// (openSarja 'ei') vain luokat. openSarja on KISANSPEKSIT-asetus tai null (päätellään sarjoista).
// eiTulosta-ampujan status on '', jos taulukossa ei ole statuskoodia.
export function muodostaTulosteSarjat(raakaRivit, { ratojenMaara = 8, ratkoSija = ratkoPalkintoSijaOletus, openSarja = null } = {}) {
  // Sarjan välilyönnit pois, jotta laskeHenkilosijoitukset löytää ampujan sarjan nimellä.
  const ampujat = parsiTaulukkoAmpujat(raakaRivit, ratojenMaara)
    .map((a) => ({ ...a, sarja: String(a.sarja || '').trim() }));

  const kaikkiErat = Array.from(new Set(ampujat.flatMap((a) => Object.keys(a.erat).map(Number))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const eraNumerot = kaikkiErat.length < TULOSTE_ERIEN_MAKSIMI ? kaikkiErat : [];

  // Päiväsarakkeet vain, kun toiselta päivältä on tuloksia; muuten yhteistulos = päivän 1 tulos.
  const naytaPaivat = ampujat.some((a) => a.la !== null)
    && ampujat.some((a) => (parseInt(a.su, 10) || 0) > 0);

  const loydetytSarjat = listaaSarjat(ampujat);
  const yhteinenSarja = paatteleOpenSarja(openSarja, loydetytSarjat);
  const sarjaNimet = ampujat.length > 0 ? sarjaValinnat(loydetytSarjat, yhteinenSarja) : [];

  const sarjat = sarjaNimet.map((sarja) => {
    const sijoitetut = laskeHenkilosijoitukset(ampujat, sarja, ratkoSija);
    const ratkoIdt = laskeNaytettavatRatkoIdt(sijoitetut, sarja, ratkoSija);
    const rivit = sijoitetut.filter(onkoTulosta).map((a) => tulosteRivi(a, eraNumerot, ratkoIdt));
    // Ilman tulosta olevalle näytetään ratko-sarakkeen statuskoodi (DNS, DNF, DSQ, ...) kuten näytöllä.
    const eiTulosta = sijoitetut.filter((a) => !onkoTulosta(a)).map((a) => ({
      id: a.id,
      nimi: a.nimi,
      sarja: a.sarja,
      seura: a.seura,
      status: (a.ratkoNaytto?.statusEtiketit || []).join('/')
    }));
    return { sarja, nimi: sarjanNimi(sarja, yhteinenSarja), rivit, eiTulosta, naytaRatko: rivit.some((r) => r.ratko) };
  });

  return { sarjat, eraNumerot, naytaPaivat };
}
