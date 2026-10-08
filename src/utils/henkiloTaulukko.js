// src/utils/henkiloTaulukko.js
// HenkiloTaulukko-näkymän puhdas parsinta- ja laskentalogiikka.
import { muodostaRatkoNakyma } from './henkiloTulokset.js';

export function parsiTaulukkoAmpujat(raakaRivit, ratojenMaara) {
  if (!Array.isArray(raakaRivit) || raakaRivit.length < 2) return [];

  const otsikot = (raakaRivit[0] || []).map((o) => String(o || '').toUpperCase());
  const otsikotNormalisoitu = otsikot.map((o) => o.replace(/[^A-Z0-9]/g, ''));

  const etsiSarakkeenIndeksi = (ehdot) => {
    for (const ehto of ehdot) {
      const idx = otsikotNormalisoitu.findIndex((h) => ehto(h));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxNimi = etsiSarakkeenIndeksi([(h) => h === 'NIMI', (h) => h.includes('NIMI')]);
  const idxSarja = etsiSarakkeenIndeksi([(h) => h === 'SARJA', (h) => h.includes('SARJA')]);
  const idxSeura = etsiSarakkeenIndeksi([(h) => h === 'SEURA', (h) => h.includes('SEURA')]);
  const idxLa = etsiSarakkeenIndeksi([
    (h) => h === 'LA',
    (h) => h === 'AP',
    (h) => h.startsWith('LAUANTAI'),
    (h) => h.startsWith('AAMUP')
  ]);
  const idxSu = etsiSarakkeenIndeksi([
    (h) => h === 'SU',
    (h) => h === 'IP',
    (h) => h.startsWith('SUNNUNTAI'),
    (h) => h.startsWith('ILTAP')
  ]);
  const idxRata1 = otsikot.findIndex((o) => o.trim() === '1');
  const idxRatkoOtsikko = etsiSarakkeenIndeksi([(h) => h === 'RATKO', (h) => h.startsWith('RATKO')]);

  const nimiFallback = 0;
  const sarjaFallback = 1;
  const yhteistulosFallback = 3;
  const rata1Fallback = 6;

  const nimiIndeksi = idxNimi !== -1 ? idxNimi : nimiFallback;
  const sarjaIndeksi = idxSarja !== -1 ? idxSarja : sarjaFallback;
  const aloitusIndeksi = idxRata1 !== -1 ? idxRata1 : rata1Fallback;
  const idxRatko = idxRatkoOtsikko !== -1 ? idxRatkoOtsikko : (aloitusIndeksi + ratojenMaara + 1);
  const idxRatko2 = idxRatko !== -1 ? idxRatko + 1 : -1;

  const rataSarakkeet = [];
  for (let col = aloitusIndeksi; col < otsikot.length; col++) {
    const otsikko = String(otsikot[col] || '').trim();
    if (/^\d+$/.test(otsikko)) {
      rataSarakkeet.push(col);
      continue;
    }
    if (rataSarakkeet.length > 0) break;
  }

  let idxTulos = etsiSarakkeenIndeksi([(h) => h === 'TULOS', (h) => h.startsWith('TULOS'), (h) => h === 'YHT', (h) => h.startsWith('YHT')]);
  if (idxTulos === -1 && idxSeura !== -1) {
    idxTulos = idxSeura + 1;
  }
  if (idxTulos === -1) {
    idxTulos = yhteistulosFallback;
  }

  const lista = [];

  for (let i = 1; i < raakaRivit.length; i++) {
    const row = raakaRivit[i];
    if (!row || !row[nimiIndeksi]) continue;

    const name = row[nimiIndeksi] || '';
    const category = row[sarjaIndeksi] || '';
    const seura = idxSeura !== -1 ? (row[idxSeura] || '') : '';
    const la = idxLa !== -1 ? (row[idxLa] || '') : null;
    const su = idxSu !== -1 ? (row[idxSu] || '') : null;
    const yhteistulos = row[idxTulos] || '0';
    const ratko = idxRatko !== -1 ? row[idxRatko] || '' : '';
    const ratko2 = idxRatko2 !== -1 ? row[idxRatko2] || '' : '';
    const ratkoNaytto = muodostaRatkoNakyma(ratko, ratko2);

    const eratMap = {};
    if (rataSarakkeet.length > 0) {
      for (const col of rataSarakkeet) {
        const otsikko = String(otsikot[col] || '').trim();
        const eraNum = parseInt(otsikko, 10);
        if (!Number.isNaN(eraNum)) {
          eratMap[eraNum] = row[col] !== undefined ? row[col] : '';
        }
      }
    } else {
      for (let col = aloitusIndeksi; col <= aloitusIndeksi + ratojenMaara - 1; col++) {
        const eraNum = (col - aloitusIndeksi) + 1;
        eratMap[eraNum] = row[col] !== undefined ? row[col] : '';
      }
    }

    lista.push({
      id: `${name}|${i}`,
      nimi: name,
      sarja: category,
      seura,
      la,
      su,
      tulos: yhteistulos,
      kokonaistulos: yhteistulos,
      ratko,
      ratko2,
      ratkoNaytto,
      erat: eratMap
    });
  }
  return lista;
}

export function tunnistaPaivaSarakeNimet(raakaRivit, locale) {
  const fallback = {
    laLabel: locale === 'en' ? 'Sat' : 'La',
    suLabel: locale === 'en' ? 'Sun' : 'Su'
  };

  try {
    if (!Array.isArray(raakaRivit) || raakaRivit.length < 1) return fallback;

    const otsikot = (raakaRivit[0] || []).map((o) => String(o || '').toUpperCase());
    const otsikotNormalisoitu = otsikot.map((o) => o.replace(/[^A-Z0-9]/g, ''));

    const etsiSarakkeenIndeksi = (ehdot) => {
      for (const ehto of ehdot) {
        const idx = otsikotNormalisoitu.findIndex((h) => ehto(h));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idxLa = etsiSarakkeenIndeksi([
      (h) => h === 'LA',
      (h) => h === 'AP',
      (h) => h.startsWith('LAUANTAI'),
      (h) => h.startsWith('AAMUP')
    ]);
    const idxSu = etsiSarakkeenIndeksi([
      (h) => h === 'SU',
      (h) => h === 'IP',
      (h) => h.startsWith('SUNNUNTAI'),
      (h) => h.startsWith('ILTAP')
    ]);

    const laOtsikko = idxLa !== -1 ? String(otsikotNormalisoitu[idxLa] || '') : '';
    const suOtsikko = idxSu !== -1 ? String(otsikotNormalisoitu[idxSu] || '') : '';

    const kaytaAp = laOtsikko === 'AP' || laOtsikko.startsWith('AAMUP');
    const kaytaIp = suOtsikko === 'IP' || suOtsikko.startsWith('ILTAP');

    return {
      laLabel: kaytaAp ? 'AP' : fallback.laLabel,
      suLabel: kaytaIp ? 'IP' : fallback.suLabel
    };
  } catch {
    return fallback;
  }
}

export function jarjestaAmpujat(ampujat, sarake, suunta) {
  const numOrMin = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? Number.MIN_SAFE_INTEGER : parsed;
  };

  const haeArvo = (ampuja, sarake) => {
    if (sarake === 'sija') return numOrMin(ampuja?.laskettuSija);
    if (sarake === 'nimi') return String(ampuja?.nimi || '').toLowerCase();
    if (sarake === 'sarja') return String(ampuja?.sarja || '').toLowerCase();
    if (sarake === 'seura') return String(ampuja?.seura || '').toLowerCase();
    if (sarake === 'la') return numOrMin(ampuja?.la);
    if (sarake === 'su') return numOrMin(ampuja?.su);
    if (sarake === 'tulos') return numOrMin(ampuja?.kokonaistulos || ampuja?.tulos);
    if (sarake === 'ratko') {
      const ratkoTeksti = `${ampuja?.ratko || ''} ${ampuja?.ratko2 || ''}`.trim();
      const ratkoNumero = parseInt(ratkoTeksti, 10);
      if (!Number.isNaN(ratkoNumero)) return ratkoNumero;
      return ratkoTeksti.toLowerCase();
    }
    if (sarake.startsWith('era-')) {
      const eraNumero = parseInt(sarake.split('-')[1], 10);
      return numOrMin(ampuja?.erat?.[eraNumero]);
    }
    return String(ampuja?.nimi || '').toLowerCase();
  };

  return [...ampujat].sort((a, b) => {
    const arvoA = haeArvo(a, sarake);
    const arvoB = haeArvo(b, sarake);

    if (typeof arvoA === 'number' && typeof arvoB === 'number') {
      if (arvoA === arvoB) return 0;
      return suunta === 'asc' ? arvoA - arvoB : arvoB - arvoA;
    }

    const cmp = String(arvoA).localeCompare(String(arvoB), 'fi', { sensitivity: 'base', numeric: true });
    return suunta === 'asc' ? cmp : -cmp;
  });
}

export function laskeRataTilastot(ampujat, radatList, asemaMaksimit) {
  const parseRataArvo = (arvo) => {
    const teksti = String(arvo ?? '').trim().toUpperCase();
    if (!teksti || teksti === '-' || teksti === '—' || teksti === 'N/A') return null;
    const num = parseInt(teksti, 10);
    return Number.isNaN(num) ? null : num;
  };

  const laskeMediaani = (arr) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const keskikohta = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) return sorted[keskikohta];
    return (sorted[keskikohta - 1] + sorted[keskikohta]) / 2;
  };

  return radatList.map((rataNumero) => {
    const arvot = [];

    for (const ampuja of ampujat) {
      const parsed = parseRataArvo(ampuja?.erat?.[rataNumero]);
      if (parsed === null) {
        continue;
      } else {
        arvot.push(parsed);
      }
    }

    const count = arvot.length;
    const avg = count ? (arvot.reduce((sum, value) => sum + value, 0) / count) : null;
    const median = laskeMediaani(arvot);
    const maksimiTulos = asemaMaksimit[rataNumero] || asemaMaksimit[`${rataNumero}`];
    const maxHits = (count && maksimiTulos !== undefined)
      ? arvot.filter((value) => value === maksimiTulos).length
      : 0;
    const maxPct = count ? ((maxHits / count) * 100) : null;

    return {
      rataNumero,
      count,
      avg,
      median,
      maxPct
    };
  });
}

export function onkoAliTulosPuuttuu(arvo) {
  const teksti = String(arvo ?? '').trim().toUpperCase();
  return teksti === '' || teksti === '-' || teksti === '—' || teksti === 'N/A';
}
