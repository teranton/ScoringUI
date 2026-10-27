// Mobiilikirjauksen suora tulos (KISANSPEKSIT MOBIILI_TULOKSET = SUORAAN): valmiin kortin tulos OSALLISTUJAT+TULOKSET-
// välilehden tulossoluun. Compak-kortti (MOBIILI Rata N) menee tulossarakkeeseen N, ryhmäkortin asema k (MOBIILI Layout N)
// tulossarakkeeseen k. Muuten (TOIMISTO, oletus) ScoringLibin "Tuo mobiilitulokset" kopioi tulokset samalla valmiuden
// säännöllä (MobiiliTulokset.js).
// Valmis: Compak-kortin kaikki 25 kiekkoa merkitty; ryhmäkortin aseman kiekot merkitty ja ampuja on kuitannut aseman
// (KUITATUT sisältää aseman tunnuksen tai koko kortti on HYVÄKSYTTY; FITASC-pisteillä vain HYVÄKSYTTY).
// Paperilta kirjoitettua tai kaavalla laskettua tulosta ei koskaan muuteta: eroava tulos kirjataan lokiin. Taulukkokaavan
// (ARRAYFORMULA, SEQUENCE ...) täyttämään sarakkeeseen ei kirjoiteta lainkaan, koska tyhjäkin solu kuuluu kaavan alueeseen.
// Solu, jossa on kortin edellinen valmis tulos (mobiili kirjoitti sen), seuraa korjattua korttia.
// Pääsivu luetaan soluina (spreadsheets.get, userEnteredValue ja effectiveValue). Ei Google-kutsuja (kirjausTulokset.test.js).
import { normalisoiAsetus } from '../../src/utils/kisaAsetukset.js';
import { KOHTEITA, laskeTulos, speksiArvo } from './kirjausData.js';

export const onSuoraan = (speksit) => normalisoiAsetus(speksiArvo(speksit, 'MOBIILI_TULOKSET')) === 'SUORAAN';

// Compak-kortin tulos tai null (kesken).
export const kompakTulos = (merkit) => (typeof merkit === 'string' && merkit.length === KOHTEITA && !merkit.includes('-')
  ? laskeTulos(merkit) : null);

// Aseman tunnus vertailuun: puhelin saa tunnukset muotoiltuina (avaus), tallennus lukee ne muotoilemattomina ("1,0" = 1).
const asemaTunnus = (id) => {
  const t = String(id ?? '').trim();
  const luku = Number(t.replace(',', '.'));
  return t !== '' && Number.isFinite(luku) ? String(luku) : t.toUpperCase();
};

// Ryhmäkortin asemien tulokset [{ sarake, tulos }]: tulos null, kun asema on kesken tai kuittaamatta.
// kortti: { merkit, kuitatut, hyvaksytty } (lueRyhmaKorttiRivi tai laitteen kortti).
export function asemaTulokset(layout, kortti) {
  if (!kortti || typeof kortti.merkit !== 'string' || kortti.merkit.length !== layout.kohteita) {
    return layout.asemat.map((a) => ({ sarake: a.sarake, tulos: null }));
  }
  const kuitatut = (kortti.kuitatut || []).map(asemaTunnus);
  let alku = 0;
  return layout.asemat.map((a) => {
    const osa = kortti.merkit.slice(alku, alku + a.kohteita);
    alku += a.kohteita;
    const kuitattu = Boolean(kortti.hyvaksytty) || (!layout.ohjelma && kuitatut.includes(asemaTunnus(a.id)));
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
  const nro = h.findIndex((x) => normalisoiAsetus(x) === 'NRO');
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

const tyhja = (v) => v === null || v === undefined || String(v).trim() === '';

// Pääsivun solu (spreadsheets.get rowData.values) → { arvo, kaava, taytetty }: arvo laskettuna, kaava = solussa on kaava,
// taytetty = taulukkokaavan täyttämä solu (arvo ilman omaa syötettä).
export function soluTieto(solu) {
  const e = solu?.effectiveValue || {};
  const arvo = e.numberValue ?? e.stringValue ?? e.boolValue ?? '';
  const kaava = solu?.userEnteredValue?.formulaValue;
  return { arvo, kaava: kaava !== undefined, kaavaTeksti: kaava ?? '', taytetty: !solu?.userEnteredValue && !tyhja(arvo) };
}

// Solut riveittäin (rowData) → { rivit (laskettu arvo, tulosSolut-muoto), tiedot (soluTieto) }.
export function paaSolut(rowData) {
  const tiedot = (rowData || []).map((r) => (r?.values || []).map(soluTieto));
  return { rivit: tiedot.map((r) => r.map((t) => t.arvo)), tiedot };
}

const TAULUKKOKAAVA = /\b(ARRAYFORMULA|SEQUENCE|MAP|BYROW|BYCOL|FILTER|QUERY|SORT|UNIQUE|FLATTEN|IMPORTRANGE)\s*\(|\{/i;

// Taulukkokaavan täyttämät tulossarakkeet (indeksit): sarakkeessa on täytetty solu tai taulukkokaava otsikon alla.
// solut: paaSolut().tiedot.
export function kaavaSarakkeet(solut, sarakeIndeksit) {
  return new Set(sarakeIndeksit.filter((c) => (solut || []).some((r, i) => i > 0 && (r?.[c]?.taytetty
    || TAULUKKOKAAVA.test(r?.[c]?.kaavaTeksti || '')))));
}

// Yhden tulossolun päätös. solu: soluTieto, vanha: kortin edellinen valmis tulos tai null, uusi: valmis tulos tai null.
// Palauttaa { arvo } (luku kirjoitetaan, '' tyhjentää) tai {} ja lokin huomautuksen (estetty: huomautus, jos kirjoitus ei
// onnistu, esim. suojattu pääsivu).
export function suoraTulos({ solu, vanha, uusi, sarake }) {
  const { arvo, kaava, taytetty } = solu || {};
  const luku = !kaava && !taytetty && !tyhja(arvo) ? Number(arvo) : Number.NaN;
  const kirjoita = (uusiArvo, huom) => ({ arvo: uusiArvo, huom, estetty: `${huom} EPÄONNISTUI (PÄÄSIVU SUOJATTU)` });
  if (uusi !== null && luku === uusi) return {};
  if (kaava || taytetty) {
    return uusi === null ? {} : { huom: `TULOS ${uusi} EI KIRJOITETTU: SARAKKEESSA ${sarake} ON KAAVA` };
  }
  if (tyhja(arvo)) return uusi === null ? {} : kirjoita(uusi, `TULOS ${uusi} SARAKKEESEEN ${sarake}`);
  if (vanha !== null && luku === vanha) {
    return uusi === null
      ? kirjoita('', `TULOS ${vanha} POISTETTU SARAKKEESTA ${sarake} (KORTTI KESKEN)`)
      : kirjoita(uusi, `TULOS ${vanha} → ${uusi} SARAKKEESEEN ${sarake}`);
  }
  if (uusi === null) return {};
  return { huom: `TULOS ${uusi} EI KIRJOITETTU: SARAKKEESSA ${sarake} ON ${String(arvo).trim()}` };
}

// Kohteet, joiden tulos muuttuu: kortti on nyt tai oli ennen valmis, ja tulos on eri kuin ennen (sama tulos ei kirjoita
// eikä lue pääsivua; ennen SUORAAN-asetusta valmistuneet tuodaan ScoringLibin Tuo mobiilitulokset -valikosta).
export const muuttuvat = (kohteet) => kohteet.filter((k) => k.uusi !== k.vanha);
