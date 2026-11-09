import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const kutsut = [];
mock.module('@vercel/analytics', {
  namedExports: {
    inject: (asetukset) => kutsut.push(['inject', asetukset]),
    pageview: (tieto) => kutsut.push(['pageview', tieto]),
    track: (nimi, tieto) => kutsut.push(['track', nimi, tieto])
  }
});

const { lataaAnalytiikka, analytiikkaPolku, kirjaaSivunakyma, sivunakymanPolku } = await import('./analytiikka.js');
const { lueHashinKisaId } = await import('./kisaHash.js');

test('automaattinen sivunäyttöjen seuranta on pois päältä', () => {
  kutsut.length = 0;
  lataaAnalytiikka();
  assert.equal(kutsut[0][0], 'inject');
  assert.equal(kutsut[0][1].disableAutoTrack, true);
});

test('kisa kirjataan omana sivunaan ja sama polku peräkkäin vain kerran', () => {
  // Edellinen polku on moduulin tilaa: aloitetaan polulla, jota testi ei muuten käytä.
  kirjaaSivunakyma('/testin-alku');
  kutsut.length = 0;
  assert.equal(analytiikkaPolku(null), '/');
  assert.equal(analytiikkaPolku('12'), '/kisa/12');
  kirjaaSivunakyma(null);
  kirjaaSivunakyma('/');
  kirjaaSivunakyma('/kisa/12');
  kirjaaSivunakyma('/kisa/12');
  kirjaaSivunakyma('/');
  kirjaaSivunakyma('/kisa/12');
  assert.deepEqual(kutsut, [
    ['pageview', { route: '/', path: '/' }],
    ['pageview', { route: '/kisa/[id]', path: '/kisa/12' }],
    ['pageview', { route: '/', path: '/' }],
    ['pageview', { route: '/kisa/[id]', path: '/kisa/12' }]
  ]);
});

test('suoran linkin kisaa odotetaan, kunnes tuore rekisteri on haettu', () => {
  const kisat = [{ id: '12' }];
  assert.equal(sivunakymanPolku({ valittuKisaId: '12', hashKisaId: '12', kisat, rekisteriHaettu: false }), '/kisa/12');
  assert.equal(sivunakymanPolku({ valittuKisaId: null, hashKisaId: '', kisat, rekisteriHaettu: false }), '/');
  // Kisa on listassa, mutta reitityksen efekti ei ole vielä avannut sitä.
  assert.equal(sivunakymanPolku({ valittuKisaId: null, hashKisaId: '12', kisat, rekisteriHaettu: true }), null);
  // Tallennetusta listasta puuttuva kisa voi löytyä tuoreesta.
  assert.equal(sivunakymanPolku({ valittuKisaId: null, hashKisaId: '55', kisat, rekisteriHaettu: false }), null);
  // Tuntematon kisa tuoreen rekisterin jälkeen: etusivu.
  assert.equal(sivunakymanPolku({ valittuKisaId: null, hashKisaId: '55', kisat, rekisteriHaettu: true }), '/');
});

test('hashin kisa luetaan, virheellinen koodaus ei kaada', () => {
  assert.equal(lueHashinKisaId('#kisa-12'), '12');
  assert.equal(lueHashinKisaId('#kisa-a%20b'), 'a b');
  assert.equal(lueHashinKisaId('#kisa-50%'), '');
  assert.equal(lueHashinKisaId('#muu'), '');
  assert.equal(lueHashinKisaId(''), '');
});
