// src/utils/kisaStatus.js
// Kilpailun tilan (tulossa/käynnissä/tauolla/päättynyt) laskenta päivämääristä ja KISANSPEKSIT-ohituksesta.
import { asetusJoukko, asetusTulkitsija, haeAsetusSpekseista } from './kisaAsetukset.js';

// Hyväksyy muodot p.k.vvvv ja vvvv-kk-pp. Palauttaa paikallisen keskiyön tai null.
export function parsiPaivamaara(pvmStr) {
  const teksti = String(pvmStr || '').trim();
  if (!teksti) return null;

  const iso = teksti.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const osat = iso ? [iso[3], iso[2], iso[1]] : teksti.split('.');
  if (osat.length !== 3) return null;

  const paiva = parseInt(osat[0], 10);
  const kuukausi = parseInt(osat[1], 10);
  const vuosi = parseInt(osat[2], 10);

  if (
    !Number.isInteger(paiva) ||
    !Number.isInteger(kuukausi) ||
    !Number.isInteger(vuosi) ||
    kuukausi < 1 ||
    kuukausi > 12 ||
    paiva < 1 ||
    paiva > 31
  ) {
    return null;
  }

  const date = new Date(vuosi, kuukausi - 1, paiva);
  if (
    date.getFullYear() !== vuosi ||
    date.getMonth() !== kuukausi - 1 ||
    date.getDate() !== paiva
  ) {
    return null;
  }

  return date;
}

export function laskeOnkoIlmoittautuminenPaattynyt(alkuStr, nykyhetki = new Date()) {
  if (!alkuStr) return true;
  const aloitusPaiva = parsiPaivamaara(alkuStr);
  if (!aloitusPaiva) return true;

  const takaraja = new Date(aloitusPaiva.getTime());
  takaraja.setHours(10, 0, 0, 0);

  return nykyhetki >= takaraja;
}

export function laskeKisanStatusJaTyyli(alkuStr, loppuStr, nyt = new Date()) {
  if (!alkuStr) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };

  const nollatunnit = (d) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const tanaandDate = nollatunnit(new Date(nyt.getTime()));
  const alkuDate = parsiPaivamaara(alkuStr);
  const loppuDate = loppuStr ? parsiPaivamaara(loppuStr) : alkuDate;

  if (!alkuDate || !loppuDate) {
    return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
  }

  if (tanaandDate < alkuDate) return { teksti: "Tulossa", tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
  if (tanaandDate > loppuDate) return { teksti: "Päättynyt", tyyli: { background: '#f1f3f4', color: '#3c4043' }, status: 'paattynyt' };
  return { teksti: "Käynnissä", tyyli: { background: '#e6f4ea', color: '#137333' }, status: 'kaynnissa' };
}

// Hyväksytyt avaimet ja arvot ovat ne, joita kilpailutiedostot käyttävät.
const tulkitseStatusArvo = asetusTulkitsija([
  ['paattynyt', ['FINISHED']],
  ['kaynnissa', ['RUNNING']],
  ['tauolla', ['PAUSED']],
  ['tulossa', ['UPCOMING']]
]);

const STATUS_AVAIMET = asetusJoukko(['KILPAILUNSTATUS']);

export function haeStatusOverrideSpekseista(speksitData) {
  return haeAsetusSpekseista(speksitData, STATUS_AVAIMET, tulkitseStatusArvo);
}

export function laskeKisanEfektiivinenStatus(alkuStr, loppuStr, speksitData, nyt = new Date()) {
  const oletus = laskeKisanStatusJaTyyli(alkuStr, loppuStr, nyt);

  // Date-active competitions are controlled by sheet status flag.
  const override = haeStatusOverrideSpekseista(speksitData);
  if (override === 'paattynyt') {
    return { teksti: 'Päättynyt', tyyli: { background: '#f1f3f4', color: '#3c4043' }, status: 'paattynyt' };
  }

  if (oletus.status !== 'kaynnissa') return oletus;

  if (!override) {
    return { teksti: 'Tulossa', tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
  }
  if (override === 'kaynnissa') {
    return { teksti: 'Käynnissä', tyyli: { background: '#e6f4ea', color: '#137333' }, status: 'kaynnissa' };
  }
  if (override === 'tauolla') {
    return { teksti: 'Tauolla', tyyli: { background: '#fff4e5', color: '#8a4b00' }, status: 'tauolla' };
  }
  return { teksti: 'Tulossa', tyyli: { background: '#e8f0fe', color: '#1a73e8' }, status: 'tulossa' };
}
