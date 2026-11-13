// Mobiilikirjauksen korttilogiikka (Compak): merkinnät, seuraava kohde, peruutus ja synkronoinnin yhdistäminen.
// Kortti: { merkit: 25 merkkiä X/O/-, versio: kasvava luku, lahetetty: onko tämä versio tallessa taulukossa,
// tapahtumat: toimintahäiriöt, varoitukset ja vähennykset tekstinä (tapahtumat.js; puuttuu = ei tapahtumia) }.
import { hairiot, lisaa } from './tapahtumat.js';

export const KOHTEITA = 25;
export const ASEMAN_KOHTEET = 5;
export const MAKS_HISTORIA = 200;

export const tyhjatMerkit = () => '-'.repeat(KOHTEITA);
export const merkitOf = (kortit, nro) => kortit[nro]?.merkit || tyhjatMerkit();
export const taytetyt = (merkit) => [...merkit].filter((m) => m !== '-').length;
export const osumat = (merkit) => [...merkit].filter((m) => m === 'X').length;
export const onValmis = (merkit) => taytetyt(merkit) === KOHTEITA;

// Versio kasvaa aina, vaikka kello olisi jäljessä: millisekunnit, vähintään edellinen + 1.
export const uusiVersio = (edellinen, nyt = Date.now()) => Math.max(nyt, (edellinen || 0) + 1);

export const tapahtumatOf = (kortit, nro) => kortit[nro]?.tapahtumat || '';

// Muuttaa kiekon i merkin ja/tai kortin tapahtumat (tapahtumat.js); historia muistaa molemmat perumista varten.
function muutaKorttia({ kortit, historia }, { nro, i }, { merkki, tapahtumat }, nyt) {
  const vanha = kortit[nro];
  const merkit = merkitOf(kortit, nro);
  const vanhatTap = tapahtumatOf(kortit, nro);
  const uusiMerkki = merkki ?? merkit[i];
  const uudetTap = tapahtumat ?? vanhatTap;
  if (i < 0 || i >= KOHTEITA || (uusiMerkki === merkit[i] && uudetTap === vanhatTap)) return { kortit, historia };
  const uudet = merkit.slice(0, i) + uusiMerkki + merkit.slice(i + 1);
  return {
    kortit: { ...kortit, [nro]: { merkit: uudet, versio: uusiVersio(vanha?.versio, nyt), lahetetty: false, ...(uudetTap ? { tapahtumat: uudetTap } : {}) } },
    // ennen vain, kun merkki muuttui: pelkän tapahtuman peruminen ei palauta kiekkoon vanhaa merkkiä (täydennys välissä).
    historia: [...historia, {
      nro, i, ...(uusiMerkki !== merkit[i] ? { ennen: merkit[i] } : {}), ...(uudetTap !== vanhatTap ? { tapEnnen: vanhatTap } : {})
    }].slice(-MAKS_HISTORIA)
  };
}

// Asettaa merkin; palauttaa { kortit, historia } uusina olioina.
export const merkitse = (tila, kohta, merkki, nyt = Date.now()) => muutaKorttia(tila, kohta, { merkki }, nyt);

// Korvaa kortin tapahtumat (varoitus, vähennys, poisto); kiekko i on historiaa ja perumista varten.
export const muutaTapahtumia = (tila, kohta, tapahtumat, nyt = Date.now()) => muutaKorttia(tila, kohta, { tapahtumat }, nyt);

// Toimintahäiriö kiekossa i: rajan sisällä kiekko jää uusittavaksi (H), rajan yli se merkitään nollaksi (N).
export function hairio(tila, kohta, raja, nyt = Date.now()) {
  const tap = tapahtumatOf(tila.kortit, kohta.nro);
  const yli = hairiot(tap) >= raja;
  return muutaKorttia(tila, kohta, yli ? { merkki: 'O', tapahtumat: lisaa(tap, { t: 'N', i: kohta.i }) } : { tapahtumat: lisaa(tap, { t: 'H', i: kohta.i }) }, nyt);
}

// Peruu viimeisimmän merkinnän tai tapahtuman. Palauttaa { kortit, historia, kohta } tai null, jos ei ole perumista.
export function peru({ kortit, historia }, nyt = Date.now()) {
  const viimeinen = historia[historia.length - 1];
  if (!viimeinen) return null;
  const { nro, i, ennen, tapEnnen } = viimeinen;
  const { kortit: uudet } = muutaKorttia({ kortit, historia: [] }, { nro, i }, { merkki: ennen, tapahtumat: tapEnnen }, nyt);
  return { kortit: uudet, historia: historia.slice(0, -1), kohta: { nro, i } };
}

// Palvelimen kortit paikallisiin: uudempi versio voittaa, sama versio merkitään lähetetyksi (eri merkit samalla
// versiolla, esim. taulukkoa korjattu käsin: taulukko voittaa). kaikki = palvelimen koko korttilista (avaus):
// lähetetyksi merkitty kortti, jota taulukossa ei ole tai siellä on vanhempi versio, lähetetään uudelleen.
export function yhdistaPalvelimelta(kortit, palvelimen, { kaikki = false } = {}) {
  let tulos = kortit;
  const nahdyt = new Set();
  for (const p of palvelimen || []) {
    nahdyt.add(String(p.nro));
    const oma = tulos[p.nro];
    const eri = p.merkit !== oma?.merkit || (p.tapahtumat || '') !== (oma?.tapahtumat || '');
    if (!oma || p.versio > oma.versio || (p.versio === oma.versio && eri)) {
      tulos = { ...tulos, [p.nro]: { merkit: p.merkit, versio: p.versio, lahetetty: true, ...(p.tapahtumat ? { tapahtumat: p.tapahtumat } : {}) } };
    } else if (p.versio === oma.versio && !oma.lahetetty) tulos = { ...tulos, [p.nro]: { ...oma, lahetetty: true } };
    else if (kaikki && p.versio < oma.versio && oma.lahetetty) tulos = { ...tulos, [p.nro]: { ...oma, lahetetty: false } };
  }
  if (kaikki) {
    for (const [nro, oma] of Object.entries(tulos)) {
      if (oma.lahetetty && !nahdyt.has(nro)) tulos = { ...tulos, [nro]: { ...oma, lahetetty: false } };
    }
  }
  return tulos;
}

// Lähettämättömät kortit (enintään maks) API:n muodossa.
export function lahettamattomat(kortit, maks = 30) {
  return Object.entries(kortit)
    .filter(([, k]) => !k.lahetetty)
    .slice(0, maks)
    // tapahtumat lähtee aina (myös tyhjänä): puuttuva kenttä (vanha sovellus) jättää taulukon tapahtumat ennalleen.
    .map(([nro, k]) => ({ nro: Number(nro), merkit: k.merkit, versio: k.versio, tapahtumat: k.tapahtumat || '' }));
}

// Tallennuksen vastaus: lähetetyt versiot merkitään tallennetuiksi (jos niitä ei ole sillä välin muutettu),
// palvelimen uudemmat kortit otetaan käyttöön.
export function kuittaa(kortit, lahetetyt, { tallennetut = [], uudemmat = [] }) {
  let tulos = kortit;
  const versiot = new Map(lahetetyt.map((k) => [k.nro, k.versio]));
  for (const nro of tallennetut) {
    const oma = tulos[nro];
    if (oma && oma.versio === versiot.get(nro)) tulos = { ...tulos, [nro]: { ...oma, lahetetty: true } };
  }
  return yhdistaPalvelimelta(tulos, uudemmat);
}

// Koodin sisältö ilman tarkistusta (tarkistus tehdään palvelimella): ratakoodi { sheetId, sarake, voimassaAsti },
// ryhmäkoodi { sheetId, ryhma, voimassaAsti } tai null.
export function lueKoodi(koodi) {
  const osat = String(koodi || '').trim().split('.');
  if (osat.length !== 3 || osat[0] !== 'v1') return null;
  try {
    const base64 = osat[1].replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))));
    if (typeof data?.s !== 'string') return null;
    if (Number.isInteger(data.r)) return { sheetId: data.s, ryhma: data.r, voimassaAsti: data.e };
    if (!Number.isInteger(data.c)) return null;
    return { sheetId: data.s, sarake: data.c, voimassaAsti: data.e };
  } catch {
    return null;
  }
}
