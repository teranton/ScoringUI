// Tulosten kiekkonäkymä (src/HenkiloTulokset.jsx): Sporting / FITASC / ESP -aseman kiekot ryhmäpuhelimen korteista
// (MOBIILI Layout N, api/kisa.js antaa vain NRO, NIMI, ASEMA k ja kiekot k/1..) ja Compak-radan kiekot
// kirjauslaitteen korteista (MOBIILI Rata N → tulossarake N, kohteet 1..25). Tulokset Y:ssä ei ole ampujan
// numeroa, joten kortti haetaan nimellä. Puhtaita funktioita (mobiiliKiekot.test.js).
import { parseCsvRows } from './csv.js';
import { lueRadanKortit, mobiiliValilehti } from './mobiiliLive.js';

// Ryhmäkorttien välilehdet: layouteja on enintään 8 (RATA1_NIMI..RATA8_NIMI); puuttuvat jäävät pois (notFound).
export const RYHMAKORTTI_VALILEHDET = Array.from({ length: 8 }, (_, i) => `MOBIILI Layout ${i + 1}`);
// Compak-korttien välilehdet tulossarakkeiden mukaan (master-pohjassa enintään 24).
export const compakKorttiValilehdet = (sarakkeita) => Array.from(
  { length: Math.max(0, Math.min(24, Number(sarakkeita) || 0)) }, (_, i) => mobiiliValilehti(i + 1)
);

export const nimiAvaimeksi = (nimi) => String(nimi || '').replace(/\u200B/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

// Onko kisassa ryhmäpuhelimia (MOBIILI_RYHMAT-välilehdellä ryhmärivi).
export function onkoRyhmaKortteja(csv) {
  return parseCsvRows(csv || '').slice(1).some((rivi) => /^\d+$/.test(String(rivi[0] ?? '').trim()));
}

// Sama nimi kahdella eri numerolla on epäselvä: sitä ei näytetä (arvo null).
function lisaaKortti(kortit, nimi, nro, asemat, compak = false) {
  const avain = nimiAvaimeksi(nimi);
  if (!Number.isInteger(nro) || !avain) return;
  const aiempi = kortit.get(avain);
  if (aiempi === null || (aiempi && aiempi.nro !== nro)) {
    kortit.set(avain, null);
    return;
  }
  kortit.set(avain, { nro, nimi: String(nimi).trim(), compak: compak || Boolean(aiempi?.compak), asemat: { ...(aiempi?.asemat || {}), ...asemat } });
}

// Kortit nimen mukaan: Map nimiavain → { nro, nimi, compak, asemat: { k: merkit } } (merkit X/O/-, kiekko kerrallaan).
// Ryhmäkortilla k on asema, Compak-kortilla tulossarake (rata). Kisassa on vain toisenlaisia kortteja.
export function lueMobiiliKortit(csvByName = {}) {
  const kortit = new Map();
  RYHMAKORTTI_VALILEHDET.forEach((valilehti) => {
    const rivit = parseCsvRows(csvByName[valilehti] || '');
    const otsikko = (rivit[0] || []).map((s) => String(s ?? '').trim().toUpperCase());
    const iNro = otsikko.indexOf('NRO');
    const iNimi = otsikko.indexOf('NIMI');
    if (iNro === -1 || iNimi === -1) return;
    // Kiekkosarakkeet aseman mukaan kiekkojärjestyksessä: "3/1", "3/2" …
    const kiekot = {};
    otsikko.forEach((o, i) => {
      const m = o.match(/^(\d+)\/(\d+)$/);
      if (m) (kiekot[m[1]] ||= []).push({ i, kiekko: Number(m[2]) });
    });
    Object.values(kiekot).forEach((lista) => lista.sort((a, b) => a.kiekko - b.kiekko));
    rivit.slice(1).forEach((rivi) => {
      const asemat = {};
      Object.entries(kiekot).forEach(([asema, lista]) => {
        const merkit = lista.map(({ i }) => {
          const m = String(rivi[i] ?? '').trim().toUpperCase();
          return m === 'X' || m === 'O' ? m : '-';
        }).join('');
        if (/[XO]/.test(merkit)) asemat[asema] = merkit;
      });
      lisaaKortti(kortit, rivi[iNimi], Number.parseInt(String(rivi[iNro] ?? '').trim(), 10), asemat);
    });
  });
  Object.keys(csvByName).forEach((valilehti) => {
    const m = valilehti.match(/^MOBIILI Rata (\d+)$/);
    if (!m) return;
    const { kortit: radanKortit, nimet } = lueRadanKortit(csvByName[valilehti]);
    Object.entries(radanKortit).forEach(([nro, { merkit }]) => {
      if (nimet[nro] && /[XO]/.test(merkit)) lisaaKortti(kortit, nimet[nro], Number(nro), { [m[1]]: merkit }, true);
    });
  });
  return kortit;
}

// Ampujan aseman kiekot: { merkit, osumat, compak } tai null (ei korttia tai asemalla ei merkintöjä).
export function asemanKiekot(kortit, nimi, asema) {
  const kortti = kortit?.get(nimiAvaimeksi(nimi));
  const merkit = kortti?.asemat?.[String(Number(asema))];
  if (!merkit) return null;
  // Compak-kortti: 5 asemaa × 5 kohdetta, näytetään asemittain.
  return { merkit, osumat: [...merkit].filter((m) => m === 'X').length, compak: kortti.compak };
}
