// src/utils/googleKayttaja.js
// Järjestäjän oma Google-kirjautuminen ryhmien muokkaukseen (Google Identity Services, token-malli).
// Taulukkoa luetaan ja kirjoitetaan selaimesta käyttäjän omalla tunnisteella, joten Google itse
// päättää oikeudet: muokata voi vain se, jolla on kilpailutaulukkoon muokkausoikeus.
// Palvelutili (api/) pysyy vain lukevana. Tunniste on vain muistissa (ei localStorageen).

const GIS_URL = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
// Sähköposti näytetään, jotta usean Google-tilin käyttäjä näkee, millä tilillä on kirjautunut.
const SCOPET = `${SCOPE} email`;
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export function googleClientId() {
  return String(import.meta.env?.VITE_GOOGLE_CLIENT_ID || '').trim();
}

let gisLupaus = null;

export function lataaGoogleKirjautuminen() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Ei selainta'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLupaus) {
    gisLupaus = new Promise((ratkaise, hylkaa) => {
      const skripti = document.createElement('script');
      skripti.src = GIS_URL;
      skripti.async = true;
      skripti.onload = () => ratkaise();
      skripti.onerror = () => {
        gisLupaus = null;
        hylkaa(new Error('Googlen kirjautumista ei saatu ladattua.'));
      };
      document.head.appendChild(skripti);
    });
  }
  return gisLupaus;
}

let tunniste = null; // { token, vanhenee, sahkoposti }

export function kirjautunutTili() {
  return onkoKirjautunut() ? tunniste.sahkoposti || '' : '';
}

export function onkoKirjautunut() {
  return Boolean(tunniste && tunniste.vanhenee > Date.now());
}

export function kirjauduUlos() {
  if (tunniste?.token) window.google?.accounts?.oauth2?.revoke?.(tunniste.token, () => {});
  tunniste = null;
}

// Avaa Googlen kirjautumisikkunan. Kutsuttava suoraan napin painalluksesta (ponnahdusikkunan esto),
// ja kirjautumiskirjaston pitää olla jo ladattu (lataaGoogleKirjautuminen).
export function kirjaudu() {
  return new Promise((ratkaise, hylkaa) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      hylkaa(new Error('Googlen kirjautuminen ei ole vielä latautunut.'));
      return;
    }
    const asiakas = oauth2.initTokenClient({
      client_id: googleClientId(),
      scope: SCOPET,
      callback: async (vastaus) => {
        if (vastaus?.error || !vastaus?.access_token) {
          hylkaa(new Error(vastaus?.error_description || vastaus?.error || 'Kirjautuminen epäonnistui.'));
          return;
        }
        if (!oauth2.hasGrantedAllScopes?.(vastaus, SCOPE)) {
          hylkaa(new Error('Ryhmien muokkaus tarvitsee luvan taulukoiden muokkaukseen.'));
          return;
        }
        // Minuutti varaa, ettei tunniste vanhene kesken pyynnön.
        tunniste = { token: vastaus.access_token, vanhenee: Date.now() + (Number(vastaus.expires_in) || 3600) * 1000 - 60000 };
        tunniste.sahkoposti = await haeSahkoposti(vastaus.access_token);
        ratkaise();
      },
      error_callback: (virhe) => hylkaa(new Error({
        popup_closed: 'Kirjautuminen keskeytettiin.',
        popup_failed_to_open: 'Kirjautumisikkuna ei auennut. Salli ponnahdusikkunat tälle sivulle.'
      }[virhe?.type] || `Kirjautuminen epäonnistui (${virhe?.type || 'tuntematon'}).`))
    });
    // Tilin valinta joka kerta: selaimen oletustili ei aina ole se, jolla on muokkausoikeus.
    asiakas.requestAccessToken({ prompt: 'select_account' });
  });
}

async function haeSahkoposti(token) {
  try {
    const vastaus = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
    return vastaus.ok ? String((await vastaus.json())?.email || '') : '';
  } catch {
    return '';
  }
}

export class SheetsVirhe extends Error {
  constructor(viesti, status) {
    super(viesti);
    this.status = status;
  }
}

async function pyynto(url, { method = 'GET', body } = {}) {
  if (!onkoKirjautunut()) throw new SheetsVirhe('Kirjautuminen on vanhentunut.', 401);
  const vastaus = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tunniste.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!vastaus.ok) {
    let viesti = `Google vastasi ${vastaus.status}`;
    try {
      viesti = (await vastaus.json())?.error?.message || viesti;
    } catch {
      // ei JSON-runkoa
    }
    if (vastaus.status === 401) tunniste = null;
    throw new SheetsVirhe(viesti, vastaus.status);
  }
  return vastaus.json();
}

export function haeTaulukonMeta(sheetId) {
  const fields = 'namedRanges(name,range),sheets(properties(sheetId,title,gridProperties(rowCount)))';
  return pyynto(`${SHEETS_API}/${encodeURIComponent(sheetId)}?fields=${encodeURIComponent(fields)}`);
}

export async function haeRivit(sheetId, a1) {
  const params = new URLSearchParams({
    ranges: a1,
    includeGridData: 'true',
    fields: 'sheets(data(rowData(values(userEnteredValue,formattedValue))))'
  });
  const data = await pyynto(`${SHEETS_API}/${encodeURIComponent(sheetId)}?${params.toString()}`);
  return data?.sheets?.[0]?.data?.[0]?.rowData || [];
}

export function paivitaTaulukko(sheetId, requests) {
  return pyynto(`${SHEETS_API}/${encodeURIComponent(sheetId)}:batchUpdate`, { method: 'POST', body: { requests } });
}

// Onko käyttäjällä muokkausoikeus? Tyhjä batchUpdate ei muuta mitään; katseluoikeudella Google vastaa 403.
// Muu vastaus (myös mahdollinen 400 tyhjästä pyynnöstä) tulkitaan muokkausoikeudeksi, ja oikea tallennus
// kertoo lopullisesti.
export async function voikoMuokata(sheetId) {
  try {
    await paivitaTaulukko(sheetId, []);
    return true;
  } catch (virhe) {
    if (virhe instanceof SheetsVirhe && virhe.status === 403) return false;
    if (virhe instanceof SheetsVirhe && virhe.status === 400) return true;
    throw virhe;
  }
}
