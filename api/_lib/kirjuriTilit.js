// Kirjuripalvelutilin valinta. Googlen kiintiö (60 luku- ja 60 kirjoituspyyntöä minuutissa) on tilikohtainen, joten
// jokainen rata ja ryhmä käyttää aina samaa tiliä (tiiviste taulukosta ja radasta / ryhmästä), ja kisan laitteet
// jakautuvat tileille. Taulukko, jota ei ole vielä jaettu valitulle tilille, kirjoitetaan tilillä 1 (jaettu aina);
// täynnä olevan tilin (429) pyyntö yritetään kerran toisella tilillä.
import { createHash } from 'node:crypto';
import { onKiintioVirhe, pyyntoUudelleenyrittaen } from './googleAuth.js';

// Näin kauan muistetaan, ettei taulukkoa ole jaettu tilille (ScoringLib jakaa sen kaikille, kun koodit tehdään).
export const EI_JAETTU_MS = 10 * 60 * 1000;

const googleStatus = (error) => Number(error?.response?.status || error?.status || error?.code);
const googleViesti = (error) => JSON.stringify(error?.response?.data || error?.message || '');

// Tilillä ei ole pääsyä taulukkoon. Suojatun alueen torjunta (myös 403) ei ole jako-ongelma.
export function onPaasyVirhe(error) {
  const status = googleStatus(error);
  if (status === 404) return true;
  return status === 403 && !/protected/i.test(googleViesti(error));
}

// tunnus: rata (sarake) tai ryhmä ('r' + numero). Palauttaa tilin indeksin 0..maara-1.
export function kirjurinIndeksi(sheetId, tunnus, maara) {
  if (!(maara > 1)) return 0;
  const tiiviste = createHash('sha1').update(`${sheetId}|${tunnus}`).digest();
  return tiiviste.readUInt32BE(0) % maara;
}

export function luoKirjuriValitsin({ haeAsiakas, maara, nyt = () => Date.now() }) {
  const eiJaettu = new Map();
  const onEiJaettu = (sheetId, i) => {
    const aika = eiJaettu.get(`${sheetId}|${i}`);
    return aika !== undefined && nyt() - aika < EI_JAETTU_MS;
  };
  const yrita = async (i, opts) => {
    const asiakas = await haeAsiakas(i);
    return pyyntoUudelleenyrittaen((o) => asiakas.request(o), opts);
  };

  // Pyyntöfunktio yhdelle radalle tai ryhmälle.
  return function pyynto(sheetId, tunnus) {
    const ensisijainen = kirjurinIndeksi(sheetId, tunnus, maara);
    return async (opts) => {
      const i = onEiJaettu(sheetId, ensisijainen) ? 0 : ensisijainen;
      try {
        return await yrita(i, opts);
      } catch (error) {
        if (i !== 0 && onPaasyVirhe(error)) {
          eiJaettu.set(`${sheetId}|${i}`, nyt());
          return yrita(0, opts);
        }
        if (!onKiintioVirhe(error) || maara < 2) throw error;
        // Kiintiö täynnä uudelleenyrityksen jälkeenkin: seuraava tili, jolle taulukko on jaettu.
        const muut = Array.from({ length: maara - 1 }, (_, k) => (i + 1 + k) % maara).filter((j) => !onEiJaettu(sheetId, j));
        if (muut.length === 0) throw error;
        try {
          return await yrita(muut[0], opts);
        } catch (toinen) {
          if (muut[0] !== 0 && onPaasyVirhe(toinen)) eiJaettu.set(`${sheetId}|${muut[0]}`, nyt());
          throw onPaasyVirhe(toinen) ? error : toinen;
        }
      }
    };
  };
}
