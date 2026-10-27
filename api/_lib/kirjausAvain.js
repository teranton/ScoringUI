// Mobiilikirjauksen koodi: allekirjoitettu avain, joka antaa kirjoittaa yhden kisan yhden tulossarakkeen
// (Compak-rata, ratakoodi) tai yhden ryhmän (Sporting / FITASC / ESP, ryhmäkoodi) kortteja.
// Muoto "v1.<payload>.<allekirjoitus>", payload on base64url-JSON { s: sheetId, c: tulossarake (1..),
// e: voimassa asti (Unix-sekunnit) } tai ryhmäkoodissa { s, r: ryhmä (1..), e }, allekirjoitus HMAC-SHA256
// merkkijonosta "v1.<payload>" salaisuudella KIRJAUS_SALAISUUS. ScoringLib tekee samat avaimet
// (sama salaisuus skriptin ominaisuuksissa), joten avaimia ei tarvitse tallentaa mihinkään.
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSIO = 'v1';
export const MAKS_SARAKE = 50;
export const MAKS_RYHMA = 200;

function allekirjoitus(salaisuus, viesti) {
  return createHmac('sha256', salaisuus).update(viesti).digest('base64url');
}

export function luoAvain({ sheetId, sarake, ryhma, voimassaAsti }, salaisuus) {
  const sisalto = ryhma !== undefined ? { s: sheetId, r: ryhma, e: voimassaAsti } : { s: sheetId, c: sarake, e: voimassaAsti };
  const payload = Buffer.from(JSON.stringify(sisalto)).toString('base64url');
  const viesti = `${VERSIO}.${payload}`;
  return `${viesti}.${allekirjoitus(salaisuus, viesti)}`;
}

// Palauttaa { sheetId, sarake, voimassaAsti } (ratakoodi), { sheetId, ryhma, voimassaAsti } (ryhmäkoodi) tai { virhe }.
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
  const voimassaAsti = data?.e;
  const valilla = (n, maks) => Number.isInteger(n) && n >= 1 && n <= maks;
  const ryhmalle = data?.r !== undefined;
  const kohde = ryhmalle ? data.r : data?.c;
  if (!/^[A-Za-z0-9_-]{20,}$/.test(sheetId) || !valilla(kohde, ryhmalle ? MAKS_RYHMA : MAKS_SARAKE)
    || (ryhmalle && data?.c !== undefined) || !Number.isInteger(voimassaAsti)) {
    return { virhe: 'Ratakoodi on virheellinen' };
  }
  if (voimassaAsti < nytSek) return { virhe: 'Ratakoodi on vanhentunut' };
  return ryhmalle ? { sheetId, ryhma: kohde, voimassaAsti } : { sheetId, sarake: kohde, voimassaAsti };
}
