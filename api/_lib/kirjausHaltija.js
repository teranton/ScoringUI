// Mobiilikirjauksen radan haltija: yksi laite kerrallaan saa kirjoittaa radan kortteja.
// MOBIILI_LAITTEET-välilehdellä on rivi per rata (rivi = tulossarake + 1): sukupolvi, haltijalaite ja linjan tila.
// Laite saa ottaessaan haltija-avaimen "h1.<sukupolvi>.<allekirjoitus>" (HMAC: kisa, rata, sukupolvi, laite).
// Avain kelpaa, kun taulukon rivillä on sama sukupolvi ja laite. Jokainen haltijan vaihto kasvattaa sukupolvea,
// joten vanha laite ei voi enää kirjoittaa. Vapaan radan saa ottaa suoraan; varatun radan haltijan luvalla
// (siirto: vanhan laitteen haltija-avain) tai kilpailutoimiston vaihto-PIN-koodilla. PIN lasketaan sukupolvesta
// (ScoringLib laskee saman, Mobiilikirjaus.vaihtoPin), joten se kelpaa vain yhteen vaihtoon.
// Puhtaat funktiot, ei Google-kutsuja (kirjausHaltija.test.js).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MAKS_NRO } from './kirjausData.js';

export const LAITTEET_VALILEHTI = 'MOBIILI_LAITTEET';
export const LAITTEET_OTSIKKO = ['RATA', 'SUKUPOLVI', 'LAITE', 'LAITTEEN NIMI', 'OTETTU', 'TAPA', 'PIN-VIRHEET', 'LINJA', 'LINJA PÄIVITETTY'];
// LINJA-sarakkeen indeksi: haltijan vaihto kirjoittaa sarakkeet ennen sitä, linjan tallennus vain LINJA-sarakkeet.
export const LINJA_SARAKE = 7;
export const MAKS_PIN_VIRHEET = 10;
const MAKS_LAITTEEN_NIMI = 40;

const allekirjoita = (salaisuus, viesti) => createHmac('sha256', salaisuus).update(viesti).digest();

export function haltijaAvain({ sheetId, sarake, sukupolvi, laite }, salaisuus) {
  const sig = allekirjoita(salaisuus, `h1|${sheetId}|${sarake}|${sukupolvi}|${laite}`).toString('base64url');
  return `h1.${sukupolvi}.${sig}`;
}

// Onko avain radan nykyisen haltijan (rivi: lueLaiteRivi) ja tämän laitteen.
export function onHaltija(avain, rivi, { sheetId, sarake, laite }, salaisuus) {
  const osat = String(avain || '').split('.');
  if (osat.length !== 3 || osat[0] !== 'h1' || !/^\d+$/.test(osat[1])) return false;
  const sukupolvi = Number(osat[1]);
  if (!rivi?.laite || rivi.laite !== laite || rivi.sukupolvi !== sukupolvi) return false;
  const odotettu = Buffer.from(haltijaAvain({ sheetId, sarake, sukupolvi, laite }, salaisuus));
  const saatu = Buffer.from(String(avain));
  return odotettu.length === saatu.length && timingSafeEqual(odotettu, saatu);
}

// Vaihto-PIN: 4 numeroa HMAC:sta (4 ensimmäistä tavua etumerkittömänä lukuna mod 10000).
export function vaihtoPin({ sheetId, sarake, sukupolvi }, salaisuus) {
  const tavut = allekirjoita(salaisuus, `pin|${sheetId}|${sarake}|${sukupolvi}`);
  return String(tavut.readUInt32BE(0) % 10000).padStart(4, '0');
}

// MOBIILI_LAITTEET-rivi → { sukupolvi, laite, nimi, otettu, tapa, pinVirheet, linja }. Puuttuva rivi on vapaa rata.
export function lueLaiteRivi(rivi) {
  const r = Array.isArray(rivi) ? rivi : [];
  const luku = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  };
  let linja;
  try {
    linja = r[LINJA_SARAKE] ? tarkistaLinja(JSON.parse(String(r[LINJA_SARAKE]))).linja || null : null;
  } catch {
    linja = null;
  }
  return {
    sukupolvi: luku(r[1]),
    laite: String(r[2] ?? '').trim(),
    nimi: String(r[3] ?? ''),
    otettu: String(r[4] ?? ''),
    tapa: String(r[5] ?? ''),
    pinVirheet: luku(r[6]),
    linja
  };
}

// Haltijan vaihdon rivi (sarakkeet ennen LINJA:a; linjan tila jää ennalleen).
export const haltijaRivi = (sarake, { sukupolvi, laite, nimi, otettu, tapa, pinVirheet }) =>
  [sarake, sukupolvi, laite, nimi, otettu, tapa, pinVirheet];

// Mitä laitteelle kerrotaan haltijasta (ei toisen laitteen tunnusta: sillä ja ratakoodilla voisi kirjoittaa).
export function julkinenHaltija(rivi, laite) {
  return {
    vapaa: !rivi.laite,
    oma: Boolean(rivi.laite) && rivi.laite === laite,
    nimi: rivi.nimi,
    otettu: rivi.otettu,
    tapa: rivi.tapa,
    lukittu: rivi.pinVirheet >= MAKS_PIN_VIRHEET
  };
}

export const puhdasTeksti = (t, maks) => [...String(t ?? '')].filter((c) => c >= ' ' && c !== '\u007f').join('').trim().slice(0, maks);
export const laitteenNimi = (nimi) => puhdasTeksti(nimi, MAKS_LAITTEEN_NIMI);

// Linjan tila, jonka uusi laite saa radan mukana: laitteella lisätyt ja ohitetut ampujat, tauot, keskeyttäneet
// ja laitteella valittu ohjelma (src/kirjaus/KirjausApp.jsx). Palauttaa { linja } (siistitty) tai { virhe }.
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
