// Mobiilikirjauksen palvelutyöntekijä (scope /kirjaus, rekisteröidään vain kirjaus.html:stä).
// 1. Sovelluksen kuori ilman verkkoa: kirjaus.html verkosta ensin (aikaraja, sitten välimuisti), /assets/ välimuistista.
//    Julkiset tulossivut eivät ole tämän piirissä, joten ne eivät koskaan saa vanhentunutta sisältöä täältä.
// 2. Taustalähetys (Background Sync, Chrome/Android): lähettämättömät kortit lähtevät, kun yhteys palaa,
//    vaikka sivu olisi suljettu. Kortit luetaan IndexedDB:stä (src/kirjaus/varasto.js, sama rakenne).
// API-kutsuihin (/api/) ei kosketa.
const VALIMUISTI = 'kirjaus-kuori-v1';
const SIVU = '/kirjaus.html';
const MUUT = ['/kirjaus.webmanifest', '/kirjaus-180.png', '/kirjaus-192.png', '/kirjaus-512.png'];
const SIVUN_AIKARAJA_MS = 4000;
const TIETOKANTA = 'scoringui-kirjaus';
const RADAT = 'radat';
const SYNK_TAGI = 'kirjaus-lahetys';
const MAKS_KORTTEJA = 30;

// Sivun viittaamat omat tiedostot (skriptit, tyylit, esilataukset, kuvakkeet).
function sivunTiedostot(html) {
  const tiedostot = new Set();
  for (const osuma of String(html).matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
    if (!osuma[1].startsWith('//')) tiedostot.add(osuma[1]);
  }
  return [...tiedostot];
}

// Tallentaa sivun ja sen tiedostot, ja poistaa vanhan version tiedostot (/assets/ nimissä on tiiviste).
async function tallennaKuori(vastaus) {
  const html = await vastaus.clone().text();
  const tiedostot = sivunTiedostot(html);
  const valimuisti = await caches.open(VALIMUISTI);
  await Promise.all(tiedostot.map(async (polku) => {
    if (await valimuisti.match(polku)) return;
    const res = await fetch(polku);
    if (kelpaa(res)) await valimuisti.put(polku, res);
  }));
  await valimuisti.put(SIVU, vastaus);
  const kaytossa = new Set(tiedostot);
  for (const pyynto of await valimuisti.keys()) {
    const polku = new URL(pyynto.url).pathname;
    if (polku.startsWith('/assets/') && !kaytossa.has(polku)) await valimuisti.delete(pyynto);
  }
}

const kelpaa = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const valimuisti = await caches.open(VALIMUISTI);
      await Promise.all(MUUT.map((polku) => valimuisti.add(polku).catch(() => {})));
      const res = await fetch(SIVU, { cache: 'no-store' });
      if (kelpaa(res)) await tallennaKuori(res);
    } catch {
      // Ei verkkoa asennettaessa: kuori tallentuu seuraavalla avauksella.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const nimi of await caches.keys()) {
      if (nimi.startsWith('kirjaus-kuori-') && nimi !== VALIMUISTI) await caches.delete(nimi);
    }
    await self.clients.claim();
  })());
});

// Sivu: verkosta, jos se vastaa aikarajassa (uusi versio tulee käyttöön), muuten välimuistista.
// Verkkohaku jatkuu aikarajan jälkeenkin ja päivittää välimuistin. Verkon vastaus käytetään sellaisenaan
// (myös uudelleenohjaus tai esikatselun kirjautuminen), paitsi palvelinvirhe, kun tallessa on kuori.
async function sivu(event) {
  let kopio = null;
  const verkosta = fetch(event.request).then((res) => {
    if (kelpaa(res)) kopio = res.clone();
    return res;
  });
  event.waitUntil(verkosta.then(() => kopio && tallennaKuori(kopio)).catch(() => {}));
  const aikaraja = new Promise((resolve) => setTimeout(resolve, SIVUN_AIKARAJA_MS));
  const tallessa = caches.match(SIVU);
  try {
    const nopea = await Promise.race([verkosta, aikaraja]);
    if (nopea && !(nopea.status >= 500 && (await tallessa))) return nopea;
  } catch {
    // Ei verkkoa.
  }
  return (await tallessa) || verkosta;
}

// /assets/-tiedostojen nimessä on sisällön tiiviste, joten välimuistin kopio on aina oikea. Muut (manifesti,
// kuvakkeet) annetaan välimuistista ja päivitetään taustalla, jotta muutos tulee käyttöön seuraavalla kerralla.
async function tiedosto(event) {
  const { request } = event;
  const polku = new URL(request.url).pathname;
  const tallessa = await caches.match(request, { ignoreSearch: true });
  const hae = async () => {
    const res = await fetch(request);
    if (kelpaa(res)) {
      const valimuisti = await caches.open(VALIMUISTI);
      await valimuisti.put(polku, res.clone());
    }
    return res;
  };
  if (!tallessa) return hae();
  if (!polku.startsWith('/assets/')) event.waitUntil(hae().catch(() => {}));
  return tallessa;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && (url.pathname === SIVU || url.pathname === '/kirjaus')) {
    event.respondWith(sivu(event));
  } else if (url.pathname.startsWith('/assets/') || MUUT.includes(url.pathname) || url.pathname.startsWith('/favicon')) {
    event.respondWith(tiedosto(event));
  }
});

// --- Taustalähetys ---

// Sama versio ja rakenne kuin varasto.js:ssä, jotta tietokanta on oikean muotoinen kumman tahansa luomana.
function avaaTietokanta() {
  return new Promise((resolve, reject) => {
    const pyynto = indexedDB.open(TIETOKANTA, 1);
    pyynto.onupgradeneeded = () => {
      const db = pyynto.result;
      if (!db.objectStoreNames.contains(RADAT)) db.createObjectStore(RADAT);
      if (!db.objectStoreNames.contains('merkinnat')) {
        db.createObjectStore('merkinnat', { autoIncrement: true }).createIndex('rata', 'rata');
      }
    };
    pyynto.onsuccess = () => resolve(pyynto.result);
    pyynto.onerror = () => reject(pyynto.error);
  });
}

function kaikkiRadat(db) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(RADAT)) return resolve([]);
    const pyynto = db.transaction(RADAT, 'readonly').objectStore(RADAT).getAll();
    pyynto.onsuccess = () => resolve(pyynto.result || []);
    pyynto.onerror = () => reject(pyynto.error);
  });
}

// Radan lähettämättömät kortit API:n muodossa, tai [] jos rata odottaa toisen laitteen varoituksen kuittausta
// (sivu ei silloinkaan lähetä). Sama sääntö kuin src/kirjaus/kortit.js lahettamattomat ja KirjausApp laheta.
function lahetettavat(rivi) {
  const tila = rivi?.tila;
  if (!tila?.kortit || !rivi.koodi || !rivi.laite) return [];
  const muu = tila.avaus?.muuLaite;
  if (muu && tila.hyvaksyttyMuu !== `${muu.laite}|${muu.aika}`) return [];
  const nimet = { ...tila.avaus?.nimet, ...rivi.nimet };
  return Object.entries(tila.kortit)
    .filter(([, k]) => k && !k.lahetetty)
    .slice(0, MAKS_KORTTEJA)
    .map(([nro, k]) => ({ nro: Number(nro), merkit: k.merkit, versio: k.versio, nimi: nimet[nro] || '' }));
}

// Lähettää kaikkien ratojen kortit. Ei merkitse niitä lähetetyiksi: sivu saa kuittauksen avatessaan radan
// (sama versio taulukossa), ja uudelleenlähetys kirjoittaa samat solut. Heittää virheen, jos jokin jäi
// verkkovirheen takia lähettämättä, jotta selain yrittää myöhemmin uudelleen.
async function lahetaKaikki() {
  const radat = await kaikkiRadat(await avaaTietokanta());
  let verkkovirhe = null;
  for (const rivi of radat) {
    const kortit = lahetettavat(rivi);
    if (kortit.length === 0) continue;
    try {
      const res = await fetch('/api/kirjaus?toiminto=tallenna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rivi.koodi}` },
        body: JSON.stringify({ laite: rivi.laite, kortit })
      });
      // 5xx (ruuhka, Google) yritetään myöhemmin; 4xx (vanhentunut koodi ym.) näkyy sivulla, kun se avataan.
      if (res.status >= 500) verkkovirhe = new Error(`Virhe ${res.status}`);
    } catch (error) {
      verkkovirhe = error;
    }
  }
  if (verkkovirhe) throw verkkovirhe;
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNK_TAGI) event.waitUntil(lahetaKaikki());
});

// Testejä varten (Node: vm).
self.kirjausSw = { sivunTiedostot, lahetettavat };
