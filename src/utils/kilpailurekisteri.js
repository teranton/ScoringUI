// src/utils/kilpailurekisteri.js
// Kilpailurekisterin rivien tulkinta ja kisojen ryhmittely etusivulle.
import { parsiPaivamaara } from './kisaStatus.js';

function muunnaPaivamaaraJarjestysavaimeksi(pvmStr) {
  if (!pvmStr) return null;

  const teksti = String(pvmStr).trim();
  if (!teksti) return null;

  if (teksti.includes('.')) {
    const osat = teksti.split('.');
    if (osat.length !== 3) return null;
    const paiva = osat[0]?.trim();
    const kuukausi = osat[1]?.trim();
    const vuosi = osat[2]?.trim();
    if (!paiva || !kuukausi || !vuosi) return null;
    if (!/^\d+$/.test(paiva) || !/^\d+$/.test(kuukausi) || !/^\d{4}$/.test(vuosi)) return null;
    return `${vuosi}-${kuukausi.padStart(2, '0')}-${paiva.padStart(2, '0')}`;
  }

  if (teksti.includes('-')) {
    const osat = teksti.split('-');
    if (osat.length !== 3) return null;
    const vuosi = osat[0]?.trim();
    const kuukausi = osat[1]?.trim();
    const paiva = osat[2]?.trim();
    if (!paiva || !kuukausi || !vuosi) return null;
    if (!/^\d{4}$/.test(vuosi) || !/^\d+$/.test(kuukausi) || !/^\d+$/.test(paiva)) return null;
    return `${vuosi}-${kuukausi.padStart(2, '0')}-${paiva.padStart(2, '0')}`;
  }

  return null;
}

export function haeKisanVuosi(kisa) {
  const alku = parsiPaivamaara(kisa?.alkuPvm);
  if (alku) return alku.getFullYear();

  const loppu = parsiPaivamaara(kisa?.loppuPvm);
  if (loppu) return loppu.getFullYear();

  const fallback = String(kisa?.alkuPvm || kisa?.loppuPvm || '');
  const osuma = fallback.match(/(19|20)\d{2}/);
  return osuma ? parseInt(osuma[0], 10) : null;
}

function muotoileIsoPaivamaaraSuomeksi(pvmStr) {
  if (!pvmStr || !pvmStr.includes('-')) return pvmStr;
  const osat = pvmStr.split('-');
  if (osat.length !== 3) return pvmStr;
  return `${parseInt(osat[2], 10)}.${parseInt(osat[1], 10)}.${osat[0]}`;
}

function tulkitseTotuusarvo(arvo) {
  if (arvo == null) return null;
  const normalisoitu = String(arvo).trim().toLowerCase();
  if (!normalisoitu) return null;

  if (['1', 'true', 'yes', 'on'].includes(normalisoitu)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalisoitu)) return false;
  return null;
}

export function arvioiJoukkuekisaNimesta(kisaNimi) {
  return String(kisaNimi || '').includes('SM');
}

export function parsiKilpailurekisteri(raakaRivit) {
  const parsitutKisat = [];

  for (let i = 0; i < raakaRivit.length; i++) {
    const row = raakaRivit[i];

    if (i === 0 && (row[1]?.toLowerCase().includes('nimi') || row[0]?.toLowerCase().includes('id'))) {
      continue;
    }

    if (row[1] || row[0]) {
      const joukkueKisaAsetus = tulkitseTotuusarvo(row[5]);
      parsitutKisat.push({
        id: row[0] || i.toString(),
        nimi: row[1] || "Nimetön kisa",
        alkuPvm: muotoileIsoPaivamaaraSuomeksi(row[2]),
        loppuPvm: muotoileIsoPaivamaaraSuomeksi(row[3]),
        apiUrl: row[4] || "",
        joukkueKisaAsetus,
        piilotettu: tulkitseTotuusarvo(row[6]) === true
      });
    }
  }

  parsitutKisat.sort((a, b) => {
    const aKey = muunnaPaivamaaraJarjestysavaimeksi(a.alkuPvm);
    const bKey = muunnaPaivamaaraJarjestysavaimeksi(b.alkuPvm);

    if (aKey && bKey) return bKey.localeCompare(aKey);
    if (aKey) return -1;
    if (bKey) return 1;
    return String(b.nimi || '').localeCompare(String(a.nimi || ''), 'fi');
  });

  return parsitutKisat;
}

export function ryhmitteleKisatVuosittain(kisat, kuluvaVuosi) {
  const vuosiMap = new Map();
  const ilmanVuotta = [];

  for (const kisa of kisat) {
    const vuosi = haeKisanVuosi(kisa);
    if (!Number.isInteger(vuosi)) {
      ilmanVuotta.push(kisa);
      continue;
    }

    if (!vuosiMap.has(vuosi)) {
      vuosiMap.set(vuosi, []);
    }
    vuosiMap.get(vuosi).push(kisa);
  }

  const vuodet = Array.from(vuosiMap.keys()).sort((a, b) => b - a);
  const aktiiviset = [];
  const vanhat = [];

  for (const vuosi of vuodet) {
    const ryhma = { vuosi, kisat: vuosiMap.get(vuosi) || [] };
    if (vuosi >= kuluvaVuosi) {
      aktiiviset.push(ryhma);
    } else {
      vanhat.push(ryhma);
    }
  }

  return { aktiiviset, vanhat, ilmanVuotta };
}
