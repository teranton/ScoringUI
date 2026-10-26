// src/utils/ryhmaNakyma.js
// Ryhmien muokkauksen näkymäapurit: sarjojen korostusvärit ja ryhmien ryhmittely lähtöajan mukaan.
import { toSortValue } from './aikatauluRadat.js';
import { onAmpuja } from './ryhmaMuokkaus.js';

// Korostusvärit. Sarja pitää värinsä, kunnes korostus poistetaan, joten korostettavia on enintään yhtä monta. Vihreä, keltainen ja punainen kertovat ryhmän täyttöasteen ja violetti
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
    if (!onAmpuja(p) || !p.sarja) continue;
    maarat.set(p.sarja, (maarat.get(p.sarja) || 0) + 1);
  }
  return [...maarat].map(([sarja, maara]) => ({ sarja, maara }))
    .sort((a, b) => a.sarja.localeCompare(b.sarja, 'fi', { numeric: true }));
}

// Korostukset: [{ sarja, vari }], vari on KOROSTUSVARIT-indeksi.
export function korostusVarit(valitut) {
  return new Map((valitut || []).map(({ sarja, vari }) => [sarja, KOROSTUSVARIT[vari]]));
}

// Lisää tai poistaa sarjan korostuksen. Uusi sarja saa ensimmäisen vapaan värin; kun värit ovat lopussa, ei lisätä.
export function vaihdaKorostus(valitut, sarja) {
  if (valitut.some((k) => k.sarja === sarja)) return valitut.filter((k) => k.sarja !== sarja);
  const vari = KOROSTUSVARIT.findIndex((_, i) => !valitut.some((k) => k.vari === i));
  return vari < 0 ? valitut : [...valitut, { sarja, vari }];
}

// Selaimeen tallennetut korostukset tarkistettuina: tuntemattomat ja päällekkäiset värit pois.
export function tallennetutKorostukset(arvo) {
  if (!Array.isArray(arvo)) return [];
  const tulos = [];
  for (const k of arvo) {
    if (typeof k?.sarja !== 'string' || !Number.isInteger(k.vari) || !KOROSTUSVARIT[k.vari]) continue;
    if (tulos.some((t) => t.sarja === k.sarja || t.vari === k.vari)) continue;
    tulos.push({ sarja: k.sarja, vari: k.vari });
  }
  return tulos;
}

// Ryhmät lähtöajan mukaan valittuna päivänä: [{ aika, ryhmat }] aikajärjestyksessä; ryhmät ilman aikaa
// viimeisenä (aika ''). ajat(ryhma) palauttaa ryhmän lähtöajat [{ avain, aika }]. Sama kellonaika eri
// kirjoitusasuissa (9:00, 09:00, 9.00) on yksi lähtö, ja otsikoksi tulee ensimmäinen kirjoitusasu.
export function ryhmatAjoittain(ryhmat, ajat, paivaAvain) {
  const lahdot = new Map();
  for (const ryhma of ryhmat || []) {
    const lahto = (ajat(ryhma) || []).find((a) => a.avain === paivaAvain);
    const aika = String(lahto?.aika || '').trim();
    const arvo = aika ? toSortValue(aika) : Infinity;
    const avain = arvo === Number.MAX_SAFE_INTEGER ? aika : arvo;
    if (!lahdot.has(avain)) lahdot.set(avain, { aika, arvo, ryhmat: [] });
    lahdot.get(avain).ryhmat.push(ryhma);
  }
  return [...lahdot.values()].sort((a, b) => a.arvo - b.arvo).map(({ aika, ryhmat: r }) => ({ aika, ryhmat: r }));
}
