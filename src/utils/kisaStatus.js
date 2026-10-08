// src/utils/kisaStatus.js
// Kilpailun tilan (tulossa/käynnissä/tauolla/päättynyt) laskenta päivämääristä ja KISANSPEKSIT-ohituksesta.
import { parseCsvRows } from './csv.js';

export function parsiPaivamaara(pvmStr) {
  if (!pvmStr) return null;
  const osat = pvmStr.split('.');
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

function normalisoiStatusArvo(arvo) {
  const norm = String(arvo || '').trim().toUpperCase();
  if (!norm) return null;

  if (['PÄÄTTYNYT', 'PAATTYNYT', 'FINISHED', 'CLOSED', 'LOPPUNUT'].includes(norm)) return 'paattynyt';
  if (['KÄYNNISSÄ', 'KAYNNISSA', 'ONGOING', 'RUNNING', 'LIVE'].includes(norm)) return 'kaynnissa';
  if (['TAUOLLA', 'TAUKO', 'PAUSED', 'PAUSE', 'BREAK', 'INTERMISSION'].includes(norm)) return 'tauolla';
  if (['TULOSSA', 'UPCOMING', 'PENDING'].includes(norm)) return 'tulossa';
  return null;
}

export function haeStatusOverrideSpekseista(speksitData) {
  const rivit = Array.isArray(speksitData)
    ? speksitData
    : (typeof speksitData === 'string' && speksitData.trim().length >= 2 ? parseCsvRows(speksitData) : []);

  if (!Array.isArray(rivit) || rivit.length === 0) return null;

  const avainSanat = new Set([
    'STATUS', 'KISASTATUS', 'KISA_STATUS', 'KILPAILUNSTATUS', 'KILPAILU_STATUS',
    'COMPETITIONSTATUS', 'KISAPAATTYNYT', 'KISA_PAATTYNYT', 'KILPAILUPAATTYNYT', 'KILPAILU_PAATTYNYT'
  ]);

  for (const rivi of rivit) {
    if (!Array.isArray(rivi) || rivi.length === 0) continue;

    const solut = rivi.map((s) => String(s || '').trim());
    const normalisoidut = solut.map((s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, ''));

    for (let i = 0; i < normalisoidut.length; i++) {
      const avain = normalisoidut[i];
      if (!avainSanat.has(avain)) continue;

      const ehdokasArvot = [
        solut[i + 1], solut[i + 2], solut[i], ...solut
      ].filter(Boolean);

      for (const ehdokas of ehdokasArvot) {
        const status = normalisoiStatusArvo(ehdokas);
        if (status) return status;

        const boolNorm = String(ehdokas).trim().toLowerCase();
        if (['1', 'true', 'yes', 'on', 'x'].includes(boolNorm) && avain.includes('PAATTYNYT')) {
          return 'paattynyt';
        }
      }
    }
  }

  return null;
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
