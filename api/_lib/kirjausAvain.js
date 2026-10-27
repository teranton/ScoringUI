// Mobiilikirjauksen ratakoodi: allekirjoitettu avain, joka antaa kirjoittaa yhden kisan yhden tulossarakkeen
// (Compak-rata) kortteja. Muoto "v1.<payload>.<allekirjoitus>", payload on base64url-JSON
// { s: sheetId, c: tulossarake (1..), e: voimassa asti (Unix-sekunnit) }, allekirjoitus HMAC-SHA256
// merkkijonosta "v1.<payload>" salaisuudella KIRJAUS_SALAISUUS. ScoringLib tekee samat avaimet
// (sama salaisuus skriptin ominaisuuksissa), joten avaimia ei tarvitse tallentaa mihinkään.
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSIO = 'v1';
export const MAKS_SARAKE = 50;

function allekirjoitus(salaisuus, viesti) {
  return createHmac('sha256', salaisuus).update(viesti).digest('base64url');
}

export function luoAvain({ sheetId, sarake, voimassaAsti }, salaisuus) {
  const payload = Buffer.from(JSON.stringify({ s: sheetId, c: sarake, e: voimassaAsti })).toString('base64url');
  const viesti = `${VERSIO}.${payload}`;
  return `${viesti}.${allekirjoitus(salaisuus, viesti)}`;
}

// Palauttaa { sheetId, sarake, voimassaAsti } tai { virhe }.
export function tarkistaAvain(avain, salaisuus, nytSek = Math.floor(Date.now() / 1000)) {
  if (!salaisuus || String(salaisuus).length < 16) return { virhe: 'Mobiilikirjausta ei ole otettu käyttöön palvelimella' };
  const osat = String(avain || '').trim().split('.');
  if (osat.length !== 3 || osat[0] !== VERSIO) return { virhe: 'Ratakoodi on virheellinen' };

  const odotettu = Buffer.from(allekirjoitus(salaisuus, `${osat[0]}.${osat[1]}`));
  const saatu = Buffer.from(osat[2]);
  if (odotettu.length !== saatu.length || !timingSafeEqual(odotettu, saatu)) return { virhe: 'Ratakoodi on virheellinen' };

  let data;
  try {
    data = JSON.parse(Buffer.from(osat[1], 'base64url').toString('utf8'));
  } catch {
    return { virhe: 'Ratakoodi on virheellinen' };
  }
  const sheetId = typeof data?.s === 'string' ? data.s : '';
  const sarake = data?.c;
  const voimassaAsti = data?.e;
  if (!/^[A-Za-z0-9_-]{20,}$/.test(sheetId) || !Number.isInteger(sarake) || sarake < 1 || sarake > MAKS_SARAKE
    || !Number.isInteger(voimassaAsti)) {
    return { virhe: 'Ratakoodi on virheellinen' };
  }
  if (voimassaAsti < nytSek) return { virhe: 'Ratakoodi on vanhentunut' };
  return { sheetId, sarake, voimassaAsti };
}
