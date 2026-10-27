// Mobiilikirjauksen paikallinen tallennus: ratakoodi, laitteen tunnus ja radan tila (kortit, jono, asetukset).
// Radan tila tallennetaan joka muutoksen jälkeen kahteen paikkaan: localStorageen (luetaan heti sivun auetessa)
// ja IndexedDB:hen (varakopio, ja palvelutyöntekijä lähettää sieltä taustalla, kun sivu on suljettu).
// Lisäksi jokainen napautus kirjataan IndexedDB:n merkintälokiin ennen kuin näyttö päivittyy.
// Tietokannan nimi ja rakenne ovat samat public/kirjaus-sw.js:ssä.
const KOODI = 'scoringui:kirjaus:koodi';
const LAITE = 'scoringui:kirjaus:laite';
const SIIRTO = 'scoringui:kirjaus:siirto';
const radanAvain = (sheetId, sarake) => `scoringui:kirjaus:${sheetId}:${sarake}`;

const TIETOKANTA = 'scoringui-kirjaus';
const RADAT = 'radat';
const MERKINNAT = 'merkinnat';
// Merkintälokin rivit poistetaan, kun ne ovat tätä vanhempia (kisa kestää enintään muutaman päivän).
const LOKIN_SAILYTYS_MS = 30 * 24 * 60 * 60 * 1000;

function lue(avain) {
  try {
    return JSON.parse(window.localStorage.getItem(avain) || 'null');
  } catch {
    return null;
  }
}

function kirjoita(avain, arvo) {
  try {
    if (arvo === null) window.localStorage.removeItem(avain);
    else window.localStorage.setItem(avain, JSON.stringify(arvo));
    return true;
  } catch {
    return false;
  }
}

export const lueKoodi = () => lue(KOODI);
export const tallennaKoodi = (koodi) => kirjoita(KOODI, koodi);

// Toiselta laitteelta siirtolinkillä tullut rata ({ koodi, siirto }) odottaa, kunnes radan näkymä yhdistää sen.
export const tallennaOdottavaSiirto = (arvo) => kirjoita(SIIRTO, arvo);
export function otaOdottavaSiirto(koodi) {
  const arvo = lue(SIIRTO);
  if (!arvo || arvo.koodi !== koodi) return null;
  kirjoita(SIIRTO, null);
  return arvo.siirto;
}

// Tunnus pidetään myös muistissa, ettei se vaihdu sivun aikana, vaikka selain ei sallisi tallennusta.
let muistissa = null;
export function laitteenTunnus() {
  if (muistissa) return muistissa;
  let tunnus = lue(LAITE);
  if (!tunnus) {
    tunnus = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);
    kirjoita(LAITE, tunnus);
  }
  muistissa = tunnus;
  return tunnus;
}

// { kortit, historia, lisatyt, ohitetut, tauot, tauotPois, keskeyttaneet, ohjelma, aanet, nollaAani, avaus, jarjestys }
// jarjestys kasvaa joka tallennuksella, joten kahdesta kopiosta tiedetään uudempi.
export const lueRata = (sheetId, sarake) => lue(radanAvain(sheetId, sarake)) || {};
export const tallennaRata = (sheetId, sarake, tila) => kirjoita(radanAvain(sheetId, sarake), tila);

// --- IndexedDB ---

let yhteys = null;
function avaaTietokanta() {
  if (yhteys) return yhteys;
  yhteys = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB puuttuu'));
      return;
    }
    const pyynto = indexedDB.open(TIETOKANTA, 1);
    pyynto.onupgradeneeded = () => {
      const db = pyynto.result;
      if (!db.objectStoreNames.contains(RADAT)) db.createObjectStore(RADAT);
      if (!db.objectStoreNames.contains(MERKINNAT)) {
        db.createObjectStore(MERKINNAT, { autoIncrement: true }).createIndex('rata', 'rata');
      }
    };
    pyynto.onsuccess = () => {
      const db = pyynto.result;
      // Toinen välilehti päivittää rakennetta: suljetaan, ettei tämä estä sitä; seuraava kutsu avaa uudelleen.
      db.onversionchange = () => {
        db.close();
        yhteys = null;
      };
      resolve(db);
    };
    pyynto.onerror = () => reject(pyynto.error);
    pyynto.onblocked = () => reject(new Error('Tietokanta on varattu'));
  });
  yhteys.catch(() => { yhteys = null; });
  return yhteys;
}

async function transaktio(varasto, tapa, toimi) {
  const db = await avaaTietokanta();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(varasto, tapa);
    let tulos;
    Promise.resolve(toimi(tx.objectStore(varasto))).then((t) => { tulos = t; });
    tx.oncomplete = () => resolve(tulos);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Tallennus keskeytyi'));
  });
}

const pyynnonTulos = (pyynto) => new Promise((resolve, reject) => {
  pyynto.onsuccess = () => resolve(pyynto.result);
  pyynto.onerror = () => reject(pyynto.error);
});

const rataTunnus = (sheetId, sarake) => `${sheetId}:${sarake}`;

// Radan tila koodeineen (palvelutyöntekijä tarvitsee koodin, laitteen ja lähettämättömien korttien nimet
// lähettääkseen). Palauttaa true/false.
export async function tallennaRataTietokantaan(sheetId, sarake, { tila, koodi, laite, nimet }) {
  try {
    await transaktio(RADAT, 'readwrite', (s) => s.put({ tila, koodi, laite, nimet, aika: Date.now() }, rataTunnus(sheetId, sarake)));
    return true;
  } catch {
    return false;
  }
}

export async function lueRataTietokannasta(sheetId, sarake) {
  try {
    const rivi = await transaktio(RADAT, 'readonly', (s) => pyynnonTulos(s.get(rataTunnus(sheetId, sarake))));
    return rivi?.tila || null;
  } catch {
    return null;
  }
}

export async function poistaRataTietokannasta(sheetId, sarake) {
  try {
    await transaktio(RADAT, 'readwrite', (s) => s.delete(rataTunnus(sheetId, sarake)));
  } catch {
    // Ei tietokantaa: ei mitään poistettavaa.
  }
}

// Merkintäloki: { rata, aika, laite, tapa: 'merkintä' | 'korjaus' | 'peru', nro, kiekko (1–25), ennen, jalkeen }.
// Transaktio alkaa heti kutsussa, joten rivi tallentuu, vaikka sivu suljettaisiin heti napautuksen jälkeen.
export function kirjaaMerkinta(sheetId, sarake, merkinta) {
  return transaktio(MERKINNAT, 'readwrite', (s) => s.add({ rata: rataTunnus(sheetId, sarake), aika: Date.now(), ...merkinta }))
    .then(() => true, () => false);
}

export async function lueMerkinnat(sheetId, sarake) {
  try {
    return await transaktio(MERKINNAT, 'readonly', (s) => pyynnonTulos(s.index('rata').getAll(rataTunnus(sheetId, sarake))));
  } catch {
    return [];
  }
}

export async function siivoaMerkinnat(nyt = Date.now()) {
  try {
    await transaktio(MERKINNAT, 'readwrite', (s) => new Promise((resolve) => {
      const kursori = s.openCursor();
      kursori.onsuccess = () => {
        const c = kursori.result;
        // Avaimet kasvavat kirjausjärjestyksessä: ensimmäinen tarpeeksi uusi rivi lopettaa siivouksen.
        if (!c || nyt - (c.value.aika || 0) <= LOKIN_SAILYTYS_MS) return resolve();
        c.delete();
        c.continue();
      };
      kursori.onerror = () => resolve();
    }));
  } catch {
    // Siivous ei ole välttämätön.
  }
}

// Pyytää selainta olemaan poistamatta tallennettuja tietoja levytilan loppuessa. Palauttaa true, jos tiedot ovat pysyviä.
export async function pyydaPysyvaTallennus() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
