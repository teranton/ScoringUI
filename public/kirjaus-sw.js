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

// Radat avaimineen ({ ...rivi, avain }), jotta korvatun laitteen tila voidaan kirjoittaa takaisin.
function kaikkiRadat(db) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(RADAT)) return resolve([]);
    const radat = [];
    const kursori = db.transaction(RADAT, 'readonly').objectStore(RADAT).openCursor();
    kursori.onsuccess = () => {
      const c = kursori.result;
      if (!c) return resolve(radat);
      radat.push({ ...c.value, avain: c.key });
      c.continue();
    };
    kursori.onerror = () => reject(kursori.error);
  });
}

// Radan lähettämättömät kortit API:n muodossa, tai [] jos laitteella ei ole rataa (ei haltija-avainta, korvattu
// tai luovutettu: sivu ei silloinkaan lähetä). Sama sääntö kuin src/kirjaus/kortit.js ja ryhma.js lahettamattomat.
function lahetettavat(rivi) {
  const tila = rivi?.tila;
  if (!tila?.kortit || !rivi.koodi || !rivi.laite || !tila.haltija || tila.korvattu || tila.luovutettu) return [];
  const nimet = { ...tila.avaus?.nimet, ...rivi.nimet };
  const layoutit = Array.isArray(tila.avaus?.layoutit) ? tila.avaus.layoutit : [];
  const jako = (nro) => {
    const l = layoutit.find((x) => x.nro === nro);
    return l && Array.isArray(l.asemat) ? { jako: l.asemat.map((a) => a.kohteita).join(',') } : {};
  };
  return Object.entries(tila.kortit)
    .filter(([, k]) => k && !k.lahetetty && !k.hylatty)
    .slice(0, MAKS_KORTTEJA)
    // Ryhmäpuhelimen kortissa on layout (src/kirjaus/ryhma.js lahettamattomat); nimen palvelin ottaa pääsivulta.
    .map(([nro, k]) => (k.layout
      ? { layout: k.layout, nro: k.nro, merkit: k.merkit, versio: k.versio, ...(k.hyvaksytty ? { hyvaksytty: k.hyvaksytty } : {}), ...jako(k.layout) }
      : { nro: Number(nro), merkit: k.merkit, versio: k.versio, nimi: nimet[nro] || '' }));
}

// Korvatun laitteen tila takaisin tietokantaan (sama muoto kuin KirjausApp: haltija pois, korvattu-tieto).
// Järjestysnumero kasvaa, joten sivu käyttää tätä kopiota avatessaan.
async function merkitseKorvatuksi(rivi, data) {
  if (!data?.korvattu) return;
  const h = data.haltija || {};
  const tila = {
    ...rivi.tila,
    haltija: null,
    korvattu: { nimi: h.nimi || '', otettu: h.otettu || '', vapaa: Boolean(h.vapaa), kirjattu: data.kirjattu || 0, taydennetty: data.taydennetty || 0 },
    jarjestys: (rivi.tila.jarjestys || 0) + 1
  };
  const db = await avaaTietokanta();
  await new Promise((resolve) => {
    const tx = db.transaction(RADAT, 'readwrite');
    const { avain, ...tallennettava } = rivi;
    tx.objectStore(RADAT).put({ ...tallennettava, tila, aika: Date.now() }, avain);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
    tx.onabort = resolve;
  });
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
        body: JSON.stringify({ laite: rivi.laite, haltija: rivi.tila.haltija, kortit })
      });
      // 5xx (ruuhka, Google) yritetään myöhemmin; 4xx (vanhentunut koodi ym.) näkyy sivulla, kun se avataan.
      if (res.status >= 500) verkkovirhe = new Error(`Virhe ${res.status}`);
      // Laite korvattu: merkitään radan tilaan, ettei sivu lähetä samoja kortteja (ja lokita niitä) uudelleen.
      if (res.status === 409) await merkitseKorvatuksi(rivi, await res.json().catch(() => ({})));
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
