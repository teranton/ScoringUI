// Radan vaihto laitteelta toiselle: linjan tila, laitteen nimi ja siirtolinkki (QR-koodi vanhalta laitteelta uudelle).
// Palvelin pitää kirjaa radan haltijalaitteesta (api/_lib/kirjausHaltija.js); tämä on laitteen puoli.

import { uusiVersio } from './kortit.js';

// Linjan tila, joka siirtyy uudelle laitteelle radan mukana (palvelin tallentaa sen MOBIILI_LAITTEET-välilehdelle).
export const LINJAN_KENTAT = ['lisatyt', 'ohitetut', 'tauot', 'tauotPois', 'keskeyttaneet', 'ohjelma'];
export const linjaTilasta = (tila) => Object.fromEntries(LINJAN_KENTAT.map((k) => [k, tila[k] ?? (k === 'ohjelma' ? null : [])]));
export const linjaTekstina = (tila) => JSON.stringify(linjaTilasta(tila));

// Palvelimen tai siirron linjan tila laitteen tilaan.
export function otaLinja(tila, linja) {
  if (!linja || typeof linja !== 'object') return tila;
  const uusi = { ...tila };
  for (const k of LINJAN_KENTAT) {
    if (k === 'ohjelma') uusi.ohjelma = typeof linja.ohjelma === 'string' ? linja.ohjelma : null;
    else if (Array.isArray(linja[k])) uusi[k] = linja[k];
  }
  return uusi;
}

// Laitteen nimi kilpailutoimistolle ja toiselle laitteelle: "Android Chrome …a1b2" (tunnuksen loppu erottaa
// samanlaiset puhelimet; koko tunnusta ei näytetä).
export function laitteenNimi(laite, ua = (typeof navigator === 'undefined' ? '' : navigator.userAgent)) {
  const alusta = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac' : 'Laite';
  const selain = /SamsungBrowser/.test(ua) ? 'Samsung' : /EdgA?\/|EdgiOS/.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return `${alusta}${selain ? ` ${selain}` : ''} …${String(laite).slice(-4)}`;
}

// --- Siirtolinkki ---
// kirjaus.html#k=<ratakoodi>&h=<haltija-avain>&c=<kortit>&t=<linja>
// Kortit: "nro.versio(36-kantainen).merkit" alaviivalla erotettuna, merkeistä lopun ampumattomat (-) pois.
// Linja: base64url-JSON. Vain lähettämättömät kortit, jotta QR-koodi pysyy luettavana.

const base64url = (teksti) => btoa(String.fromCharCode(...new TextEncoder().encode(teksti)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64urlTekstiksi = (b) => new TextDecoder().decode(
  Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
);

export function siirtoLinkki({ perus, koodi, haltija, kortit, linja }) {
  const c = kortit.map((k) => `${k.nro}.${k.versio.toString(36)}.${k.merkit.replace(/-+$/, '')}`).join('_');
  const osat = [`k=${koodi}`, `h=${haltija}`];
  if (c) osat.push(`c=${c}`);
  if (linja) osat.push(`t=${base64url(JSON.stringify(linja))}`);
  return `${perus}#${osat.join('&')}`;
}

// Osoitteen hash-osa → { koodi, siirto: { haltija, kortit, linja } | null }. kohteita = merkkien määrä kortilla.
export function lueSiirto(hash, kohteita = 25) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const koodi = p.get('k') || '';
  const haltija = p.get('h');
  if (!haltija || !/^h1\.\d+\.[A-Za-z0-9_-]+$/.test(haltija)) return { koodi, siirto: null };
  const kortit = (p.get('c') || '').split('_').filter(Boolean).flatMap((osa) => {
    const [nro, versio, merkit = ''] = osa.split('.');
    const n = Number.parseInt(nro, 10);
    const v = Number.parseInt(versio, 36);
    if (!Number.isInteger(n) || n < 1 || !Number.isSafeInteger(v) || v < 1 || !/^[XO-]*$/.test(merkit) || merkit.length > kohteita) return [];
    return [{ nro: n, versio: v, merkit: merkit.padEnd(kohteita, '-') }];
  });
  let linja;
  try {
    linja = p.get('t') ? JSON.parse(base64urlTekstiksi(p.get('t'))) : null;
  } catch {
    linja = null;
  }
  return { koodi, siirto: { haltija, kortit, linja } };
}

// Siirron kortit ja linja laitteen tilaan: uudempi versio voittaa, siirretyt lähetetään tältä laitteelta.
export function yhdistaSiirto(tila, siirto) {
  let kortit = tila.kortit || {};
  for (const k of siirto.kortit) {
    const oma = kortit[k.nro];
    if (!oma || k.versio > oma.versio) kortit = { ...kortit, [k.nro]: { merkit: k.merkit, versio: k.versio, lahetetty: false } };
  }
  // Laitteen oma vanha avain pois: rata otetaan siirtoavaimella, ei mahdollisesti vanhentuneella avaimella.
  return { ...otaLinja(tila, siirto.linja), kortit, haltija: null, siirtoAvain: siirto.haltija, luovutettu: false, korvattu: null };
}

// Korvattujen laitteiden merkinnät (palvelimen täydennykset { nro: merkit }) tämän laitteen kortteihin: vain tyhjiin
// kiekkoihin ja vain merkinnät, joita ei ole jo otettu (sovelletut), jotta tämän laitteen perumat eivät palaa.
// Täydennetyt kortit lähetetään tältä laitteelta, joten radan kortteja kirjoittaa edelleen vain haltija.
export function otaTaydennykset(kortit, taydennykset, sovelletut = {}, kohteita = 25, nyt = Date.now()) {
  let uudetKortit = kortit;
  const uudetSovelletut = { ...sovelletut };
  let taytetyt = 0;
  for (const [nro, merkit] of Object.entries(taydennykset || {})) {
    if (typeof merkit !== 'string' || merkit === sovelletut[nro]) continue;
    const aiemmat = sovelletut[nro] || '';
    const oma = uudetKortit[nro];
    let muuttui = false;
    const uudet = [...(oma?.merkit || '-'.repeat(kohteita))].map((m, i) => {
      const t = merkit[i];
      if (m !== '-' || !t || t === '-' || (aiemmat[i] && aiemmat[i] !== '-')) return m;
      muuttui = true;
      return t;
    }).join('');
    uudetSovelletut[nro] = merkit;
    if (muuttui) {
      uudetKortit = { ...uudetKortit, [nro]: { merkit: uudet, versio: uusiVersio(oma?.versio, nyt), lahetetty: false } };
      taytetyt++;
    }
  }
  return { kortit: uudetKortit, sovelletut: uudetSovelletut, taytetyt };
}
