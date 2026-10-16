// src/utils/openSarja.js
// Kaikkien ampujien yhteinen sarja (KISANSPEKSIT: OPEN_SARJA). Sama tulkinta kuin ScoringLibin Speksit.openSarja.
//   Y    → "Y": Suomen sääntöjen Y, johon kuuluvat kaikki ampujat (esim. SM, ei ulkomaalaisia)
//   OPEN → "Y (OPEN)": kilpailu on avoin ulkomaalaisille
//   EI   → ei yhteistä sarjaa, vain luokat (A, B, C ...)
// Ilman asetusta luokkakilpailu (kaikki sarjat A–F) saa EI, muut Y.
import { asetusJoukko, asetusTulkitsija, haeAsetusSpekseista } from './kisaAsetukset.js';
import { KAIKKI_SARJAT } from './henkiloTulokset.js';

export const OPEN_SARJA = { Y: 'y', OPEN: 'open', EI: 'ei' };

const tulkitseOpenSarja = asetusTulkitsija([
  [OPEN_SARJA.Y, ['Y']],
  [OPEN_SARJA.OPEN, ['OPEN', 'Y (OPEN)']],
  [OPEN_SARJA.EI, ['EI', 'FALSE']]
]);

const OPEN_SARJA_AVAIMET = asetusJoukko(['OPEN_SARJA']);

// 'y' | 'open' | 'ei' tai null, jos asetusta ei ole tai arvo on tuntematon.
export function haeOpenSarjaSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, OPEN_SARJA_AVAIMET, tulkitseOpenSarja);
}

export function onkoLuokkakisa(sarjat) {
  const tunnukset = (sarjat || []).map((s) => String(s ?? '').trim().toUpperCase()).filter(Boolean);
  return tunnukset.length > 0 && tunnukset.every((s) => /^[A-F]$/.test(s));
}

export function paatteleOpenSarja(asetus, sarjat) {
  if (asetus) return asetus;
  return onkoLuokkakisa(sarjat) ? OPEN_SARJA.EI : OPEN_SARJA.Y;
}

// Näytettävä nimi sarjavalinnalle: kaikkien ampujien näkymä saa nimen Y tai Y (OPEN).
export function sarjanNimi(sarja, openSarja) {
  if (sarja !== KAIKKI_SARJAT) return sarja;
  return openSarja === OPEN_SARJA.OPEN ? 'Y (OPEN)' : 'Y';
}

// Sarjavalinnat järjestyksessä: ensin kaikkien ampujien sarja (paitsi luokkakilpailussa), sitten muut sarjat.
// Sarja Y sisältyy yhteiseen sarjaan, joten sitä ei näytetä erikseen; luokkakilpailussa Y on tavallinen sarja.
export function sarjaValinnat(sarjat, openSarja) {
  const lajitellut = Array.from(sarjat || []).sort();
  if (openSarja === OPEN_SARJA.EI) return lajitellut;
  return [KAIKKI_SARJAT, ...lajitellut.filter((sarja) => sarja.toUpperCase() !== 'Y')];
}

// Valittu sarja, jos se on valittavissa; muuten ensimmäinen valinta (luokkakilpailussa ensimmäinen luokka).
export function aktiivinenSarja(valittu, valinnat) {
  if (valinnat.includes(valittu)) return valittu;
  return valinnat[0] ?? KAIKKI_SARJAT;
}
