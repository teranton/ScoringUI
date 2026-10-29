// Mobiilikirjauksen radan haltija: yksi laite kerrallaan saa kirjoittaa radan kortteja.
// MOBIILI_LAITTEET-välilehdellä on rivi per rata (rivi = tulossarake + 1): sukupolvi, haltijalaite ja linjan tila.
// Laite saa ottaessaan haltija-avaimen "h1.<sukupolvi>.<allekirjoitus>" (HMAC: kisa, rata, sukupolvi, laite).
// Avain kelpaa, kun taulukon rivillä on sama sukupolvi ja laite. Jokainen haltijan vaihto kasvattaa sukupolvea,
// joten vanha laite ei voi enää kirjoittaa. Vapaan radan saa ottaa suoraan; varatun radan haltijan luvalla
// (siirto: vanhan laitteen haltija-avain) tai kilpailutoimiston vaihto-PIN-koodilla. PIN lasketaan sukupolvesta
// (ScoringLib laskee saman, Mobiilikirjaus.vaihtoPin), joten se kelpaa vain yhteen vaihtoon.
// Puhtaat funktiot, ei Google-kutsuja (kirjausHaltija.test.js).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { KOHTEITA, MAKS_NRO, puhdasTeksti, tarkistaLinja } from './kirjausData.js';

export { tarkistaLinja };

export const LAITTEET_VALILEHTI = 'MOBIILI_LAITTEET';
export const LAITTEET_OTSIKKO = ['RATA', 'SUKUPOLVI', 'LAITE', 'LAITTEEN NIMI', 'OTETTU', 'TAPA', 'PIN-VIRHEET', 'LINJA', 'LINJA PÄIVITETTY', 'TÄYDENNYKSET'];
// LINJA-sarakkeen indeksi: haltijan vaihto kirjoittaa sarakkeet ennen sitä, linjan tallennus vain LINJA-sarakkeet.
export const LINJA_SARAKE = 7;
// TÄYDENNYKSET: korvattujen laitteiden merkinnät { nro: merkit } radan haltijalle. Vain korvattu laite kirjoittaa
// tämän solun (haltija ei), joten radan kortteja kirjoittaa edelleen vain haltija.
export const TAYDENNYS_SARAKE = 9;
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

// Ryhmäpuhelimen haltijat (MOBIILI_RYHMAT, rivi = ryhmä + 1): samat sarakkeet, ensimmäisenä RYHMÄ. Ryhmän
// täydennysten avain on "<layout>:<nro>" ja merkkejä on layoutin kiekkojen verran.
export const RYHMAT_OTSIKKO = ['RYHMÄ', ...LAITTEET_OTSIKKO.slice(1)];

// MOBIILI_LAITTEET- tai MOBIILI_RYHMAT-rivi → { sukupolvi, laite, nimi, otettu, tapa, pinVirheet, linja, taydennykset }.
// Puuttuva rivi on vapaa rata tai ryhmä.
export function lueLaiteRivi(rivi, { ryhma = false } = {}) {
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
    linja,
    taydennykset: lueTaydennykset(r[TAYDENNYS_SARAKE], ryhma)
  };
}

const TAYDENNYS_MERKIT = new RegExp(`^[XO-]{${KOHTEITA}}$`);
function lueTaydennykset(arvo, ryhma) {
  let olio;
  try {
    olio = arvo ? JSON.parse(String(arvo)) : null;
  } catch {
    olio = null;
  }
  if (!olio || typeof olio !== 'object' || Array.isArray(olio)) return {};
  const kelpaa = ryhma
    ? (avain, merkit) => /^\d{1,2}:\d{1,3}$/.test(avain) && typeof merkit === 'string' && /^[XO-]{1,200}$/.test(merkit)
    : (avain, merkit) => {
      const n = Number(avain);
      return Number.isInteger(n) && n >= 1 && n <= MAKS_NRO && typeof merkit === 'string' && TAYDENNYS_MERKIT.test(merkit);
    };
  return Object.fromEntries(Object.entries(olio).filter(([avain, merkit]) => kelpaa(avain, merkit)));
}

// Lisää korvatun laitteen kortin täydennyksiin (avain: ampujan numero tai ryhmässä "<layout>:<nro>"): uuden kortin
// merkinnät voittavat, aiemmin välitetyt jäävät muualle.
export function lisaaTaydennys(taydennykset, nro, merkit) {
  const vanha = taydennykset[nro]?.length === merkit.length ? taydennykset[nro] : '-'.repeat(merkit.length);
  const uusi = [...vanha].map((m, i) => (merkit[i] && merkit[i] !== '-' ? merkit[i] : m)).join('');
  return { ...taydennykset, [nro]: uusi };
}

// Haltijan vaihdon rivi (sarakkeet ennen LINJA:a; linjan tila jää ennalleen).
export const haltijaRivi = (sarake, { sukupolvi, laite, nimi, otettu, tapa, pinVirheet }) =>
  [sarake, sukupolvi, laite, nimi, otettu, tapa, pinVirheet];

// Mitä laitteelle kerrotaan haltijasta (ei toisen laitteen tunnusta: sillä ja ratakoodilla voisi kirjoittaa).
export function julkinenHaltija(rivi, laite) {
  return {
    vapaa: !rivi.laite,
    oma: Boolean(rivi.laite) && rivi.laite === laite,
    // Rata on tämän laitteen, vaikka avain puuttuisi (esim. oton vastaus katosi): ota antaa avaimen uudelleen.
    tamaLaite: Boolean(rivi.laite) && rivi.laite === laite,
    nimi: rivi.nimi,
    otettu: rivi.otettu,
    tapa: rivi.tapa,
    lukittu: rivi.pinVirheet >= MAKS_PIN_VIRHEET
  };
}

export const laitteenNimi = (nimi) => puhdasTeksti(nimi, MAKS_LAITTEEN_NIMI);

