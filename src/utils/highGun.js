// src/utils/highGun.js
// High Gun -palkinto (KISANSPEKSIT: HIGH_GUN, HIGH_GUN_POIS_SARJOISTA): kokonaistulosten parhaat sarjasta
// riippumatta. Voittajat voidaan jättää pois sarjojen sijoituksista, jolloin sama ampuja ei palkita kahdesti ja
// sarjan seuraava nousee palkintosijalle. Sama tulkinta kuin ScoringLibin Speksit.highGun.
import { asetusJoukko, asetusTulkitsija, haeAsetusSpekseista } from './kisaAsetukset.js';
import { KAIKKI_SARJAT, laskeHenkilosijoitukset } from './henkiloTulokset.js';

// High Gun -näkymän tunniste sarjasuodattimessa.
export const HIGH_GUN = '__HIGH_GUN__';
export const HIGH_GUN_NIMI = 'High Gun';
export const HIGH_GUN_POIS = { paikat: 0, poisSarjoista: true };

const HIGH_GUN_AVAIMET = asetusJoukko(['HIGH_GUN']);
const HIGH_GUN_POIS_AVAIMET = asetusJoukko(['HIGH_GUN_POIS_SARJOISTA']);

const tulkitsePaikat = (arvo) => {
  const paikat = Number.parseInt(String(arvo).trim(), 10);
  return Number.isInteger(paikat) && paikat >= 0 && String(paikat) === String(arvo).trim() ? { paikat } : null;
};

const tulkitsePois = asetusTulkitsija([
  ['kylla', ['TRUE']],
  ['ei', ['FALSE', 'EI']]
]);

// { paikat, poisSarjoista }: paikat 0 = ei High Gunia; poisSarjoista oletuksena tosi.
export function haeHighGunSpekseista(speksitData) {
  const paikat = haeAsetusSpekseista(speksitData, HIGH_GUN_AVAIMET, tulkitsePaikat)?.paikat ?? 0;
  const pois = haeAsetusSpekseista(speksitData, HIGH_GUN_POIS_AVAIMET, tulkitsePois);
  return { paikat, poisSarjoista: pois !== 'ei' };
}

const onkoTulosta = (ampuja) => (Number.parseInt(ampuja.tulos, 10) || 0) > 0;

// High Gun -voittajien id:t: kaikkien ampujien sijoituksissa sijalla 1..paikat (tasatulos voi tuoda useamman).
export function highGunVoittajat(ampujat, highGun, ratkoSija) {
  const paikat = highGun?.paikat || 0;
  if (paikat <= 0) return new Set();
  return new Set(laskeHenkilosijoitukset(ampujat, KAIKKI_SARJAT, ratkoSija)
    .filter((a) => onkoTulosta(a) && (Number.parseInt(a.laskettuSija, 10) || 0) <= paikat)
    .map((a) => a.id));
}

// Sarja, jonka säännöillä näkymä lasketaan: High Gun kuten kaikkien ampujien näkymä.
export const laskentaSarja = (sarja) => (sarja === HIGH_GUN ? KAIKKI_SARJAT : sarja);

// Sarjan sijoitukset High Gun huomioiden: High Gun -näkymässä vain voittajat; muissa sarjoissa (ei yhteisessä)
// voittajat jätetään pois, kun poisSarjoista on päällä.
export function laskeSarjanSijoitukset(ampujat, sarja, ratkoSija, highGun = HIGH_GUN_POIS) {
  const voittajat = highGunVoittajat(ampujat, highGun, ratkoSija);
  if (sarja === HIGH_GUN) {
    return laskeHenkilosijoitukset(ampujat.filter((a) => voittajat.has(a.id)), KAIKKI_SARJAT, ratkoSija);
  }
  if (sarja !== KAIKKI_SARJAT && highGun?.poisSarjoista && voittajat.size > 0) {
    return laskeHenkilosijoitukset(ampujat.filter((a) => !voittajat.has(a.id)), sarja, ratkoSija);
  }
  return laskeHenkilosijoitukset(ampujat, sarja, ratkoSija);
}
