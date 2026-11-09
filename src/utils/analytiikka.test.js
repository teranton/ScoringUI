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

const { lataaAnalytiikka, analytiikkaPolku, kirjaaSivunakyma } = await import('./analytiikka.js');

test('automaattinen sivunäyttöjen seuranta on pois päältä', () => {
  kutsut.length = 0;
  lataaAnalytiikka();
  assert.equal(kutsut[0][0], 'inject');
  assert.equal(kutsut[0][1].disableAutoTrack, true);
});

test('kisa kirjataan omana sivunaan ja sama polku peräkkäin vain kerran', () => {
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
