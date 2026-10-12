// Tulostettavat tulokset: kaikki sarjat peräkkäin, sijoitukset samalla logiikalla kuin näytöllä.
import { laskeHenkilosijoitukset, laskeNaytettavatRatkoIdt, ratkoPalkintoSijaOletus } from './henkiloTulokset.js';
import { parsiTaulukkoAmpujat } from './henkiloTaulukko.js';

// Kierrokset/asemat tulostetaan vain, jos niitä on alle tämän verran. Muuten päivät ja yhteistulos riittävät.
export const TULOSTE_ERIEN_MAKSIMI = 10;

const onkoTulosta = (ampuja) => (parseInt(ampuja.tulos, 10) || 0) > 0;
const onkoArvo = (arvo) => arvo !== null && arvo !== undefined && String(arvo).trim() !== '';

export function muodostaTulosteSarjat(raakaRivit, { ratojenMaara = 8, ratkoSija = ratkoPalkintoSijaOletus } = {}) {
  const ampujat = parsiTaulukkoAmpujat(raakaRivit, ratojenMaara);

  const eraNumerot = Array.from(new Set(ampujat.flatMap((a) => Object.keys(a.erat).map(Number))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const tulostettavatErat = eraNumerot.length < TULOSTE_ERIEN_MAKSIMI ? eraNumerot : [];

  // Päiväsarakkeet vain, kun toiselta päivältä on tuloksia; muuten yhteistulos = päivän 1 tulos.
  const naytaPaivat = ampujat.some((a) => a.la !== null)
    && ampujat.some((a) => (parseInt(a.su, 10) || 0) > 0);

  const sarjaNimet = Array.from(new Set(ampujat.map((a) => String(a.sarja || '').trim()).filter(Boolean))).sort();

  const sarjat = sarjaNimet.map((sarja) => {
    const sijoitetut = laskeHenkilosijoitukset(ampujat, sarja, ratkoSija);
    const ratkoIdt = laskeNaytettavatRatkoIdt(sijoitetut, sarja, ratkoSija);
    const rivit = sijoitetut.filter(onkoTulosta).map((a) => {
      const ratkoNakyvissa = ratkoIdt.has(a.id) || (a.ratkoNaytto?.statusEtiketit?.length || 0) > 0;
      const ratkoOsat = ratkoNakyvissa
        ? [...(a.ratkoNaytto?.statusEtiketit || []), a.ratkoNaytto?.teksti].filter(Boolean)
        : [];
      return {
        id: a.id,
        sija: a.laskettuSija,
        nimi: a.nimi,
        seura: a.seura,
        la: a.la ?? '',
        su: a.su ?? '',
        tulos: a.tulos,
        erat: tulostettavatErat.map((n) => a.erat[n] ?? ''),
        ratko: ratkoOsat.join(' ')
      };
    });
    const eiTulosta = sijoitetut.filter((a) => !onkoTulosta(a)).map((a) => ({ id: a.id, nimi: a.nimi, seura: a.seura }));
    return {
      sarja,
      rivit,
      eiTulosta,
      naytaRatko: rivit.some((r) => onkoArvo(r.ratko))
    };
  });

  return { sarjat, eraNumerot: tulostettavatErat, naytaPaivat };
}
