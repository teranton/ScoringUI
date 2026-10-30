import { test } from 'node:test';
import assert from 'node:assert/strict';

import { asiakkaanIp, ilmoittaudu, ilmoittautuneidenNimet, luoRajoitin } from './ilmoittaudu.js';

const ID = 'testisheet';
const NYT = new Date('2026-11-10T12:00:00Z');
const KISA = { alkuPvm: '21.11.2026', loppuPvm: '22.11.2026' };

// Taulukko muistissa: välilehti → rivit. Puuttuva välilehti kaataa batchGetin kuten Sheets API.
function luoTaulukko(valilehdet) {
  const taulukko = structuredClone(valilehdet);
  const kutsut = [];
  async function request({ url, method = 'GET', data }) {
    const u = new URL(url);
    kutsut.push({ method, polku: decodeURIComponent(u.pathname), data });
    if (method === 'GET' && u.pathname.endsWith(ID)) {
      return { data: { sheets: Object.keys(taulukko).map((title, i) => ({ properties: { title, sheetId: i } })) } };
    }
    if (u.pathname.endsWith('values:batchGet')) {
      return { data: { valueRanges: u.searchParams.getAll('ranges').map((alue) => {
        const tab = alue.slice(1, -1).replace(/''/g, "'");
        if (!taulukko[tab]) throw Object.assign(new Error('x'), { response: { status: 400 } });
        return { values: taulukko[tab] };
      }) } };
    }
    if (u.pathname.endsWith(':batchUpdate')) {
      const title = data.requests[0].addSheet.properties.title;
      if (taulukko[title]) throw Object.assign(new Error('x'), { response: { status: 400, data: 'already exists' } });
      taulukko[title] = [];
      return { data: {} };
    }
    const tab = decodeURIComponent(u.pathname).match(/values\/'(.+)'!A1/)[1];
    if (method === 'PUT') taulukko[tab][0] = data.values[0];
    else taulukko[tab].push(...data.values);
    return { data: {} };
  }
  return { request, taulukko, kutsut };
}

const SPEKSIT = [['Selite', 'Avain', 'Arvo'], ['', 'ILMOITTAUTUMINEN', 'LOMAKE'], ['', 'ILMOITTAUTUMISEN_SARJAT', 'Y, Y56']];
const RUNKO = { sukunimi: 'meikäläinen', etunimi: 'matti', sarja: 'y56', seura: 'NoSA', sahkoposti: 'm@x.fi', puhelin: '040', suostumus: true };

test('ilmoittautuminen luo ILMOITTAUTUMISET-välilehden ja lisää rivin otsikon mukaan', async () => {
  const t = luoTaulukko({ KISANSPEKSIT: SPEKSIT, Ilmoittautuneet: [[], ['', '', 'NRO', 'NIMI'], ['', '1', '1', 'Rantonen Tero']] });
  const tulos = await ilmoittaudu({ request: t.request, sheetId: ID, kisa: KISA, runko: RUNKO, nyt: NYT });
  assert.equal(tulos.status, 200);
  assert.deepEqual(tulos.body, { ok: true, nimi: 'Meikäläinen Matti', sarja: 'Y56', seura: 'NoSA' });
  const [otsikko, rivi] = t.taulukko.ILMOITTAUTUMISET;
  assert.equal(otsikko[0], 'AIKALEIMA');
  const arvo = (o) => rivi[otsikko.indexOf(o)];
  assert.equal(arvo('NIMI'), 'Meikäläinen Matti');
  assert.equal(arvo('SÄHKÖPOSTI'), 'm@x.fi');
  assert.equal(arvo('SIIRRETTY'), '');
  assert.match(arvo('AIKALEIMA'), /^10\.11\.2026 14\.00\.00$/);
  assert.ok(t.kutsut.some((k) => k.polku.includes(':append') ));
});

test('sama nimi torjutaan: pääsivulla, lomakkeella (myös siirretty) ja Suomisport-tuonnissa', async () => {
  const pohjat = [
    { Ilmoittautuneet: [['NRO', 'NIMI'], ['1', 'Matti Meikäläinen']] },
    { ILMOITTAUTUMISET: [['NIMI', 'SIIRRETTY'], ['meikäläinen matti', '1.11.2026']] },
    { 'Suomisport Import': [['Sportti-ID', 'NIMI'], ['1', 'Meikäläinen Matti']] }
  ];
  for (const pohja of pohjat) {
    const t = luoTaulukko({ KISANSPEKSIT: SPEKSIT, ...pohja });
    const tulos = await ilmoittaudu({ request: t.request, sheetId: ID, kisa: KISA, runko: RUNKO, nyt: NYT });
    assert.equal(tulos.status, 409, JSON.stringify(pohja));
    assert.equal(tulos.body.koodi, 'kaksoiskappale');
  }
});

test('lomake ei käytössä, suljettu tai virheellinen: mitään ei kirjoiteta', async () => {
  const ei = luoTaulukko({ KISANSPEKSIT: [['', 'ILMOITTAUTUMINEN', 'SUOMISPORT']] });
  assert.equal((await ilmoittaudu({ request: ei.request, sheetId: ID, kisa: KISA, runko: RUNKO, nyt: NYT })).body.koodi, 'eiKaytossa');
  const suljettu = luoTaulukko({ KISANSPEKSIT: SPEKSIT });
  const myohaan = await ilmoittaudu({ request: suljettu.request, sheetId: ID, kisa: KISA, runko: RUNKO, nyt: new Date('2026-11-20T22:00:00Z') });
  assert.equal(myohaan.body.koodi, 'suljettu');
  const vaara = luoTaulukko({ KISANSPEKSIT: SPEKSIT });
  const virhe = await ilmoittaudu({ request: vaara.request, sheetId: ID, kisa: KISA, runko: { ...RUNKO, sarja: 'N' }, nyt: NYT });
  assert.equal(virhe.status, 400);
  assert.deepEqual(virhe.body.virheet, { sarja: 'tuntematon' });
  for (const t of [ei, suljettu, vaara]) assert.ok(!t.kutsut.some((k) => k.method !== 'GET'));
});

test('ilmoittautuneidenNimet lukee NIMI-sarakkeen otsikkorivin alta, numerot ovat vapaita paikkoja', () => {
  assert.deepEqual(ilmoittautuneidenNimet([[], ['', 'NRO', 'NIMI'], ['', '1', 'A B'], ['', '2', '17'], ['', '3', '']]), ['A B']);
  assert.deepEqual(ilmoittautuneidenNimet([['x']]), []);
});

test('rajoitin päästää maks-määrän ikkunassa, ja IP tulee Vercelin otsakkeista', () => {
  const r = luoRajoitin(1000);
  assert.equal(r.sallittu('a', 2, 0), true);
  assert.equal(r.sallittu('a', 2, 10), true);
  assert.equal(r.sallittu('a', 2, 20), false);
  assert.equal(r.sallittu('a', 2, 1001), true);
  assert.equal(asiakkaanIp({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), '1.2.3.4');
  assert.equal(asiakkaanIp({ 'x-real-ip': '1.2.3.4', 'cf-connecting-ip': '9.9.9.9' }), '1.2.3.4|9.9.9.9');
  assert.equal(asiakkaanIp({}), 'tuntematon');
});

function vastaus() {
  const res = { otsakkeet: {}, setHeader(k, v) { res.otsakkeet[k] = v; }, status(s) { res.koodi = s; return res; }, json(b) { res.runko = b; return res; } };
  return res;
}

test('käsittelijä: piilokenttä näyttää onnistuneelta mutta ei kirjoita, liian nopea lähetys torjutaan', async () => {
  const { default: handler } = await import('./ilmoittaudu.js');
  const botti = vastaus();
  await handler({ method: 'POST', headers: {}, body: { sheetId: '1rs_ZwCclYUxrDueBIc65M-49ZAh4XpxSFGOPNqEU3iU', kotisivu: 'http://spam', kesto: 10 } }, botti);
  assert.deepEqual([botti.koodi, botti.runko], [200, { ok: true }]);
  const nopea = vastaus();
  await handler({ method: 'POST', headers: {}, body: JSON.stringify({ sheetId: '1rs_ZwCclYUxrDueBIc65M-49ZAh4XpxSFGOPNqEU3iU', kesto: 500 }) }, nopea);
  assert.deepEqual([nopea.koodi, nopea.runko.koodi], [400, 'liianNopea']);
  const get = vastaus();
  await handler({ method: 'GET', headers: {} }, get);
  assert.equal(get.koodi, 405);
});
