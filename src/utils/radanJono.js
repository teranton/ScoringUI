// Compak-radan ampujajono aikataulusta, KISANSPEKSIT-avainten arvot ja laitteen linjan tilan tarkistus.
// Yhteiset mobiilikirjauksen API:lle (api/_lib/kirjausData.js) ja julkiselle ratanäkymälle (src/LiveRadat.jsx).
// Puhtaita funktioita.
import { normalisoiAsetus } from './kisaAsetukset.js';
import { isLaneHeader, isTimeLike, taukoTyyppi, tunnistaRataSarakkeet } from './aikatauluRadat.js';

// Suurin ampujan numero (MOBIILI-välilehden rivi = numero + 1).
export const MAKS_NRO = 999;
// Näyttöteksti: ohjausmerkit pois ja pituus rajattu.
export const puhdasTeksti = (t, maks) => [...String(t ?? '')].filter((c) => c >= ' ' && c !== '\u007f').join('').trim().slice(0, maks);

// KISANSPEKSIT-avaimen arvo: avaimen oikealla puolella oleva solu, kuten ScoringLibin Speksit
// (tyhjän arvon viereinen Ohje-sarake ei saa näkyä arvona).
export function speksiArvo(rivit, avain) {
  const haettava = normalisoiAsetus(avain);
  for (const rivi of Array.isArray(rivit) ? rivit : []) {
    if (!Array.isArray(rivi)) continue;
    const i = rivi.findIndex((s) => normalisoiAsetus(String(s ?? '').trim()) === haettava);
    if (i === -1) continue;
    const arvo = String(rivi[i + 1] ?? '').trim();
    if (arvo) return arvo;
  }
  return '';
}

// Radan numerot otsikosta: "Rata 1" → [1], "RATA1 / RATA3" → [1, 3] (kierrokset allekkain), "1 Jake" → [1].
function otsikonRadat(label) {
  return String(label).split('/').map((osa) => Number.parseInt(osa.trim(), 10)).filter((n) => Number.isInteger(n));
}

function puhdasNimi(nimi) {
  return String(nimi || '').replace(/\u200B/g, '').trim();
}

// Aikataulun rata-ruudukko: [{ radat: [1, 3], kierrokset: [[{ nro, nimi, aika, taukoEnnen? }], ...] }] tai [] jos ei ruudukko.
export function jasennaRataruudukko(rivit) {
  if (!Array.isArray(rivit) || rivit.length < 2) return [];
  const kaistat = tunnistaRataSarakkeet(rivit);
  if (kaistat.length === 0) return [];
  const otsikkoRivi = rivit.findIndex((rivi) => Array.isArray(rivi) && rivi.some(isLaneHeader));

  const data = rivit.slice(otsikkoRivi + 1).filter(Array.isArray);
  // Otsikko voi olla aika- tai nimisarakkeen päällä (vanhoissa välilehdissä "Rata 1" nimen yllä):
  // kaistan alku on se sarake, jossa on aikoja ja jonka oikealla puolella numeroita.
  const osumia = (s) => data.filter((r) => isTimeLike(r[s]) && /^\d+$/.test(String(r[s + 1] ?? '').trim())).length;
  const alku = (kaista) => [kaista.startIndex, kaista.startIndex - 1, kaista.startIndex + 1]
    .filter((s) => s >= 0)
    .reduce((paras, s) => (osumia(s) > osumia(paras) ? s : paras), kaista.startIndex);

  return kaistat.map((kaista) => {
    const startIndex = alku(kaista);
    const kierrokset = [[]];
    let tauko = false;
    data.forEach((rivi) => {
      const aika = String(rivi[startIndex] ?? '').trim();
      const nro = String(rivi[startIndex + 1] ?? '').trim();
      const nimi = puhdasNimi(rivi[startIndex + 2]);
      const tyyppi = taukoTyyppi(nimi, nro);
      if (tyyppi === 'vaihto') {
        kierrokset.push([]);
        tauko = false;
        return;
      }
      // TAUKO-rivi: linja tyhjennetään ennen seuraavaa ampujaa (mobiilikirjauksen inline-linja).
      if (tyyppi === 'tauko') {
        tauko = kierrokset[kierrokset.length - 1].length > 0;
        return;
      }
      if (!/^\d+$/.test(nro)) return;
      // Pelkkä numero nimen paikalla on varattu mutta tyhjä paikka.
      if (!nimi || /^\d+$/.test(nimi)) return;
      kierrokset[kierrokset.length - 1].push({
        nro: Number(nro), nimi, aika: isTimeLike(aika) ? aika : '', ...(tauko ? { taukoEnnen: true } : {})
      });
      tauko = false;
    });
    return { radat: otsikonRadat(kaista.label), kierrokset };
  });
}

// Tulossarakkeen (Compak-rata) paikka aikataulussa ja radan ampujajono.
// aikataulut: [{ nimi, rivit }] järjestyksessä (Aikataulu, Aikataulu La, Aikataulu Su).
// Päivä: monen päivän aikataulussa LAYOUT/PÄIVÄ (sarakkeet 1..n ensimmäisenä päivänä, n+1.. seuraavana;
// kehitystaulukossa sunnuntain RATA1 on tulossarake 5). Kaista: se, jonka otsikossa on sarakkeen numero
// (RATA3, RATA1 / RATA3 → toinen kierros), muuten päivän n:s kaista.
// Jono: radan omat aloittajat, sitten edellisen radan aloittajat (jotka siirtyvät tälle radalle) jne.
// Palauttaa { aikataulu, kaista, kierros, jono, nimet } tai null, jos rataa ei löydy.
export function radanJono({ aikataulut, sarake, ratojaPaivassa }) {
  // Kaikki olemassa olevat aikataulut, myös ne, joissa ei (vielä) ole ruudukkoa: LAYOUT/PÄIVÄ laskee päivät niistä.
  // Master-pohjan ohjeteksti-välilehti Aikataulu ei ole päivä, jos päivien välilehdet (Aikataulu La/Su) ovat mukana.
  const paivat = aikataulut
    .map(({ nimi, rivit }) => ({ nimi, kaistat: jasennaRataruudukko(rivit) }))
    .filter((p, _, kaikki) => !(p.nimi === 'Aikataulu' && p.kaistat.length === 0 && kaikki.length > 1));

  const nimet = {};
  paivat.forEach((p) => p.kaistat.forEach((k) => k.kierrokset.flat().forEach((a) => {
    if (!nimet[a.nro]) nimet[a.nro] = a.nimi;
  })));

  // Monen päivän aikataulussa LAYOUT/PÄIVÄ ratkaisee päivän (päivät voivat käyttää samoja kaistanumeroita);
  // muuten haetaan kaistaa otsikon numerolla kaikista.
  const perPaiva = ratojaPaivassa > 0 ? ratojaPaivassa : (paivat.find((p) => p.kaistat.length > 0)?.kaistat.length || 0);
  const paivaKiintea = ratojaPaivassa > 0 && paivat.length > 1;
  const ehdokkaat = paivaKiintea ? [paivat[Math.floor((sarake - 1) / ratojaPaivassa)]].filter(Boolean) : paivat;
  let paikka = null;
  for (const paiva of ehdokkaat) {
    const kaista = paiva.kaistat.findIndex((k) => k.radat.includes(sarake));
    if (kaista !== -1) {
      paikka = { paiva, kaista, kierros: paiva.kaistat[kaista].radat.indexOf(sarake) };
      break;
    }
  }
  if (!paikka && perPaiva > 0) {
    const paiva = paivaKiintea ? ehdokkaat[0] : paivat[Math.floor((sarake - 1) / perPaiva)];
    const kaista = (sarake - 1) % perPaiva;
    if (paiva && kaista < paiva.kaistat.length) paikka = { paiva, kaista, kierros: 0 };
  }
  if (!paikka) return { aikataulu: null, kaista: null, kierros: null, jono: [], nimet };

  const { paiva, kaista, kierros } = paikka;
  const n = paiva.kaistat.length;
  const nahty = new Set();
  const jono = [];
  for (let askel = 0; askel < n; askel++) {
    const k = (kaista - askel + n) % n;
    (paiva.kaistat[k].kierrokset[kierros] || []).forEach((a) => {
      if (nahty.has(a.nro)) return;
      nahty.add(a.nro);
      jono.push({ ...a, lahtoRata: k + 1 });
    });
  }
  return { aikataulu: paiva.nimi, kaista: kaista + 1, kierros, jono, nimet };
}

// Linjan tila, jonka uusi laite saa radan mukana: laitteella lisätyt ja ohitetut ampujat, tauot, keskeyttäneet
// ja laitteella valittu ohjelma (src/kirjaus/KirjausApp.jsx). API tarkistaa tallennuksen
// (api/_lib/kirjausHaltija.js), julkinen ratanäkymä lukee MOBIILI_LAITTEET-välilehden LINJA-solun samalla funktiolla. Palauttaa { linja } (siistitty) tai { virhe }.
const MAKS_LISTA = 300;
export function tarkistaLinja(linja) {
  if (!linja || typeof linja !== 'object' || Array.isArray(linja)) return { virhe: 'Virheellinen linjan tila' };
  const nro = (n) => Number.isInteger(n) && n >= 1 && n <= MAKS_NRO;
  const numerot = (lista) => (Array.isArray(lista) ? [...new Set(lista.filter(nro))].slice(0, MAKS_LISTA) : []);
  const lisatyt = (Array.isArray(linja.lisatyt) ? linja.lisatyt : [])
    .filter((l) => l && nro(l.nro))
    .slice(0, MAKS_LISTA)
    .map((l) => ({
      nro: l.nro,
      ...(typeof l.nimi === 'string' && l.nimi ? { nimi: puhdasTeksti(l.nimi, 80) } : {}),
      ...(l.jalkeen === null || nro(l.jalkeen) ? { jalkeen: l.jalkeen } : {}),
      ...(Number.isInteger(l.kierroksesta) && l.kierroksesta >= 0 && l.kierroksesta <= 1000 ? { kierroksesta: l.kierroksesta } : {})
    }));
  const ohjelma = typeof linja.ohjelma === 'string' && /^[SD]{1,10}$/.test(linja.ohjelma) ? linja.ohjelma : null;
  return {
    linja: {
      lisatyt,
      ohitetut: numerot(linja.ohitetut),
      tauot: numerot(linja.tauot),
      tauotPois: numerot(linja.tauotPois),
      keskeyttaneet: numerot(linja.keskeyttaneet),
      ohjelma
    }
  };
}
