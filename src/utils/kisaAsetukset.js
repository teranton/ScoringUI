// src/utils/kisaAsetukset.js
// KISANSPEKSIT-välilehden näkymäasetukset (aikataulun näkyvyys, logot, ryhmittely, malli).
import { parseCsvRows } from './csv.js';
import { normalisoiOtsikko } from './henkiloTulokset.js';

// Avaimet ja arvot verrataan normalisoituina: isot kirjaimet, Ä/Ö/Å → A/O/A, vain A-Z ja 0-9
// (välilyönnit ja alaviivat pois), joten 'Aikataulu näkyvyys' = 'AIKATAULU_NAKYVYYS'.
export const normalisoiAsetus = normalisoiOtsikko;

// Avain-sarake: Selite | Avain -otsikon { rivi, sarake } tai null (nykyinen malli Selite | Avain | Arvo | Ohje).
export function avainOtsikko(rivit) {
  for (let r = 0; r < rivit.length; r++) {
    const rivi = Array.isArray(rivit[r]) ? rivit[r] : [];
    for (let c = 0; c + 1 < rivi.length; c++) {
      if (normalisoiAsetus(rivi[c]) === 'SELITE' && normalisoiAsetus(rivi[c + 1]) === 'AVAIN') return { rivi: r, sarake: c + 1 };
    }
  }
  return null;
}

// Avainsolut järjestyksessä: [rivi, sarake] jokaiselle solulle, jolle onAvain(solu) on tosi. Kuten ScoringLibin
// Speksit.etsi: Selite | Avain -otsikon alla vain Avain-sarakkeesta (selite tai ohje ei sekoitu avaimeen),
// vanhan mallin välilehdellä (ei otsikkoa) kaikista soluista.
export function* avainOsumat(rivit, onAvain) {
  const taulu = Array.isArray(rivit) ? rivit : [];
  const otsikko = avainOtsikko(taulu);
  for (let r = otsikko ? otsikko.rivi + 1 : 0; r < taulu.length; r++) {
    const rivi = taulu[r];
    if (!Array.isArray(rivi)) continue;
    if (otsikko) {
      if (onAvain(rivi[otsikko.sarake])) yield [rivi, otsikko.sarake];
      continue;
    }
    for (let c = 0; c < rivi.length; c++) if (onAvain(rivi[c])) yield [rivi, c];
  }
}

export function asetusJoukko(arvot) {
  return new Set(arvot.map(normalisoiAsetus));
}

// Muodostaa tulkintafunktion taulukosta [[tulos, [hyväksytyt arvot]], ...].
export function asetusTulkitsija(taulukko) {
  const joukot = taulukko.map(([tulos, arvot]) => [tulos, asetusJoukko(arvot)]);
  return (arvo) => {
    const norm = normalisoiAsetus(arvo);
    if (!norm) return null;
    const osuma = joukot.find(([, joukko]) => joukko.has(norm));
    return osuma ? osuma[0] : null;
  };
}

// Etsii riviltä asetusavaimen ja tulkitsee avaimen oikealla puolella olevan ensimmäisen ei-tyhjän solun.
// tulkitse(arvo, avain) palauttaa tulkinnan tai null.
export function haeAsetusSpekseista(speksitData, avainSanat, tulkitse) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  for (const [rivi, i] of avainOsumat(rivit, (s) => avainSanat.has(normalisoiAsetus(String(s ?? '').trim())))) {
    const avain = normalisoiAsetus(String(rivi[i] ?? '').trim());
    const arvo = rivi.slice(i + 1).map((s) => String(s || '').trim()).find(Boolean);
    const tulkinta = arvo ? tulkitse(arvo, avain) : null;
    if (tulkinta) return tulkinta;
  }

  return null;
}

// Hyväksytyt avaimet ja arvot ovat ne, joita kilpailutiedostot käyttävät.
const tulkitseAikatauluNakyvyys = asetusTulkitsija([
  ['always', ['TRUE']],
  ['after-start', ['AFTER_START']],
  ['off', ['FALSE']]
]);

const AIKATAULU_NAKYVYYS_AVAIMET = asetusJoukko(['AIKATAULU_NAKYVYYS']);

export function haeAikatauluNakyvyysSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_NAKYVYYS_AVAIMET, tulkitseAikatauluNakyvyys);
}

const tulkitseSponsoriLogoNakyvyys = asetusTulkitsija([
  ['on', ['TRUE']],
  ['off', ['FALSE']]
]);

const SPONSORI_LOGO_NAKYVYYS_AVAIMET = asetusJoukko(['LOGOT_NAKYVYYS']);

export function haeSponsoriLogoNakyvyysSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, SPONSORI_LOGO_NAKYVYYS_AVAIMET, tulkitseSponsoriLogoNakyvyys);
}

const tulkitseAikatauluRyhmittely = asetusTulkitsija([
  ['inline', ['INLINE']],
  ['group5', ['5']],
  ['group6', ['6']]
]);

const AIKATAULU_RYHMITTELY_AVAIMET = asetusJoukko(['AIKATAULU_RYHMAKOKO']);

export function haeAikatauluRyhmittelySpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_RYHMITTELY_AVAIMET, tulkitseAikatauluRyhmittely);
}

const tulkitseAikatauluMalli = asetusTulkitsija([
  ['inline', ['INLINE']],
  ['groups', ['GROUPS']]
]);

const AIKATAULU_MALLI_AVAIMET = asetusJoukko(['AIKATAULU_MALLI']);

export function haeAikatauluMalliSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, AIKATAULU_MALLI_AVAIMET, tulkitseAikatauluMalli);
}

// "Ei tuomaroivat:" – sarjat, joiden ampujat eivät tuomaroi. Luetaan kuten ScoringLib (Speksit.js,
// ConfigManager.parseCsv): ensimmäisen avaimen viereinen solu, avaimen puuttuessa vanha solu B20,
// pilkuilla eroteltu lista. Sarjat verrataan SARJA-sarakkeeseen sellaisinaan (Distributor.js: indexOf).
const EI_TUOMAROIVAT_AVAIN = normalisoiAsetus('Ei tuomaroivat:');

export function haeEiTuomaroivatSarjatSpekseista(speksitData) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);
  let arvo = null;
  for (const [rivi, i] of avainOsumat(rivit, (s) => normalisoiAsetus(s) === EI_TUOMAROIVAT_AVAIN)) {
    arvo = rivi[i + 1];
    break;
  }
  if (arvo === null) arvo = rivit[19]?.[1];
  return String(arvo ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
