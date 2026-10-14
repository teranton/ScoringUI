import test from 'node:test';
import assert from 'node:assert/strict';
import { CDN_OTSIKOT, cdnOtsikko, kisanPaivaTila, onkoKuvaKaytettava, onkoKuvaTuore, vastausTuoreMs } from './kisaValimuisti.js';

const nyt = new Date(2026, 9, 13, 12, 0, 0);
const TUNTI = 60 * 60 * 1000;

test('välimuistiaika tulee rekisterin päivistä', () => {
  assert.equal(kisanPaivaTila({ alkuPvm: '2025-07-05', loppuPvm: '2025-07-06' }, nyt), 'paattynyt');
  assert.equal(kisanPaivaTila({ alkuPvm: '2026-10-12', loppuPvm: '2026-10-13' }, nyt), 'kaynnissa');
  assert.equal(kisanPaivaTila({ alkuPvm: '2026-11-01', loppuPvm: '' }, nyt), 'tulossa');
  assert.equal(kisanPaivaTila(null, nyt), 'tulossa');
  assert.equal(cdnOtsikko('paattynyt'), CDN_OTSIKOT.paattynytKorjausaika);
  assert.equal(cdnOtsikko('tuntematon'), CDN_OTSIKOT.tulossa);
});

test('tallennettu kuva: tunti korjausaikana, vuorokausi sen jälkeen', () => {
  const vanha = { paivaTila: 'paattynyt', alkuPvm: '2025-07-05', loppuPvm: '2025-07-06' };
  assert.equal(onkoKuvaTuore({ ...vanha, tallennettu: nyt.getTime() - 5 * TUNTI }, nyt.getTime()), true);
  assert.equal(onkoKuvaTuore({ ...vanha, tallennettu: nyt.getTime() - 25 * TUNTI }, nyt.getTime()), false);

  const tuore = { paivaTila: 'paattynyt', alkuPvm: '2026-10-10', loppuPvm: '2026-10-11' };
  assert.equal(onkoKuvaTuore({ ...tuore, tallennettu: nyt.getTime() - 30 * 60 * 1000 }, nyt.getTime()), true);
  assert.equal(onkoKuvaTuore({ ...tuore, tallennettu: nyt.getTime() - 2 * TUNTI }, nyt.getTime()), false);

  assert.equal(onkoKuvaTuore({ ...vanha, paivaTila: 'kaynnissa', tallennettu: nyt.getTime() }, nyt.getTime()), false);
  assert.equal(onkoKuvaTuore(null, nyt.getTime()), false);
});

test('vanhempi kuva annetaan heti CDN:n vanhan vastauksen rajoissa', () => {
  const PAIVA = 24 * TUNTI;
  const vanha = { paivaTila: 'paattynyt', alkuPvm: '2025-07-05', loppuPvm: '2025-07-06' };
  assert.equal(onkoKuvaKaytettava({ ...vanha, tallennettu: nyt.getTime() - 29 * PAIVA }, nyt.getTime()), true);
  assert.equal(onkoKuvaKaytettava({ ...vanha, tallennettu: nyt.getTime() - 31 * PAIVA }, nyt.getTime()), false);

  const tuore = { paivaTila: 'paattynyt', alkuPvm: '2026-10-10', loppuPvm: '2026-10-11' };
  assert.equal(onkoKuvaKaytettava({ ...tuore, tallennettu: nyt.getTime() - 20 * TUNTI }, nyt.getTime()), true);
  assert.equal(onkoKuvaKaytettava({ ...tuore, tallennettu: nyt.getTime() - 26 * TUNTI }, nyt.getTime()), false);

  assert.equal(onkoKuvaKaytettava({ ...vanha, paivaTila: 'kaynnissa', tallennettu: nyt.getTime() }, nyt.getTime()), false);
  assert.equal(onkoKuvaKaytettava(null, nyt.getTime()), false);
});

test('korjausaikana vanhaa vastausta tarjotaan korkeintaan vuorokauden', () => {
  assert.equal(cdnOtsikko('paattynyt', { alkuPvm: '2026-10-10', loppuPvm: '2026-10-11' }, nyt.getTime()), CDN_OTSIKOT.paattynytKorjausaika);
  assert.equal(cdnOtsikko('paattynyt', { alkuPvm: '2025-07-05', loppuPvm: '2025-07-06' }, nyt.getTime()), CDN_OTSIKOT.paattynyt);
});

test('palvelimen välimuistista CDN saa vain jäljellä olevan tuoreusajan', () => {
  const live = { alkuPvm: '2026-10-12', loppuPvm: '2026-10-13' };
  assert.equal(vastausTuoreMs('kaynnissa', live, nyt.getTime()), 15000);
  assert.equal(cdnOtsikko('kaynnissa', live, nyt.getTime(), 10000), 'public, s-maxage=5, stale-while-revalidate=15');
  assert.equal(cdnOtsikko('kaynnissa', live, nyt.getTime(), 60000), 'public, s-maxage=1, stale-while-revalidate=15');
});
