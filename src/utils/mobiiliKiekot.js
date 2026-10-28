// Tulosten kiekkonäkymä (src/HenkiloTulokset.jsx): Sporting / FITASC / ESP -aseman kiekot ryhmäpuhelimen korteista
// (MOBIILI Layout N, api/kisa.js antaa vain NRO, NIMI, ASEMA k ja kiekot k/1..). Tulokset Y:ssä ei ole ampujan
// numeroa, joten kortti haetaan nimellä. Puhtaita funktioita (mobiiliKiekot.test.js).
import { parseCsvRows } from './csv.js';

// Ryhmäkorttien välilehdet: layouteja on enintään 8 (RATA1_NIMI..RATA8_NIMI); puuttuvat jäävät pois (notFound).
export const RYHMAKORTTI_VALILEHDET = Array.from({ length: 8 }, (_, i) => `MOBIILI Layout ${i + 1}`);

export const nimiAvaimeksi = (nimi) => String(nimi || '').replace(/\u200B/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

// Onko kisassa ryhmäpuhelimia (MOBIILI_RYHMAT-välilehdellä ryhmärivi).
export function onkoRyhmaKortteja(csv) {
  return parseCsvRows(csv || '').slice(1).some((rivi) => /^\d+$/.test(String(rivi[0] ?? '').trim()));
}

// Ryhmäkortit nimen mukaan: Map nimiavain → { nro, nimi, asemat: { k: merkit } } (merkit X/O/-, kiekko kerrallaan).
// Sama nimi kahdella eri numerolla on epäselvä: sitä ei näytetä (arvo null).
export function lueRyhmaKortit(csvByName = {}) {
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
      const nro = Number.parseInt(String(rivi[iNro] ?? '').trim(), 10);
      const avain = nimiAvaimeksi(rivi[iNimi]);
      if (!Number.isInteger(nro) || !avain) return;
      const asemat = {};
      Object.entries(kiekot).forEach(([asema, lista]) => {
        const merkit = lista.map(({ i }) => {
          const m = String(rivi[i] ?? '').trim().toUpperCase();
          return m === 'X' || m === 'O' ? m : '-';
        }).join('');
        if (/[XO]/.test(merkit)) asemat[asema] = merkit;
      });
      const aiempi = kortit.get(avain);
      if (aiempi === null || (aiempi && aiempi.nro !== nro)) {
        kortit.set(avain, null);
        return;
      }
      kortit.set(avain, { nro, nimi: String(rivi[iNimi]).trim(), asemat: { ...(aiempi?.asemat || {}), ...asemat } });
    });
  });
  return kortit;
}

// Ampujan aseman kiekot: { merkit, osumat } tai null (ei korttia tai asemalla ei merkintöjä).
export function asemanKiekot(kortit, nimi, asema) {
  const kortti = kortit?.get(nimiAvaimeksi(nimi));
  const merkit = kortti?.asemat?.[String(Number(asema))];
  if (!merkit) return null;
  return { merkit, osumat: [...merkit].filter((m) => m === 'X').length };
}
