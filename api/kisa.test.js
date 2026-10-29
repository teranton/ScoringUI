import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.SCORINGUI_VALIMUISTI_HAKEMISTO = mkdtempSync(path.join(tmpdir(), 'kisa-test-'));

const VANHA = '1Ert3n7Fft235Zpoc42NZnGxOOhM1kQzwhef6lRF0geI';
const KORJATTAVA = '1erSyJGWLU84kNmLVFI50SOiHFfOeNbA81NJG4zr3hbg';
const RANKING = '1WyCiQ31zLlXd5CpVC0zo52OiCtNtDkGDyCz7bgyPIt8';
const PAIVA = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString().slice(0, 10);
const kolmePaivaaSitten = iso(new Date(Date.now() - 3 * PAIVA));

let googleHaut = 0;
const blob = new Map();
let blobKirjoitukset = 0;

mock.module('./_lib/googleAuth.js', { namedExports: {
  onKiintioVirhe: () => false,
  pyyntoUudelleenyrittaen: (request, opts) => request(opts),
  haeGoogleAsiakas: async () => ({ request: async ({ url }) => {
    if (url.includes('/values/A:Z')) {
      return { data: { values: [['ID', 'Nimi', 'Alku', 'Loppu', 'Sheet'], ['1', 'Vanha', '2025-07-05', '2025-07-06', VANHA], ['2', 'Korjattava', kolmePaivaaSitten, kolmePaivaaSitten, KORJATTAVA], ['3', 'Ranking', '2026-03-01', '', RANKING, '', '', 'RANKING']] } };
    }
    googleHaut++;
    if (!url.includes('batchGet')) return { data: { sheets: ['Tulokset Y', 'NEW_Joukkue', 'Ryhmäjako'].map((title) => ({ properties: { title } })) } };
    const alueet = new URL(url).searchParams.getAll('ranges');
    return { data: { valueRanges: alueet.map(() => ({ values: [['NIMI'], ['uusi']] })) } };
  } })
} });

mock.module('./_lib/kisaKuva.js', { namedExports: {
  onkoKuvatKaytossa: () => true,
  kuvanPolku: (id, nimet) => `kisat/${id}/${[...nimet].map((n) => n.toLowerCase()).sort().join('|')}`,
  datanVersio: (c) => createHash('sha1').update(JSON.stringify(c || {})).digest('hex').slice(0, 16),
  lueKuva: async (polku) => blob.get(polku) || null,
  tallennaKuva: async (polku, kuva) => {
    await new Promise((ratkaise) => setTimeout(ratkaise, 10));
    blobKirjoitukset++;
    blob.set(polku, kuva);
  }
} });

// Vercelin pyyntökonteksti: waitUntil-tehtävät kerätään talteen.
let taustat = [];
// Odottaa myös taustatehtävien itse lisäämät tehtävät.
async function odotaTaustat() {
  let odotetut = 0;
  while (odotetut < taustat.length) {
    odotetut = taustat.length;
    await Promise.all(taustat);
  }
}
globalThis[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: (p) => taustat.push(p) }) };

const { default: handler } = await import('./kisa.js');
const { VANHA_KUVA_OTSIKKO } = await import('./_lib/kisaValimuisti.js');

function vastaus() {
  const r = { h: {}, setHeader(k, v) { r.h[k] = v; }, status(s) { r.s = s; return r; }, json(b) { r.b = b; return r; }, end() { return r; } };
  return r;
}

async function hae(sheetId, nimi) {
  const r = vastaus();
  await handler({ query: { sheetId, sheetNames: [nimi] }, headers: {} }, r);
  return r;
}

const kuva = (ika, csv, alkuPvm = '2025-07-05', loppuPvm = '2025-07-06') => ({
  versio: 1, tallennettu: Date.now() - ika, paivaTila: 'paattynyt', alkuPvm, loppuPvm, csvByName: { NEW_Joukkue: csv }, notFound: []
});

test('Google-haun jälkeen kuva tallennetaan vastauksen jälkeen', async () => {
  taustat = [];
  const r = await hae(VANHA, 'Tulokset Y');
  assert.equal(r.b.timing.source, 'google');
  assert.equal(taustat.length, 1);
  assert.equal(blobKirjoitukset, 0);
  await odotaTaustat();
  assert.equal(blobKirjoitukset, 1);
});

test('korjausajan jälkeen vanha kuva annetaan heti ja päivitetään taustalla', async () => {
  taustat = [];
  blob.set(`kisat/${VANHA}/new_joukkue`, kuva(3 * PAIVA, 'vanha'));
  const hautEnnen = googleHaut;
  const r = await hae(VANHA, 'NEW_Joukkue');
  assert.equal(r.b.timing.source, 'snapshot-stale');
  assert.equal(r.b.csvByName.NEW_Joukkue, 'vanha');
  assert.equal(r.h['Cache-Control'], VANHA_KUVA_OTSIKKO);
  assert.equal(taustat.length, 1);
  await odotaTaustat();
  assert.ok(googleHaut > hautEnnen);
  assert.match(blob.get(`kisat/${VANHA}/new_joukkue`).csvByName.NEW_Joukkue, /uusi/);
  assert.equal((await hae(VANHA, 'NEW_Joukkue')).b.timing.source, 'server-cache');
});

test('tuore kuva ei hae Googlesta', async () => {
  taustat = [];
  blob.set(`kisat/${VANHA}/ryhmäjako`, kuva(5 * 60 * 60 * 1000, 'tuore'));
  const hautEnnen = googleHaut;
  const r = await hae(VANHA, 'Ryhmäjako');
  assert.equal(r.b.timing.source, 'snapshot');
  assert.equal(googleHaut, hautEnnen);
  assert.equal(taustat.length, 0);
});

test('korjausaika lasketaan rekisterin nykyisistä päivistä, ei kuvaan tallennetuista', async () => {
  taustat = [];
  // Kuvassa on vanhat (väärät) päivät, mutta rekisterin mukaan kisa on korjausajassa.
  blob.set(`kisat/${KORJATTAVA}/new_joukkue`, kuva(3 * PAIVA, 'vanha'));
  const r = await hae(KORJATTAVA, 'NEW_Joukkue');
  assert.equal(r.b.timing.source, 'google');
  assert.match(r.b.csvByName.NEW_Joukkue, /uusi/);
});

test('muita kuin julkaistavia välilehtiä ei anneta', async () => {
  const hautEnnen = googleHaut;
  const r = await hae(VANHA, 'Suomisport Import');
  assert.equal(r.s, 400);
  assert.deepEqual(r.b.sheetNames, ['Suomisport Import']);
  assert.equal(googleHaut, hautEnnen);
});

test('välilehden nimen kirjainkoolla ei ole väliä', async () => {
  const r = await hae(VANHA, ' tulokset y ');
  assert.equal(r.s, 200);
  assert.deepEqual(Object.keys(r.b.csvByName), ['Tulokset Y']);
});

test('eri kirjoitusasu ei täytä välimuistia avaimilla, joita frontend ei löydä', async () => {
  taustat = [];
  const pienella = await hae(KORJATTAVA, 'ryhmäjako');
  assert.deepEqual(Object.keys(pienella.b.csvByName), ['Ryhmäjako']);
  await odotaTaustat();
  const frontend = await hae(KORJATTAVA, 'Ryhmäjako');
  assert.equal(frontend.b.timing.source, 'server-cache');
  assert.ok(frontend.b.csvByName['Ryhmäjako']);
  assert.ok(blob.get(`kisat/${KORJATTAVA}/ryhmäjako`).csvByName['Ryhmäjako']);
});

test('NFD-muotoinen nimi kelpaa', async () => {
  assert.equal((await hae(KORJATTAVA, 'Ryhmäjako'.normalize('NFD'))).s, 200);
});

test('raja lasketaan eri välilehdistä, ei kirjoitusasuista', async () => {
  const r = vastaus();
  const nimet = Array.from({ length: 13 }, (_, i) => (i % 2 ? 'NEW_Joukkue' : 'new_joukkue') + ' '.repeat(i));
  await handler({ query: { sheetId: VANHA, sheetNames: nimet }, headers: {} }, r);
  assert.equal(r.s, 200);
});

test('saman välilehden eri kirjoitusasut haetaan kerran', async () => {
  const r = vastaus();
  await handler({ query: { sheetId: VANHA, sheetNames: ['NEW_Joukkue', 'new_joukkue'] }, headers: {} }, r);
  assert.equal(r.s, 200);
  assert.deepEqual(Object.keys(r.b.csvByName), ['NEW_Joukkue']);
});

test('julkaistavat välilehdet annetaan, vaikka mukana olisi muita', async () => {
  const r = vastaus();
  await handler({ query: { sheetId: VANHA, sheetNames: ['Tulokset Y', 'KITI_DATA'] }, headers: {} }, r);
  assert.equal(r.s, 200);
  assert.deepEqual(Object.keys(r.b.csvByName), ['Tulokset Y']);
});

test('rankingin välilehti annetaan vain rankingiksi merkitystä taulukosta', async () => {
  const kisasta = await hae(VANHA, 'RANKING_2026');
  assert.equal(kisasta.s, 400);
  assert.equal((await hae(VANHA, 'KISAT')).s, 400);
  const rankingista = await hae(RANKING, 'RANKING_2026');
  assert.equal(rankingista.s, 200);
  assert.ok(rankingista.b.csvByName.RANKING_2026);
  assert.match(rankingista.h['Cache-Control'], /s-maxage=15,/);
  assert.equal((await hae(RANKING, 'KISAT')).s, 200);
});
