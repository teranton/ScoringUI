// Kirjuripalvelutilin valinta. Googlen kiintiö (60 luku- ja 60 kirjoituspyyntöä minuutissa) on tilikohtainen, joten
// jokainen rata ja ryhmä käyttää aina samaa tiliä, ja kisan radat (ryhmät) jakautuvat tileille tasan: numero + taulukon
// tiiviste kiertää tilit. Tili 1 on jaettu kaikkiin mobiilikirjauskisoihin, joten lisätili, jolle taulukkoa ei ole
// jaettu tai jonka tunnukset eivät toimi, korvataan sillä. Täynnä olevan tilin (429) pyyntö siirtyy toiselle tilille.
import { createHash } from 'node:crypto';
import { googleStatus, googleViesti, onKiintioVirhe, pyyntoUudelleenyrittaen } from './googleAuth.js';

// Näin kauan muistetaan, ettei lisätiliä voi käyttää taulukkoon (ScoringLib jakaa sen, kun koodit näytetään).
export const EI_KAYTETTAVISSA_MS = 10 * 60 * 1000;

const onSuojattu = (error) => googleStatus(error) === 403 && /protected/i.test(googleViesti(error));

// Tilillä ei ole pääsyä taulukkoon. Suojatun alueen torjunta (myös 403) ei ole jako-ongelma.
export function onPaasyVirhe(error) {
  const status = googleStatus(error);
  if (status === 404) return true;
  return status === 403 && !onSuojattu(error);
}

// Tilin tunnukset eivät kelpaa (avain rikki, tili poistettu): token-haun virhe tai 401.
function onTunnusVirhe(error) {
  return error?.tunnusVirhe === true || googleStatus(error) === 401 || /invalid_grant|invalid_client/i.test(googleViesti(error));
}

// numero: rata (tulossarake) tai ryhmä. Palauttaa tilin indeksin 0..maara-1.
export function kirjurinIndeksi(sheetId, numero, maara) {
  if (!(maara > 1)) return 0;
  const siirto = createHash('sha1').update(String(sheetId)).digest().readUInt32BE(0) % maara;
  return (siirto + (Number(numero) || 0)) % maara;
}

export function luoKirjuriValitsin({ haeAsiakas, maara, nyt = () => Date.now() }) {
  const eiKaytettavissa = new Map();
  const merkitse = (sheetId, i) => eiKaytettavissa.set(`${sheetId}|${i}`, nyt());
  const kaytettavissa = (sheetId, i) => {
    const avain = `${sheetId}|${i}`;
    const aika = eiKaytettavissa.get(avain);
    if (aika === undefined) return true;
    if (nyt() - aika < EI_KAYTETTAVISSA_MS) return false;
    eiKaytettavissa.delete(avain);
    return true;
  };
  // Yhdellä tilillä 429 yritetään kerran uudelleen samalla tilillä; useammalla siirrytään heti toiselle.
  const yrita = async (i, opts, uudelleen) => {
    let asiakas;
    try {
      asiakas = await haeAsiakas(i);
    } catch (error) {
      throw Object.assign(error, { tunnusVirhe: true });
    }
    const kutsu = (o) => asiakas.request(o);
    return uudelleen ? pyyntoUudelleenyrittaen(kutsu, opts) : kutsu(opts);
  };

  // Lisätili ei käy tähän taulukkoon: tili 1 (jaettu aina). Suojattu alue voi sallia vain tilin 1, joten sekin
  // yritetään tilillä 1, mutta tiliä ei merkitä käyttökelvottomaksi.
  const tilillaYksi = async (sheetId, i, opts, error) => {
    if (i === 0 || !(onPaasyVirhe(error) || onTunnusVirhe(error) || onSuojattu(error))) throw error;
    if (!onSuojattu(error)) merkitse(sheetId, i);
    return yrita(0, opts, true);
  };

  // Pyyntöfunktio yhdelle radalle tai ryhmälle.
  return function pyynto(sheetId, numero) {
    const ensisijainen = kirjurinIndeksi(sheetId, numero, maara);
    return async (opts) => {
      const i = kaytettavissa(sheetId, ensisijainen) ? ensisijainen : 0;
      try {
        return await yrita(i, opts, maara < 2);
      } catch (error) {
        if (!onKiintioVirhe(error)) return tilillaYksi(sheetId, i, opts, error);
        if (maara < 2) throw error;
        // Kiintiö täynnä: seuraava käytettävissä oleva tili (uudelleenyrityksellä).
        const j = Array.from({ length: maara - 1 }, (_, k) => (i + 1 + k) % maara).find((t) => kaytettavissa(sheetId, t));
        if (j === undefined) throw error;
        try {
          return await yrita(j, opts, true);
        } catch (toinen) {
          if (j !== 0 && (onPaasyVirhe(toinen) || onTunnusVirhe(toinen))) {
            merkitse(sheetId, j);
            throw error;
          }
          throw toinen;
        }
      }
    };
  };
}
