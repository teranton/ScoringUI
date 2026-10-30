import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EI_JAETTU_MS, kirjurinIndeksi, luoKirjuriValitsin, onPaasyVirhe } from './kirjuriTilit.js';
import { kirjurienMaara } from './googleAuth.js';

const ID = '1dDFHggKRym2rfg2G2BrHb4VOD4c4LVL321inL7mguMk';
const virhe = (status, message = '') => Object.assign(new Error(message), { response: { status, data: { error: { message } } } });

// Tilit, joiden vastaus on joko 'ok' tai virhe; kutsut kirjataan [tili, url].
function tilit(vastaukset) {
  const kutsut = [];
  const haeAsiakas = async (i) => ({
    request: async (opts) => {
      kutsut.push([i, opts.url]);
      const v = vastaukset[i];
      if (v instanceof Error) throw v;
      return { data: { tili: i } };
    }
  });
  return { kutsut, haeAsiakas };
}

// Rata, jonka ensisijainen tili on haluttu (tiiviste ratkaisee).
const rataTilille = (i, maara) => Array.from({ length: 50 }, (_, k) => k + 1).find((s) => kirjurinIndeksi(ID, s, maara) === i);

test('tilien määrä ympäristömuuttujista: numerot peräkkäin', () => {
  assert.equal(kirjurienMaara({}), 0);
  assert.equal(kirjurienMaara({ KIRJURI_CLIENT_EMAIL: 'a', KIRJURI_PRIVATE_KEY: 'k' }), 1);
  assert.equal(kirjurienMaara({
    KIRJURI_CLIENT_EMAIL: 'a', KIRJURI_PRIVATE_KEY: 'k',
    KIRJURI_CLIENT_EMAIL_2: 'b', KIRJURI_PRIVATE_KEY_2: 'k',
    KIRJURI_CLIENT_EMAIL_4: 'd', KIRJURI_PRIVATE_KEY_4: 'k'
  }), 2);
  assert.equal(kirjurienMaara({ KIRJURI_CLIENT_EMAIL: 'a', KIRJURI_PRIVATE_KEY: 'k', KIRJURI_CLIENT_EMAIL_2: 'b' }), 1);
});

test('rata ja ryhmä käyttävät aina samaa tiliä, ja radat jakautuvat tileille', () => {
  assert.equal(kirjurinIndeksi(ID, 3, 1), 0);
  assert.equal(kirjurinIndeksi(ID, 3, 3), kirjurinIndeksi(ID, 3, 3));
  const kaytetyt = new Set(Array.from({ length: 8 }, (_, k) => kirjurinIndeksi(ID, k + 1, 2)));
  assert.equal(kaytetyt.size, 2);
  const ryhmat = new Set(Array.from({ length: 12 }, (_, k) => kirjurinIndeksi(ID, `r${k + 1}`, 3)));
  assert.ok(ryhmat.size >= 2);
});

test('yksi tili: kaikki pyynnöt sillä, virhe sellaisenaan', async () => {
  const { kutsut, haeAsiakas } = tilit([virhe(429)]);
  const pyynto = luoKirjuriValitsin({ haeAsiakas, maara: 1 })(ID, 5);
  await assert.rejects(pyynto({ url: 'x' }), (e) => e.response.status === 429);
  assert.ok(kutsut.every(([i]) => i === 0));
});

test('taulukkoa ei ole jaettu valitulle tilille: tili 1, ja se muistetaan', async () => {
  let aika = 0;
  const { kutsut, haeAsiakas } = tilit(['ok', virhe(403, 'The caller does not have permission')]);
  const valitsin = luoKirjuriValitsin({ haeAsiakas, maara: 2, nyt: () => aika });
  const pyynto = valitsin(ID, rataTilille(1, 2));
  assert.deepEqual((await pyynto({ url: 'a' })).data, { tili: 0 });
  assert.deepEqual(kutsut, [[1, 'a'], [0, 'a']]);
  await pyynto({ url: 'b' });
  assert.deepEqual(kutsut.slice(2), [[0, 'b']]);
  aika += EI_JAETTU_MS;
  await pyynto({ url: 'c' });
  assert.deepEqual(kutsut.slice(3), [[1, 'c'], [0, 'c']]);
});

test('suojattu alue ei ole jako-ongelma: virhe heitetään eikä toista tiliä yritetä', async () => {
  const suojattu = virhe(403, 'You are trying to edit a protected cell or object.');
  const { kutsut, haeAsiakas } = tilit(['ok', suojattu]);
  const pyynto = luoKirjuriValitsin({ haeAsiakas, maara: 2 })(ID, rataTilille(1, 2));
  await assert.rejects(pyynto({ url: 'a' }), (e) => e === suojattu);
  assert.deepEqual(kutsut, [[1, 'a']]);
  assert.equal(onPaasyVirhe(suojattu), false);
  assert.equal(onPaasyVirhe(virhe(404)), true);
});

test('täysi kiintiö: pyyntö kerran toisella tilillä', async () => {
  const { kutsut, haeAsiakas } = tilit([virhe(429), 'ok']);
  const pyynto = luoKirjuriValitsin({ haeAsiakas, maara: 2 })(ID, rataTilille(0, 2));
  assert.deepEqual((await pyynto({ url: 'a' })).data, { tili: 1 });
  // Ensin tavallinen uudelleenyritys samalla tilillä (pyyntoUudelleenyrittaen), sitten toinen tili.
  assert.deepEqual(kutsut, [[0, 'a'], [0, 'a'], [1, 'a']]);
});

test('täysi kiintiö ja toiselle tilille ei jaettu: alkuperäinen 429', async () => {
  const taynna = virhe(429);
  const { kutsut, haeAsiakas } = tilit([taynna, virhe(403, 'The caller does not have permission')]);
  const pyynto = luoKirjuriValitsin({ haeAsiakas, maara: 2 })(ID, rataTilille(0, 2));
  await assert.rejects(pyynto({ url: 'a' }), (e) => e === taynna);
  await assert.rejects(pyynto({ url: 'b' }), (e) => e === taynna);
  // Toista tiliä ei yritetä enää, kun tiedetään, ettei sille ole jaettu.
  assert.deepEqual(kutsut, [[0, 'a'], [0, 'a'], [1, 'a'], [0, 'b'], [0, 'b']]);
});
