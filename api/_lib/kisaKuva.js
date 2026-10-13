// Päättyneiden kisojen tallennettu kuva (snapshot) Vercel Blobissa.
// Käytössä vain, kun BLOB_READ_WRITE_TOKEN on asetettu; muuten kaikki funktiot ovat tyhjiä.
import { createHash } from 'node:crypto';

const KIRJOITUS_AIKARAJA_MS = 1500;
const LUKU_AIKARAJA_MS = 1500;

export function onkoKuvatKaytossa() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function blobPaasy() {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
}

// Sama välilehtijoukko samassa järjestyksessä antaa saman polun.
export function kuvanPolku(sheetId, nimet) {
  const avain = [...nimet].map((n) => String(n).trim().toLowerCase()).sort().join('|');
  const tiiviste = createHash('sha1').update(avain).digest('hex').slice(0, 12);
  return `kisat/${sheetId}/${tiiviste}.json`;
}

export function datanVersio(csvByName) {
  return createHash('sha1').update(JSON.stringify(csvByName || {})).digest('hex').slice(0, 16);
}

function aikaraja(lupaus, ms) {
  let ajastin;
  return Promise.race([
    lupaus,
    new Promise((_, hylkaa) => { ajastin = setTimeout(() => hylkaa(new Error(`aikaraja ${ms} ms`)), ms); })
  ]).finally(() => clearTimeout(ajastin));
}

// Palauttaa tallennetun kuvan tai null. Virhe ei koskaan estä varsinaista hakua.
export async function lueKuva(polku) {
  if (!onkoKuvatKaytossa()) return null;
  try {
    const { get } = await import('@vercel/blob');
    const tulos = await aikaraja(get(polku, { access: blobPaasy() }), LUKU_AIKARAJA_MS);
    if (!tulos || tulos.statusCode !== 200 || !tulos.stream) return null;
    return JSON.parse(await new Response(tulos.stream).text());
  } catch (error) {
    console.error('[KUVA] Luku epäonnistui:', error?.message);
    return null;
  }
}

export async function tallennaKuva(polku, kuva) {
  if (!onkoKuvatKaytossa()) return;
  try {
    const { put } = await import('@vercel/blob');
    await aikaraja(put(polku, JSON.stringify(kuva), {
      access: blobPaasy(),
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60
    }), KIRJOITUS_AIKARAJA_MS);
  } catch (error) {
    console.error('[KUVA] Tallennus epäonnistui:', error?.message);
  }
}
