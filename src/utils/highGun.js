// src/utils/highGun.js
// High Gun -palkinto (KISANSPEKSIT: HIGH_GUN, HIGH_GUN_POIS_SARJOISTA): kokonaistulosten parhaat sarjasta
// riippumatta. Voittajat voidaan jättää pois sarjojen sijoituksista, jolloin sama ampuja ei palkita kahdesti ja
// sarjan seuraava nousee palkintosijalle. Sama tulkinta kuin ScoringLibin Speksit.highGun.
import { asetusJoukko, asetusTulkitsija, haeAsetusSpekseista } from './kisaAsetukset.js';
import { KAIKKI_SARJAT, laskeHenkilosijoitukset, onkoTulosta } from './henkiloTulokset.js';

// High Gun -näkymän tunniste sarjasuodattimessa.
export const HIGH_GUN = '__HIGH_GUN__';
export const HIGH_GUN_NIMI = 'High Gun';
// Asetus, kun KISANSPEKSIT ei määrää High Gunia: ei paikkoja.
export const HIGH_GUN_OLETUS = { paikat: 0, poisSarjoista: true };

const HIGH_GUN_AVAIMET = asetusJoukko(['HIGH_GUN']);
const HIGH_GUN_POIS_AVAIMET = asetusJoukko(['HIGH_GUN_POIS_SARJOISTA']);

// Kuten ScoringLib: vain numerot (myös "03").
const tulkitsePaikat = (arvo) => (/^\d+$/.test(String(arvo).trim()) ? { paikat: Number.parseInt(arvo, 10) } : null);

const tulkitsePois = asetusTulkitsija([
  ['kylla', ['TRUE']],
  ['ei', ['FALSE', 'EPÄTOSI', '0', 'EI']]
]);

// { paikat, poisSarjoista }: paikat 0 = ei High Gunia; poisSarjoista oletuksena tosi.
export function haeHighGunSpekseista(speksitData) {
  const paikat = haeAsetusSpekseista(speksitData, HIGH_GUN_AVAIMET, tulkitsePaikat)?.paikat ?? 0;
  const pois = haeAsetusSpekseista(speksitData, HIGH_GUN_POIS_AVAIMET, tulkitsePois);
  return { paikat, poisSarjoista: pois !== 'ei' };
}

// Ratko ratkaisee ja näkyy High Gun -näkymässä kaikilla High Gun -sijoilla, vaikka RATKO_PALKINTO_SIJA olisi pienempi.
export function sarjanRatkoSija(sarja, ratkoSija, highGun) {
  return sarja === HIGH_GUN ? Math.max(ratkoSija, highGun?.paikat || 0) : ratkoSija;
}

// High Gun -voittajien id:t: kaikkien ampujien sijoituksissa sijalla 1..paikat (ratkoton tasatulos voi tuoda useamman).
export function highGunVoittajat(ampujat, highGun, ratkoSija) {
  const paikat = highGun?.paikat || 0;
  if (paikat <= 0) return new Set();
  return new Set(laskeHenkilosijoitukset(ampujat, KAIKKI_SARJAT, Math.max(ratkoSija, paikat))
    .filter((a) => onkoTulosta(a) && (Number.parseInt(a.laskettuSija, 10) || 0) <= paikat)
    .map((a) => a.id));
}

// Sarja, jonka säännöillä näkymä lasketaan: High Gun kuten kaikkien ampujien näkymä.
export const laskentaSarja = (sarja) => (sarja === HIGH_GUN ? KAIKKI_SARJAT : sarja);

// Sarjan sijoitukset High Gun huomioiden: High Gun -näkymässä vain voittajat; muissa sarjoissa (ei yhteisessä)
// voittajat jätetään pois, kun poisSarjoista on päällä. voittajat voi antaa valmiiksi (tulosteessa kerran).
export function laskeSarjanSijoitukset(ampujat, sarja, ratkoSija, highGun = HIGH_GUN_OLETUS, voittajat = null) {
  const kaytossa = (highGun?.paikat || 0) > 0;
  if (!kaytossa || sarja === KAIKKI_SARJAT || (sarja !== HIGH_GUN && !highGun.poisSarjoista)) {
    return laskeHenkilosijoitukset(ampujat, sarja === HIGH_GUN ? KAIKKI_SARJAT : sarja, ratkoSija);
  }
  const voittajaIdt = voittajat || highGunVoittajat(ampujat, highGun, ratkoSija);
  if (sarja === HIGH_GUN) {
    return laskeHenkilosijoitukset(ampujat.filter((a) => voittajaIdt.has(a.id)), KAIKKI_SARJAT,
      sarjanRatkoSija(sarja, ratkoSija, highGun));
  }
  return laskeHenkilosijoitukset(ampujat.filter((a) => !voittajaIdt.has(a.id)), sarja, ratkoSija);
}
