// Mobiilikirjauksen korttilogiikka (Compak): merkinnät, seuraava kohde, peruutus ja synkronoinnin yhdistäminen.
// Kortti: { merkit: 25 merkkiä X/O/-, versio: kasvava luku, lahetetty: onko tämä versio tallessa taulukossa }.
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

// Asettaa merkin; palauttaa { kortit, historia } uusina olioina.
export function merkitse({ kortit, historia }, { nro, i }, merkki, nyt = Date.now()) {
  const vanha = kortit[nro];
  const merkit = merkitOf(kortit, nro);
  if (i < 0 || i >= KOHTEITA || merkit[i] === merkki) return { kortit, historia };
  const uudet = merkit.slice(0, i) + merkki + merkit.slice(i + 1);
  return {
    kortit: { ...kortit, [nro]: { merkit: uudet, versio: uusiVersio(vanha?.versio, nyt), lahetetty: false } },
    historia: [...historia, { nro, i, ennen: merkit[i] }].slice(-MAKS_HISTORIA)
  };
}

// Peruu viimeisimmän merkinnän. Palauttaa { kortit, historia, kohta } tai null, jos ei ole perumista.
export function peru({ kortit, historia }, nyt = Date.now()) {
  const viimeinen = historia[historia.length - 1];
  if (!viimeinen) return null;
  const { nro, i, ennen } = viimeinen;
  const merkit = merkitOf(kortit, nro);
  const uudet = merkit.slice(0, i) + ennen + merkit.slice(i + 1);
  return {
    kortit: { ...kortit, [nro]: { merkit: uudet, versio: uusiVersio(kortit[nro]?.versio, nyt), lahetetty: false } },
    historia: historia.slice(0, -1),
    kohta: { nro, i }
  };
}

// Palvelimen kortit paikallisiin: uudempi versio voittaa, sama versio merkitään lähetetyksi.
export function yhdistaPalvelimelta(kortit, palvelimen) {
  let tulos = kortit;
  for (const p of palvelimen || []) {
    const oma = tulos[p.nro];
    if (!oma || p.versio > oma.versio) tulos = { ...tulos, [p.nro]: { merkit: p.merkit, versio: p.versio, lahetetty: true } };
    else if (p.versio === oma.versio && p.merkit === oma.merkit && !oma.lahetetty) tulos = { ...tulos, [p.nro]: { ...oma, lahetetty: true } };
  }
  return tulos;
}

// Lähettämättömät kortit (enintään maks) API:n muodossa.
export function lahettamattomat(kortit, maks = 30) {
  return Object.entries(kortit)
    .filter(([, k]) => !k.lahetetty)
    .slice(0, maks)
    .map(([nro, k]) => ({ nro: Number(nro), merkit: k.merkit, versio: k.versio }));
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

// Ratakoodin sisältö ilman tarkistusta (tarkistus tehdään palvelimella): { sheetId, sarake, voimassaAsti } tai null.
export function lueKoodi(koodi) {
  const osat = String(koodi || '').trim().split('.');
  if (osat.length !== 3 || osat[0] !== 'v1') return null;
  try {
    const base64 = osat[1].replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))));
    if (typeof data?.s !== 'string' || !Number.isInteger(data?.c)) return null;
    return { sheetId: data.s, sarake: data.c, voimassaAsti: data.e };
  } catch {
    return null;
  }
}
