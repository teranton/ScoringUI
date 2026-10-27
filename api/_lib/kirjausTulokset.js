// Mobiilikirjauksen suora tulos (KISANSPEKSIT MOBIILI_TULOKSET = SUORAAN): valmiin kortin tulos OSALLISTUJAT+TULOKSET-
// välilehden tulossoluun. Compak-kortti (MOBIILI Rata N) menee tulossarakkeeseen N, ryhmäkortin asema k (MOBIILI Layout N)
// tulossarakkeeseen k. Muuten (TOIMISTO, oletus) ScoringLibin "Tuo mobiilitulokset" kopioi tulokset samalla valmiuden
// säännöllä (MobiiliTulokset.js).
// Valmis: Compak-kortin kaikki 25 kiekkoa merkitty; ryhmäkortin aseman kiekot merkitty ja ampuja on kuitannut aseman
// (KUITATUT sisältää aseman tunnuksen tai koko kortti on HYVÄKSYTTY; FITASC-pisteillä vain HYVÄKSYTTY).
// Paperilta kirjoitettua tai kaavalla laskettua tulosta ei koskaan muuteta: eroava tulos kirjataan lokiin. Solu, jossa on
// kortin edellinen valmis tulos (mobiili kirjoitti sen), seuraa korjattua korttia. Ei Google-kutsuja (kirjausTulokset.test.js).
import { normalisoiAsetus } from '../../src/utils/kisaAsetukset.js';
import { KOHTEITA, laskeTulos, sarakeKirjain, speksiArvo } from './kirjausData.js';

export const onSuoraan = (speksit) => normalisoiAsetus(speksiArvo(speksit, 'MOBIILI_TULOKSET')) === 'SUORAAN';

// Compak-kortin tulos tai null (kesken).
export const kompakTulos = (merkit) => (typeof merkit === 'string' && merkit.length === KOHTEITA && !merkit.includes('-')
  ? laskeTulos(merkit) : null);

// Ryhmäkortin asemien tulokset [{ sarake, tulos }]: tulos null, kun asema on kesken tai kuittaamatta.
// kortti: { merkit, kuitatut, hyvaksytty } (lueRyhmaKorttiRivi tai laitteen kortti).
export function asemaTulokset(layout, kortti) {
  if (!kortti || typeof kortti.merkit !== 'string' || kortti.merkit.length !== layout.kohteita) {
    return layout.asemat.map((a) => ({ sarake: a.sarake, tulos: null }));
  }
  const kuitatut = new Set((kortti.kuitatut || []).map(String));
  let alku = 0;
  return layout.asemat.map((a) => {
    const osa = kortti.merkit.slice(alku, alku + a.kohteita);
    alku += a.kohteita;
    const kuitattu = Boolean(kortti.hyvaksytty) || (!layout.ohjelma && kuitatut.has(String(a.id)));
    return { sarake: a.sarake, tulos: kuitattu && !osa.includes('-') ? laskeTulos(osa) : null };
  });
}

// Pääsivun sarakkeet otsikkorivistä: { nro, tulos: { [k]: indeksi } }. NRO otsikon mukaan (muuten A), tulossarake k on
// ensimmäinen otsikko, jonka teksti on k (sama kuin ScoringLibin MobiiliTulokset.paaSarakkeet).
export function paaSarakkeet(otsikko) {
  const h = (otsikko || []).map((x) => String(x ?? '').trim());
  const tulos = {};
  h.forEach((x, i) => {
    if (/^\d+$/.test(x) && tulos[Number(x)] === undefined) tulos[Number(x)] = i;
  });
  const nro = h.findIndex((x) => x.toUpperCase() === 'NRO');
  return { nro: nro >= 0 ? nro : 0, tulos };
}

// Tulossolujen paikat: kohteet [{ nro, sarake, ... }] → sama lista, jossa rivi ja sarakeIndeksi (0-pohjaiset) tai puuttuu.
export function tulosSolut(paaRivit, kohteet) {
  const s = paaSarakkeet(paaRivit?.[0]);
  const rivit = new Map();
  (paaRivit || []).forEach((r, i) => {
    if (i === 0 || !Array.isArray(r)) return;
    const nro = Number.parseInt(r[s.nro], 10);
    if (nro > 0 && !rivit.has(nro)) rivit.set(nro, i);
  });
  return kohteet.map((k) => {
    const rivi = rivit.get(k.nro);
    const sarakeIndeksi = s.tulos[k.sarake];
    if (rivi === undefined) return { ...k, puuttuu: 'AMPUJAA EI OLE PÄÄSIVULLA' };
    if (sarakeIndeksi === undefined) return { ...k, puuttuu: `TULOSSARAKETTA ${k.sarake} EI OLE` };
    return { ...k, rivi, sarakeIndeksi };
  });
}

export const soluA1 = (rivi, sarakeIndeksi) => `${sarakeKirjain(sarakeIndeksi)}${rivi + 1}`;

const tyhja = (v) => v === null || v === undefined || String(v).trim() === '';

// Yhden tulossolun päätös. solu: arvo FORMULA-muodossa (kaava alkaa "="), vanha: kortin edellinen valmis tulos tai null,
// uusi: valmis tulos tai null. Palauttaa { arvo } (luku kirjoitetaan, '' tyhjentää) tai {} ja lokin huomautuksen.
export function suoraTulos({ solu, vanha, uusi, sarake }) {
  const kaava = typeof solu === 'string' && solu.trim().startsWith('=');
  const luku = !kaava && !tyhja(solu) ? Number(solu) : Number.NaN;
  if (uusi !== null && luku === uusi) return {};
  if (!kaava && tyhja(solu)) {
    return uusi === null ? {} : { arvo: uusi, huom: `TULOS ${uusi} SARAKKEESEEN ${sarake}` };
  }
  if (vanha !== null && luku === vanha) {
    return uusi === null
      ? { arvo: '', huom: `TULOS ${vanha} POISTETTU SARAKKEESTA ${sarake} (KORTTI KESKEN)` }
      : { arvo: uusi, huom: `TULOS ${vanha} → ${uusi} SARAKKEESEEN ${sarake}` };
  }
  if (uusi === null) return {};
  return { huom: `TULOS ${uusi} EI KIRJOITETTU: SARAKKEESSA ${sarake} ON ${kaava ? 'KAAVA' : String(solu).trim()}` };
}

// Kohteet, joiden tulos voi muuttua (kortti on nyt tai oli ennen valmis).
export const muuttuvat = (kohteet) => kohteet.filter((k) => k.uusi !== null || k.vanha !== null);
