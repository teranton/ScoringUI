// src/utils/ryhmaNakyma.js
// Ryhmien muokkauksen näkymäapurit: sarjojen korostusvärit ja ryhmien ryhmittely lähtöajan mukaan.
import { toSortValue } from './aikatauluRadat.js';

// Korostusvärit valintajärjestyksessä. Vihreä, keltainen ja punainen kertovat ryhmän täyttöasteen ja violetti
// ei tuomaroivan sarjan, joten niitä ei käytetä.
export const KOROSTUSVARIT = [
  { rivi: 'border-sky-300 bg-sky-50', merkki: 'bg-sky-600 text-white', piste: 'bg-sky-500' },
  { rivi: 'border-orange-300 bg-orange-50', merkki: 'bg-orange-600 text-white', piste: 'bg-orange-500' },
  { rivi: 'border-pink-300 bg-pink-50', merkki: 'bg-pink-600 text-white', piste: 'bg-pink-500' },
  { rivi: 'border-lime-400 bg-lime-50', merkki: 'bg-lime-700 text-white', piste: 'bg-lime-500' },
  { rivi: 'border-cyan-300 bg-cyan-50', merkki: 'bg-cyan-700 text-white', piste: 'bg-cyan-500' },
  { rivi: 'border-indigo-300 bg-indigo-50', merkki: 'bg-indigo-600 text-white', piste: 'bg-indigo-500' },
  { rivi: 'border-stone-400 bg-stone-100', merkki: 'bg-stone-700 text-white', piste: 'bg-stone-500' },
  { rivi: 'border-teal-300 bg-teal-50', merkki: 'bg-teal-700 text-white', piste: 'bg-teal-500' }
];

// Ampujien sarjat ja määrät: [{ sarja, maara }] sarjan nimen mukaan.
export function sarjatPaikoista(paikat) {
  const maarat = new Map();
  for (const p of paikat || []) {
    if ((p.tyyppi !== 'ampuja' && p.tyyppi !== 'lukittu') || !p.sarja) continue;
    maarat.set(p.sarja, (maarat.get(p.sarja) || 0) + 1);
  }
  return [...maarat].map(([sarja, maara]) => ({ sarja, maara }))
    .sort((a, b) => a.sarja.localeCompare(b.sarja, 'fi', { numeric: true }));
}

// Valittujen sarjojen värit valintajärjestyksessä: Map<sarja, väri>.
export function korostusVarit(valitut) {
  return new Map((valitut || []).map((sarja, i) => [sarja, KOROSTUSVARIT[i % KOROSTUSVARIT.length]]));
}

// Ryhmät lähtöajan mukaan valittuna päivänä: [{ aika, ryhmat }] aikajärjestyksessä; ryhmät ilman aikaa
// viimeisenä (aika ''). ajat(ryhma) palauttaa ryhmän lähtöajat [{ avain, aika }].
export function ryhmatAjoittain(ryhmat, ajat, paivaAvain) {
  const lahdot = new Map();
  for (const ryhma of ryhmat || []) {
    const lahto = (ajat(ryhma) || []).find((a) => a.avain === paivaAvain);
    const aika = lahto?.aika || '';
    if (!lahdot.has(aika)) lahdot.set(aika, []);
    lahdot.get(aika).push(ryhma);
  }
  return [...lahdot].map(([aika, r]) => ({ aika, ryhmat: r }))
    .sort((a, b) => (a.aika ? toSortValue(a.aika) : Infinity) - (b.aika ? toSortValue(b.aika) : Infinity));
}
