import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsiRanking,
  parsiRankingKisaNimet,
  rankingSarjatAmpujille,
  rankingValilehdenNimi,
  suodataRanking
} from './rankingTulokset.js';

// RANKING_2026-välilehden alku (Sporting_Ranking_2026), kisoja lyhennetty neljään.
const RIVIT = [
  ['SPORTING- JA COMPAK-RANKING 2026'],
  ['Väri: vihreä = pakolliset ja vähintään 4 tulosta'],
  ['', '', '', '', '', '', 'SM ★', 'SM ★', 'SM ★', 'Ranking', '', 'rivi (auto)', 'tila (auto)', 'mukana (auto)'],
  ['Sija', 'Nimi', 'Sarja', 'Seura', 'Yhteensä', 'Tuloksia', 'CSP_SM', 'ESP_SM', 'SP_SM', 'CSP_HYMA'],
  ['1', 'Moilanen Juhani', 'Y', 'OMAS', '396.84%', '4', '99.48%', '95.56%', '100.00%', '98.43%', '', '6', '1', '1', '0', '1', '1'],
  ['2', 'Mäkäräinen Hannu', 'Y56', 'KEUA', '373.25%', '4', '93.23%', '90.56%', '84.18%', '93.72%', '', '20', '1', '1', '1', '0', '1'],
  ['3', 'Äijälä Aatos', 'Y20', 'NU', '364.43%', '3', '94.27%', '82.78%', '80.79%', '', '', '49', '2', '1', '1', '1'],
  ['4', 'Kytömaa Juha', 'Y66', 'SSG', '364.67%', '2', '85.42%', '', '', '94.85%', '', '19', '3', '1', '', '', '1'],
  ['5', 'Peltokangas Laura', 'N', 'JSF', '357.99%', '3', '85.42%', '86.67%', '90.96%', '', '', '30', '2', '0', '1', '1'],
  ['', '', '', '', '', '', '', '', '', '']
];

test('parsiRanking lukee ampujat, kisat, tilan ja laskettavat tulokset', () => {
  const ranking = parsiRanking(RIVIT);
  assert.equal(ranking.ampujat.length, 5);

  const [moilanen, , aijala] = ranking.ampujat;
  assert.equal(moilanen.sija, '1');
  assert.equal(moilanen.yhteensa, '396.84%');
  assert.equal(moilanen.tuloksia, '4');
  assert.equal(moilanen.tila, 1);
  assert.deepEqual(moilanen.tulokset.map((t) => [t.koodi, t.taso, t.tulos, t.mukana]), [
    ['CSP_SM', 'SM ★', '99.48%', true], ['ESP_SM', 'SM ★', '95.56%', false],
    ['SP_SM', 'SM ★', '100.00%', true], ['CSP_HYMA', 'Ranking', '98.43%', true]
  ]);
  // Tyhjät tulokset jätetään pois.
  assert.deepEqual(aijala.tulokset.map((t) => t.koodi), ['CSP_SM', 'ESP_SM', 'SP_SM']);
  assert.equal(aijala.tila, 2);
});

test('parsiRanking palauttaa tyhjän, jos otsikkoriviä ei ole', () => {
  assert.deepEqual(parsiRanking([['jotain'], ['muuta']]).ampujat, []);
  assert.deepEqual(parsiRanking([]).ampujat, []);
});

test('suodataRanking yhdistää sarjat ja numeroi sijat sarjan sisällä', () => {
  const { ampujat } = parsiRanking(RIVIT);
  assert.deepEqual(suodataRanking(ampujat, 'OPEN').map((a) => [a.nimi, a.laskettuSija]), [
    ['Moilanen Juhani', '1'], ['Mäkäräinen Hannu', '2'], ['Äijälä Aatos', '3'], ['Kytömaa Juha', '4'], ['Peltokangas Laura', '5']
  ]);
  assert.deepEqual(suodataRanking(ampujat, 'SENIORIT').map((a) => [a.nimi, a.laskettuSija]), [
    ['Mäkäräinen Hannu', '1'], ['Kytömaa Juha', '2']
  ]);
  assert.deepEqual(suodataRanking(ampujat, 'JUNIORIT').map((a) => a.nimi), ['Äijälä Aatos']);
  assert.deepEqual(suodataRanking(ampujat, 'NAISET').map((a) => a.nimi), ['Peltokangas Laura']);
  assert.equal(suodataRanking(ampujat, 'tuntematon').length, 5);
});

test('suodataRanking antaa saman sijan taulukon tasasijoille', () => {
  const ampujat = [
    { nimi: 'A', sarja: 'Y56', sija: '3' },
    { nimi: 'B', sarja: 'Y66', sija: '3' },
    { nimi: 'C', sarja: 'Y73', sija: '7' }
  ];
  assert.deepEqual(suodataRanking(ampujat, 'SENIORIT').map((a) => a.laskettuSija), ['1', '1', '3']);
});

test('rankingSarjatAmpujille näyttää vain sarjat, joissa on ampujia', () => {
  const sarjat = rankingSarjatAmpujille([{ sarja: 'Y' }, { sarja: 'n' }]);
  assert.deepEqual(sarjat.map((s) => s.avain), ['OPEN', 'NAISET']);
});

test('rankingValilehdenNimi', () => {
  assert.equal(rankingValilehdenNimi(2026), 'RANKING_2026');
});

test('parsiRankingKisaNimet lukee KISAT-välilehden koodit ja nimet', () => {
  const nimet = parsiRankingKisaNimet([
    ['Koodi', 'Kisa', 'Laji', 'Taso', 'SM-ryhmä (K)', '', 'ASETUKSET'],
    ['CSP_SM', 'Compak SM', 'Compak', 'SM', 'K', '', 'SM-ryhmästä pakollisina parhaat (kpl)', '2'],
    ['CSP_EM', 'Compak EM', 'Compak', 'EM'],
    ['', 'Ilman koodia'],
    ['TYHJA', '']
  ]);
  assert.deepEqual([...nimet], [['CSP_SM', 'Compak SM'], ['CSP_EM', 'Compak EM']]);
  assert.equal(parsiRankingKisaNimet([]).size, 0);
});
