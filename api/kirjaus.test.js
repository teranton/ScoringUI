import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

const ID = '1rs_ZwCclYUxrDueBIc65M-49ZAh4XpxSFGOPNqEU3iU';
process.env.KIRJAUS_SALAISUUS = 'testisalaisuus-joka-on-pitka';

// Taulukko muistissa: välilehti → { id, rivit }. Muotoilematon luku palautetaan lukuna, muotoiltu tekstinä.
let taulukko;
let jaettu = true;
let kirjoitukset = 0;
let lukuja = 0;

let suojattuPaa = false;

const sarakeNumero = (kirjaimet) => [...kirjaimet].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function alueenTiedot(alue) {
  const m = decodeURIComponent(alue).match(/^'((?:[^']|'')+)'(?:!([A-Z]+)(\d+)(?::[A-Z]+(\d+))?)?/);
  // Yksittäinen solu (esim. F3): vain sen sarake; muuten rivit sarakkeesta A alkaen.
  const solu = Boolean(m[2]) && !m[4];
  return {
    tab: m[1].replace(/''/g, "'"), alku: m[3] ? Number(m[3]) : 1,
    loppu: m[4] ? Number(m[4]) : (solu ? Number(m[3]) : null), sarake: solu ? sarakeNumero(m[2]) : null
  };
}
const tabIdlla = (id) => Object.values(taulukko).find((t) => t.id === id);
const soluArvo = (s) => s.userEnteredValue?.numberValue ?? s.userEnteredValue?.stringValue ?? '';

async function request({ url, method = 'GET', data }) {
  if (!jaettu) throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
  const u = new URL(url);
  if (method === 'GET' && u.pathname.endsWith(ID) && u.searchParams.has('ranges')) {
    // spreadsheets.get soluina: { kaava, arvo } = kaavasolu, { taytetty } = taulukkokaavan täyttämä solu.
    lukuja++;
    const { tab } = alueenTiedot(u.searchParams.get('ranges'));
    const arvo = (v) => (typeof v === 'number' ? { numberValue: v } : { stringValue: String(v) });
    const solu = (v) => {
      if (v && typeof v === 'object') return v.kaava !== undefined
        ? { userEnteredValue: { formulaValue: v.kaava }, effectiveValue: arvo(v.arvo) }
        : { effectiveValue: arvo(v.taytetty) };
      return v === '' || v === undefined || v === null ? {} : { userEnteredValue: arvo(v), effectiveValue: arvo(v) };
    };
    return { data: { sheets: [{ data: [{ rowData: taulukko[tab].rivit.map((r) => ({ values: (r || []).map(solu) })) }] }] } };
  }
  if (method === 'GET' && u.pathname.endsWith(ID)) {
    lukuja++;
    return { data: { properties: { title: 'Testikisa' }, sheets: Object.entries(taulukko).map(([title, t]) => ({
      properties: { title, sheetId: t.id, ...(t.sarakkeita ? { gridProperties: { columnCount: t.sarakkeita } } : {}) }
    })) } };
  }
  if (u.pathname.endsWith('values:batchGet')) {
    lukuja++;
    const muotoiltu = u.searchParams.get('valueRenderOption') === 'FORMATTED_VALUE';
    return { data: { valueRanges: u.searchParams.getAll('ranges').map((alue) => {
      const { tab, alku, loppu, sarake } = alueenTiedot(alue);
      // Kuten Sheets API: puuttuva välilehti kaataa koko luvun.
      if (!taulukko[tab]) throw Object.assign(new Error('x'), { response: { status: 400, data: { error: { message: `Unable to parse range: ${tab}` } } } });
      const rivit = (taulukko[tab]?.rivit || []).slice(alku - 1, loppu ?? undefined)
        .map((r) => (r || []).map((v) => (muotoiltu && typeof v === 'number' && v > 1e11 ? v.toExponential(5) : v)));
      if (sarake !== null) {
        const v = rivit[0]?.[sarake];
        return { values: v === undefined || v === '' ? [] : [[v]] };
      }
      return { values: rivit };
    }) } };
  }
  if (u.pathname.endsWith(':batchUpdate')) {
    kirjoitukset++;
    const paaId = taulukko['OSALLISTUJAT+TULOKSET']?.id;
    if (suojattuPaa && data.requests.some((r) => r.updateCells?.start.sheetId === paaId)) {
      throw Object.assign(new Error('protected'), { response: { status: 400, data: { error: { message: 'You are trying to edit a protected cell or object.' } } } });
    }
    // Kuten Sheets API: yksikin olemassa oleva välilehti kaataa koko pyynnön.
    if (data.requests.some((r) => r.addSheet && taulukko[r.addSheet.properties.title])) {
      throw Object.assign(new Error('x'), { response: { status: 400, data: { error: { message: 'already exists' } } } });
    }
    for (const r of data.requests) {
      if (r.addSheet) {
        const p = r.addSheet.properties;
        taulukko[p.title] = { id: p.sheetId, rivit: [], sarakkeita: p.gridProperties.columnCount };
      } else if (r.appendDimension) {
        tabIdlla(r.appendDimension.sheetId).sarakkeita += r.appendDimension.length;
      } else if (r.updateCells) {
        const tab = tabIdlla(r.updateCells.start.sheetId);
        const { rowIndex, columnIndex } = r.updateCells.start;
        const arvot = r.updateCells.rows[0].values.map(soluArvo);
        if (tab.sarakkeita && columnIndex + arvot.length > tab.sarakkeita) throw new Error('grid limits');
        const rivi = [...(tab.rivit[rowIndex] || [])];
        arvot.forEach((v, i) => { rivi[columnIndex + i] = v; });
        tab.rivit[rowIndex] = rivi;
      } else if (r.appendCells) {
        const tab = tabIdlla(r.appendCells.sheetId);
        if (tab.sarakkeita && r.appendCells.rows.some((row) => row.values.length > tab.sarakkeita)) throw new Error('grid limits');
        tab.rivit.push(...r.appendCells.rows.map((row) => row.values.map(soluArvo)));
      }
    }
    return { data: {} };
  }
  throw new Error(`odottamaton pyyntö ${method} ${url}`);
}

mock.module('./_lib/googleAuth.js', { namedExports: {
  onKiintioVirhe: () => false,
  googleStatus: (error) => Number(error?.response?.status || error?.status || error?.code),
  googleViesti: (error) => JSON.stringify(error?.response?.data || error?.message || ''),
  onKirjuriMaaritetty: () => true,
  kirjurienMaara: () => 1,
  pyyntoUudelleenyrittaen: (req, opts) => req(opts),
  haeKirjuriAsiakas: async () => ({ request })
} });
mock.module('./_lib/sheetAllowlist.js', { namedExports: {
  torjuEiSallittuSheetId: async (sheetId, res) => {
    if (sheetId === ID) return false;
    res.status(403).json({ error: 'ei rekisterissä' });
    return true;
  }
} });

const { default: handler, tyhjennaKirjausMuisti } = await import('./kirjaus.js');
const { luoAvain } = await import('./_lib/kirjausAvain.js');
const { vaihtoPin } = await import('./_lib/kirjausHaltija.js');

const avain = (sarake = 2, sheetId = ID) => luoAvain({ sheetId, sarake, voimassaAsti: Math.floor(Date.now() / 1000) + 3600 }, process.env.KIRJAUS_SALAISUUS);

function kutsu({ method = 'GET', toiminto = 'avaa', token = avain(), body, laite, haltija } = {}) {
  const res = {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; }
  };
  const headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(laite ? { 'x-kirjaus-laite': laite } : {}),
    ...(haltija ? { 'x-kirjaus-haltija': haltija } : {})
  };
  const req = { method, query: { toiminto }, headers, body };
  return handler(req, res).then(() => res);
}

function alusta() {
  jaettu = true;
  suojattuPaa = false;
  kirjoitukset = 0;
  lukuja = 0;
  tyhjennaKirjausMuisti();
  taulukko = {
    KISANSPEKSIT: { id: 1, rivit: [['RATA2_NIMI', 'Kakkonen'], ['RATA2_OHJELMA', 'SDD'], ['LAYOUT/PÄIVÄ', '2']] },
    'Aikataulu La': { id: 2, rivit: [
      ['AIKATAULU | 11.7.2026'],
      ['RATA1', '', '', 'RATA2'],
      ['09:00', '1', 'Aaltonen A', '09:00', '3', 'Cederberg C'],
      ['09:04', '2', 'Berg B', '09:04', '4', 'Dahl D']
    ] }
  };
}

// Ottaa radan laitteelle (vapaa rata) ja palauttaa haltija-avaimen.
async function ota(laite = 'laite-1', lisa = {}) {
  const res = await kutsu({ method: 'POST', toiminto: 'ota', body: { laite, nimi: `Testi ${laite}`, ...lisa } });
  return res.statusCode === 200 ? res.body.haltija : res;
}
const tallenna = (body) => kutsu({ method: 'POST', toiminto: 'tallenna', body });

const MERKIT = 'XXXXO' + '-'.repeat(20);
const VERSIO = 1760012345678;

test('ilman koodia tai väärällä koodilla ei pääse', async () => {
  alusta();
  assert.equal((await kutsu({ token: '' })).statusCode, 401);
  assert.equal((await kutsu({ token: 'v1.a.b' })).statusCode, 401);
  assert.equal((await kutsu({ token: avain(2, '1Ert3n7Fft235Zpoc42NZnGxOOhM1kQzwhef6lRF0geI') })).statusCode, 403);
  assert.equal((await kutsu({ toiminto: 'muu' })).statusCode, 400);
  assert.equal((await kutsu({ method: 'POST', toiminto: 'avaa' })).statusCode, 405);
});

test('avaa: radan jono, nimi ja tyhjät kortit', async () => {
  alusta();
  const res = await kutsu();
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.kisa, 'Testikisa');
  assert.equal(res.body.rataNimi, 'Kakkonen');
  assert.equal(res.body.ohjelma, 'SDD');
  assert.deepEqual(res.body.jono.map((a) => a.nro), [3, 4, 1, 2]);
  assert.deepEqual(res.body.kortit, []);
});

test('jakamaton taulukko: kirjaus ei ole käytössä', async () => {
  alusta();
  jaettu = false;
  const res = await kutsu();
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /ei ole käytössä/);
});

test('tallenna: haltija ottaa radan, kortti ja loki yhdellä kirjoituksella; vanha versio ei kirjoita', async () => {
  alusta();
  const h1 = await ota('laite-1');
  assert.match(h1, /^h1\.1\./);
  assert.equal(taulukko.MOBIILI_LAITTEET.rivit[2][2], 'laite-1');
  assert.match(taulukko.MOBIILI_LOKI.rivit[1][7], /RATA OTETTU: vapaa rata/);

  lukuja = 0;
  kirjoitukset = 0;
  const body = { laite: 'laite-1', haltija: h1, kortit: [{ nro: 3, nimi: 'Cederberg C', merkit: MERKIT, versio: VERSIO }] };
  const res = await tallenna(body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { tallennetut: [3], uudemmat: [] });
  assert.equal(lukuja, 1, 'haltija ja kortit yhdellä luvulla');
  assert.equal(kirjoitukset, 1);
  const tab = taulukko['MOBIILI Rata 2'].rivit;
  assert.equal(tab[0][0], 'NRO');
  assert.deepEqual(tab[3].slice(0, 3), [3, 'Cederberg C', 4]);
  assert.equal(tab[3][5], VERSIO);
  assert.equal(taulukko.MOBIILI_LOKI.rivit[0][7], 'HUOM');
  assert.equal(taulukko.MOBIILI_LOKI.rivit.length, 3);

  // Sama lähetys uudelleen: kuitataan, ei kirjoiteta eikä lokiteta.
  const uudelleen = await kutsu({ method: 'POST', toiminto: 'tallenna', body: JSON.stringify(body) });
  assert.deepEqual(uudelleen.body, { tallennetut: [3], uudemmat: [] });
  assert.equal(taulukko.MOBIILI_LOKI.rivit.length, 3);

  // Vanhempi versio: palautetaan taulukon kortti.
  const vanha = await tallenna({ ...body, kortit: [{ nro: 3, merkit: 'O'.repeat(25), versio: VERSIO - 1 }] });
  assert.deepEqual(vanha.body.tallennetut, []);
  assert.deepEqual(vanha.body.uudemmat.map(({ nro, merkit, versio, muuLaite }) => ({ nro, merkit, versio, muuLaite })), [{ nro: 3, merkit: MERKIT, versio: VERSIO, muuLaite: false }]);

  // Avaus: kortit, versio tarkkana lukuna, ja haltija.
  const avattu = await kutsu({ laite: 'laite-1', haltija: h1 });
  assert.deepEqual(avattu.body.kortit, [{ nro: 3, merkit: MERKIT, versio: VERSIO }]);
  assert.equal(avattu.body.haltija.oma, true);
  const toisella = await kutsu({ laite: 'laite-2' });
  assert.equal(toisella.body.haltija.oma, false);
  assert.equal(toisella.body.haltija.vapaa, false);
  assert.equal(toisella.body.haltija.nimi, 'Testi laite-1');
  assert.equal(JSON.stringify(toisella.body).includes('"laite-1"'), false, 'toisen laitteen tunnus ei näy');
});

test('tallenna: ilman haltija-avainta ei kirjoiteta', async () => {
  alusta();
  const res = await tallenna({ laite: 'laite-1', kortit: [{ nro: 3, merkit: MERKIT, versio: VERSIO }] });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.paivita, true);
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[3], undefined);
  assert.equal(taulukko.MOBIILI_LOKI.rivit.length, 1, 'vanhan version tallennusta ei lokiteta');
  // Väärennetty avain toiselle laitteelle ei kelpaa.
  const h1 = await ota('laite-1');
  const res2 = await tallenna({ laite: 'laite-2', haltija: h1, kortit: [{ nro: 3, merkit: MERKIT, versio: VERSIO }] });
  assert.equal(res2.statusCode, 409);
});

test('varattu rata: PIN-koodi vaihtaa laitteen, palaavan vanhan laitteen kortit täydentävät ampumattomat kohteet', async () => {
  alusta();
  const h1 = await ota('laite-1');
  await tallenna({ laite: 'laite-1', haltija: h1, kortit: [{ nro: 3, merkit: MERKIT, versio: VERSIO }] });

  const varattu = await ota('laite-2');
  assert.equal(varattu.statusCode, 409);
  assert.equal(varattu.body.varattu, true);

  const vaara = await ota('laite-2', { pin: '0000' === vaihtoPin({ sheetId: ID, sarake: 2, sukupolvi: 1 }, process.env.KIRJAUS_SALAISUUS) ? '0001' : '0000' });
  assert.equal(vaara.statusCode, 403);
  assert.equal(vaara.body.yrityksia, 9);

  const pin = vaihtoPin({ sheetId: ID, sarake: 2, sukupolvi: 1 }, process.env.KIRJAUS_SALAISUUS);
  const h2 = await ota('laite-2', { pin });
  assert.match(h2, /^h1\.2\./);
  assert.equal(taulukko.MOBIILI_LAITTEET.rivit[2][6], 0, 'virheet nollataan');
  // Sama PIN ei kelpaa uudelleen (sukupolvi vaihtui).
  const uudelleen = await ota('laite-3', { pin });
  assert.equal(uudelleen.statusCode, 403);

  // Uusi laite jatkaa kortilla 3 (kiekot 6–7); vanhan laitteen lähettämättä jääneet kiekot 6–10 puuttuvat siltä.
  const uudenMerkit = 'XXXXO' + 'OO' + '-'.repeat(18);
  assert.deepEqual((await tallenna({ laite: 'laite-2', haltija: h2, kortit: [{ nro: 3, merkit: uudenMerkit, versio: VERSIO + 2 }] })).body.tallennetut, [3]);

  // Vanha laite palaa (akku ladattu): sen kortit täydentävät ampumattomat kohteet, uuden laitteen merkinnät jäävät.
  const lokia = taulukko.MOBIILI_LOKI.rivit.length;
  const vanhanMerkit = 'XXXXO' + 'XXXXX' + '-'.repeat(15);
  const vanha = await tallenna({ laite: 'laite-1', haltija: h1, kortit: [
    { nro: 3, merkit: vanhanMerkit, versio: VERSIO + 1 },
    { nro: 4, merkit: MERKIT, versio: VERSIO + 1 }
  ] });
  assert.equal(vanha.statusCode, 409);
  assert.equal(vanha.body.korvattu, true);
  assert.equal(vanha.body.taydennetty, 2);
  // Vanha laite ei kirjoita kortteja: merkinnät välitetään haltijalle TÄYDENNYKSET-sarakkeeseen.
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[3].slice(6, 16).join(''), 'XXXXOOO', 'kiekot 8–10 jäivät tyhjiksi');
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[4], undefined);
  assert.deepEqual(JSON.parse(taulukko.MOBIILI_LAITTEET.rivit[2][9]), { 3: vanhanMerkit, 4: MERKIT });
  assert.equal(vanha.body.kirjattu, 1, 'kortilla 3 eroavia merkintöjä');
  assert.match(taulukko.MOBIILI_LOKI.rivit[lokia][7], /VÄLITETTY RADAN LAITTEELLE, 2 ERI MERKINTÄÄ/);
  assert.equal((await kutsu({ laite: 'laite-1', haltija: h1 })).body.haltija.oma, false);

  // Tyhjä kortti ei ole täydennys; uudempi kortti yhdistyy aiempaan.
  const toinen = await tallenna({ laite: 'laite-1', haltija: h1, kortit: [
    { nro: 3, merkit: '-'.repeat(10) + 'O' + '-'.repeat(14), versio: VERSIO + 4 },
    { nro: 5, merkit: '-'.repeat(25), versio: VERSIO + 4 }
  ] });
  assert.equal(toinen.body.taydennetty, 1);
  assert.equal(JSON.parse(taulukko.MOBIILI_LAITTEET.rivit[2][9])[3], 'XXXXOXXXXXO' + '-'.repeat(14));

  // Haltija saa täydennykset avatessaan ja tallentaessaan; taulukon kortti on edelleen haltijan.
  const avattu = await kutsu({ laite: 'laite-2', haltija: h2 });
  assert.equal(avattu.body.taydennykset[4], MERKIT);
  const tarkistus = await tallenna({ laite: 'laite-2', haltija: h2, kortit: [] });
  assert.equal(tarkistus.statusCode, 200);
  assert.equal(tarkistus.body.taydennykset[4], MERKIT);
  const uusi = await tallenna({ laite: 'laite-2', haltija: h2, kortit: [{ nro: 3, merkit: 'XXXXO' + 'OOXXX' + '-'.repeat(15), versio: VERSIO + 10 }] });
  assert.deepEqual(uusi.body.tallennetut, [3]);
  assert.deepEqual(uusi.body.uudemmat, []);
  assert.equal(uusi.body.taydennykset[3], 'XXXXOXXXXXO' + '-'.repeat(14));
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[3][4], 'laite-2');
});

test('PIN-koodin arvaus lukittuu', async () => {
  alusta();
  await ota('laite-1');
  const oikea = vaihtoPin({ sheetId: ID, sarake: 2, sukupolvi: 1 }, process.env.KIRJAUS_SALAISUUS);
  const vaara = oikea === '1111' ? '2222' : '1111';
  // Rinnakkaiset yritykset lasketaan kaikki.
  const tulokset = await Promise.all(Array.from({ length: 10 }, () => ota('laite-2', { pin: vaara })));
  assert.deepEqual(tulokset.map((r) => r.statusCode), Array(10).fill(403));
  assert.equal(taulukko.MOBIILI_LAITTEET.rivit[2][6], 10);
  const lukittu = await ota('laite-2', { pin: oikea });
  assert.equal(lukittu.statusCode, 423);
  assert.equal(lukittu.body.haltija.lukittu, true);
  // Kilpailutoimisto nollaa virheet (ScoringLib): oikea PIN kelpaa taas.
  taulukko.MOBIILI_LAITTEET.rivit[2][6] = 0;
  assert.match(await ota('laite-2', { pin: oikea }), /^h1\.2\./);
});

test('luovutus ja siirto: seuraava laite ilman PIN-koodia, linjan tila mukana', async () => {
  alusta();
  const h1 = await ota('laite-1');
  const linja = { lisatyt: [{ nro: 9, nimi: 'Lisätty', jalkeen: 3, kierroksesta: 1 }], ohitetut: [4], tauot: [], tauotPois: [], keskeyttaneet: [1], ohjelma: 'SDD', roska: 1 };
  const pelkkaLinja = await tallenna({ laite: 'laite-1', haltija: h1, kortit: [], linja });
  assert.equal(pelkkaLinja.statusCode, 200);

  // Siirtoavain (vanhan laitteen haltija-avain) antaa radan toiselle laitteelle.
  const siirretty = await kutsu({ method: 'POST', toiminto: 'ota', body: { laite: 'laite-2', siirto: h1 } });
  assert.equal(siirretty.statusCode, 200);
  assert.equal(siirretty.body.linja.ohjelma, 'SDD');
  assert.deepEqual(siirretty.body.linja.keskeyttaneet, [1]);
  assert.equal(siirretty.body.linja.roska, undefined);
  const h2 = siirretty.body.haltija;

  // Haltija luovuttaa: rata vapaa, seuraava ottaa sen suoraan.
  assert.equal((await kutsu({ method: 'POST', toiminto: 'vapauta', body: { laite: 'laite-1', haltija: h1 } })).statusCode, 409);
  const vapautettu = await kutsu({ method: 'POST', toiminto: 'vapauta', body: { laite: 'laite-2', haltija: h2, linja: { ...linja, ohitetut: [4, 5] } } });
  assert.equal(vapautettu.statusCode, 200);
  assert.equal((await kutsu({ laite: 'laite-3' })).body.haltija.vapaa, true);
  const kolmas = await kutsu({ method: 'POST', toiminto: 'ota', body: { laite: 'laite-3' } });
  assert.equal(kolmas.statusCode, 200);
  assert.deepEqual(kolmas.body.linja.ohitetut, [4, 5]);
  assert.equal(kolmas.body.tila.oma, true);
  // Sama laite saa avaimensa uudelleen (esim. radan tiedot tyhjennetty laitteelta).
  const sama = await kutsu({ method: 'POST', toiminto: 'ota', body: { laite: 'laite-3' } });
  assert.equal(sama.body.haltija, kolmas.body.haltija);
});

test('vanha 7-sarakkeinen loki levennetään', async () => {
  alusta();
  taulukko.MOBIILI_LOKI = { id: 78, rivit: [['AIKA', 'RATA', 'NRO', 'LAITE', 'VERSIO', 'ENNEN', 'JÄLKEEN']], sarakkeita: 7 };
  const h1 = await ota('laite-1');
  assert.match(h1, /^h1\./);
  assert.equal(taulukko.MOBIILI_LOKI.sarakkeita, 8);
  assert.equal(taulukko.MOBIILI_LOKI.rivit[0][7], 'HUOM');
});

test('tallenna: toinen laite ehti luoda välilehdet', async () => {
  alusta();
  await kutsu();
  taulukko['MOBIILI Rata 2'] = { id: 77, rivit: [['NRO']] };
  taulukko.MOBIILI_LOKI = { id: 78, rivit: [['AIKA']] };
  const h1 = await ota('laite-1');
  const res = await tallenna({ laite: 'laite-1', haltija: h1, kortit: [{ nro: 1, merkit: MERKIT, versio: 5 }] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.tallennetut, [1]);
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[1][0], 1);
});

test('tallenna: toinen rata ehti luoda yhteisen lokin', async () => {
  alusta();
  await kutsu();
  taulukko.MOBIILI_LOKI = { id: 78, rivit: [['AIKA']] };
  const h1 = await ota('laite-1');
  const res = await tallenna({ laite: 'laite-1', haltija: h1, kortit: [{ nro: 1, merkit: MERKIT, versio: 5 }] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.tallennetut, [1]);
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[0][0], 'NRO');
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[1][0], 1);
});

test('tallenna: välilehti poistettiin taulukosta, luodaan uudelleen', async () => {
  alusta();
  const h1 = await ota('laite-1');
  const body = (nro) => ({ laite: 'laite-1', haltija: h1, kortit: [{ nro, merkit: MERKIT, versio: 5 }] });
  assert.equal((await tallenna(body(1))).statusCode, 200);
  delete taulukko['MOBIILI Rata 2'];
  const res = await tallenna(body(2));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.tallennetut, [2]);
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[2][0], 2);
});

test('avaa: toisen laitteen tallentamat kortit, vaikka välilehteä ei ollut muistissa', async () => {
  alusta();
  await kutsu({ laite: 'laite-2' });
  // Toinen palvelinilmentymä loi välilehden ja tallensi kortin; tämän muisti ei tiedä siitä.
  taulukko['MOBIILI Rata 2'] = { id: 77, rivit: [['NRO'], [3, 'Cederberg C', 4, '19.10.2026 klo 20.30.00', 'laite-1', VERSIO, 'X', 'X', 'X', 'X', 'O']] };
  const res = await kutsu({ laite: 'laite-2' });
  assert.deepEqual(res.body.kortit, [{ nro: 3, merkit: MERKIT, versio: VERSIO }]);
  assert.equal(res.body.haltija.vapaa, true);

  // Välilehti poistettiin: avaus ei kaadu.
  delete taulukko['MOBIILI Rata 2'];
  const poistettu = await kutsu({ laite: 'laite-2' });
  assert.equal(poistettu.statusCode, 200);
  assert.deepEqual(poistettu.body.kortit, []);
});

test('tallenna torjuu virheellisen rungon', async () => {
  alusta();
  const res = await tallenna({ laite: 'laite-1', kortit: [{ nro: 3, merkit: 'XX', versio: 1 }] });
  assert.equal(res.statusCode, 400);
  assert.equal((await tallenna({ laite: 'laite-1', haltija: 'x', kortit: [], linja: 'roskaa' })).statusCode, 400);
});

// --- Ryhmäpuhelin ---

const ryhmaAvain = (ryhma = 2) => luoAvain({ sheetId: ID, ryhma, voimassaAsti: Math.floor(Date.now() / 1000) + 3600 }, process.env.KIRJAUS_SALAISUUS);

function alustaRyhma() {
  alusta();
  taulukko = {
    KISANSPEKSIT: { id: 1, rivit: [
      ['RATA1_NIMI', 'Metsä'], ['RATA2_NIMI', 'Järvi'], ['LAYOUT/KISA', 4], ['AIKATAULURYHMAKOKO', 3],
      ['', '', '', 'Asema', 'Maks'], ['', '', '', '1', 10], ['', '', '', '2', 15], ['', '', '', '3', 12], ['', '', '', '4', 13]
    ] },
    'OSALLISTUJAT+TULOKSET': { id: 2, rivit: [
      ['NRO', 'Ryhmä', 'NIMI'], [1, 1, 'Aalto A'], [2, 1, 'Berg B'], [3, 1, 'Ek E'], [4, 2, 'Dahl D'], [5, 2, 'Fors F'], [6, 2, '6']
    ] },
    Aikataulu: { id: 3, rivit: [['Lauantai'], ['Start', 'Järvi', 'Metsä'], ['09:00', 'Ryhmä 1', 'Ryhmä 2'], ['09:30', 'Ryhmä 2', 'Ryhmä 1']] }
  };
}

const ryhmaKutsu = (opts) => kutsu({ token: ryhmaAvain(), ...opts });
async function otaRyhma(laite = 'puhelin-1', lisa = {}) {
  const res = await ryhmaKutsu({ method: 'POST', toiminto: 'ota', body: { laite, nimi: `Testi ${laite}`, ...lisa } });
  return res.statusCode === 200 ? res.body.haltija : res;
}
const tallennaRyhma = (body) => ryhmaKutsu({ method: 'POST', toiminto: 'tallenna', body });
const RYHMA_MERKIT = 'XXOXXXXXXO' + 'X'.repeat(15);

test('ryhmä: avaus antaa ryhmän ampujat, layoutit asemineen ja vuorot', async () => {
  alustaRyhma();
  const res = await ryhmaKutsu({ laite: 'puhelin-1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ryhma, 2);
  assert.deepEqual(res.body.ampujat, [{ nro: 4, nimi: 'Dahl D' }, { nro: 5, nimi: 'Fors F' }]);
  assert.deepEqual(res.body.layoutit.map((l) => [l.nro, l.nimi, l.kohteita, l.kierros, l.aika]), [[1, 'Metsä', 25, 0, '09:00'], [2, 'Järvi', 25, 1, '09:30']]);
  assert.deepEqual(res.body.layoutit[1].asemat, [{ sarake: 3, id: '3', kohteita: 12 }, { sarake: 4, id: '4', kohteita: 13 }]);
  assert.deepEqual(res.body.kortit, []);
  assert.equal(res.body.haltija.vapaa, true);
});

test('ryhmä: tallennus kirjoittaa vain ryhmän kortit; hyväksyntä ja asemien tulokset riville', async () => {
  alustaRyhma();
  const h = await otaRyhma();
  assert.match(h, /^h1\.1\./);
  assert.equal(taulukko.MOBIILI_RYHMAT.rivit[2][2], 'puhelin-1');
  assert.equal(taulukko.MOBIILI_RYHMAT.rivit[0][0], 'RYHMÄ');

  const res = await tallennaRyhma({ laite: 'puhelin-1', haltija: h, kortit: [
    { layout: 1, nro: 4, merkit: RYHMA_MERKIT, versio: VERSIO, hyvaksytty: Date.UTC(2026, 9, 27, 10) },
    { layout: 1, nro: 1, merkit: RYHMA_MERKIT, versio: VERSIO },
    { layout: 2, nro: 5, merkit: 'X', versio: VERSIO },
    { layout: 3, nro: 5, merkit: 'X', versio: VERSIO },
    { layout: 1, nro: 5, merkit: RYHMA_MERKIT, versio: VERSIO, jako: '8,17' }
  ] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.tallennetut, [{ layout: 1, nro: 4 }]);
  assert.deepEqual(res.body.hylatyt, [
    { layout: 1, nro: 1, syy: 'ryhma' }, { layout: 2, nro: 5, syy: 'kohteet' }, { layout: 3, nro: 5, syy: 'layout' }, { layout: 1, nro: 5, syy: 'kohteet' }
  ]);
  const tab = taulukko['MOBIILI Layout 1'].rivit;
  assert.deepEqual(tab[0].slice(6, 11), ['RYHMÄ', 'HYVÄKSYTTY', 'ASEMA 1', 'ASEMA 2', '1/1']);
  assert.deepEqual(tab[4].slice(0, 3), [4, 'Dahl D', 23]);
  assert.equal(tab[4][6], 2);
  assert.match(tab[4][7], /27\.10\.2026/);
  assert.deepEqual(tab[4].slice(8, 10), [8, 15]);
  assert.equal(tab[1], undefined, 'toisen ryhmän ampujaa ei kirjoiteta');
  const loki = taulukko.MOBIILI_LOKI.rivit;
  assert.ok(loki.some((r) => r[1] === 'Layout 1' && r[2] === 4 && /HYVÄKSYTTY/.test(r[7])));
  assert.ok(loki.some((r) => r[2] === 1 && /EI RYHMÄSSÄ 2/.test(r[7])));
  assert.ok(loki.some((r) => r[1] === 'Layout 3' && /LAYOUT EI KISASSA/.test(r[7])));

  // Välilehdet ovat jo olemassa: yksi luku ja yksi kirjoitus.
  lukuja = 0;
  kirjoitukset = 0;
  const toinen = await tallennaRyhma({ laite: 'puhelin-1', haltija: h, kortit: [{ layout: 1, nro: 5, merkit: '-'.repeat(25).replace(/^-/, 'X'), versio: VERSIO }] });
  assert.deepEqual(toinen.body.tallennetut, [{ layout: 1, nro: 5 }]);
  assert.equal(lukuja, 1);
  assert.equal(kirjoitukset, 1);

  // Hyväksyntä taulukosta (true), mutta rivillä ei ole hyväksyntää: uutta aikaa ei keksitä.
  const kolmas = await tallennaRyhma({ laite: 'puhelin-1', haltija: h, kortit: [{ layout: 1, nro: 5, merkit: RYHMA_MERKIT, versio: VERSIO + 1, hyvaksytty: true, jako: '10,15' }] });
  assert.deepEqual(kolmas.body.tallennetut, [{ layout: 1, nro: 5 }]);
  assert.equal(taulukko['MOBIILI Layout 1'].rivit[5][7], '');

  const avattu = await ryhmaKutsu({ laite: 'puhelin-1', haltija: h });
  assert.deepEqual(avattu.body.kortit.find((k) => k.nro === 4), { layout: 1, nro: 4, merkit: RYHMA_MERKIT, versio: VERSIO, kuitatut: [], hyvaksytty: true });
  assert.equal(avattu.body.haltija.oma, true);
});

test('ryhmä: toinen puhelin ottaa ryhmän PIN-koodilla, korvatun merkinnät täydennyksiksi', async () => {
  alustaRyhma();
  const h1 = await otaRyhma('puhelin-1');
  await tallennaRyhma({ laite: 'puhelin-1', haltija: h1, kortit: [{ layout: 1, nro: 4, merkit: 'XX' + '-'.repeat(23), versio: VERSIO }] });

  const varattu = await otaRyhma('puhelin-2');
  assert.equal(varattu.statusCode, 409);
  assert.match(varattu.body.error, /toinen puhelin/);
  // Pelkkä vahvistus ei enää riitä; ryhmän PIN lasketaan tunnuksella r<ryhmä>, ei radan sarakkeella.
  assert.equal((await otaRyhma('puhelin-2', { vahvista: true })).statusCode, 409);
  const ryhmanPin = vaihtoPin({ sheetId: ID, sarake: 'r2', sukupolvi: 1 }, process.env.KIRJAUS_SALAISUUS);
  const vaara = ryhmanPin === '0000' ? '0001' : '0000';
  assert.equal((await otaRyhma('puhelin-2', { pin: vaara })).statusCode, 403);
  assert.equal(taulukko.MOBIILI_RYHMAT.rivit[2][6], 1, 'väärä PIN lasketaan');

  const h2 = await otaRyhma('puhelin-2', { pin: ryhmanPin });
  assert.match(h2, /^h1\.2\./);
  assert.match(taulukko.MOBIILI_LOKI.rivit.at(-1)[7], /RYHMÄ OTETTU: kilpailutoimiston PIN-koodi/);

  const vanha = await tallennaRyhma({ laite: 'puhelin-1', haltija: h1, kortit: [
    { layout: 1, nro: 4, merkit: 'XXOX' + '-'.repeat(21), versio: VERSIO + 5 },
    { layout: 1, nro: 1, merkit: 'X' + '-'.repeat(24), versio: VERSIO }
  ] });
  assert.equal(vanha.statusCode, 409);
  assert.equal(vanha.body.korvattu, true);
  assert.equal(vanha.body.taydennetty, 1);
  assert.deepEqual(JSON.parse(taulukko.MOBIILI_RYHMAT.rivit[2][9]), { '1:4': 'XXOX' + '-'.repeat(21) });
  assert.equal(taulukko['MOBIILI Layout 1'].rivit[4][5], VERSIO, 'korvattu ei kirjoita korttia');
  assert.ok(taulukko.MOBIILI_LOKI.rivit.some((r) => r[2] === 1 && /EI RYHMÄSSÄ 2/.test(r[7])), 'korvatun ryhmään kuulumaton lokiin');

  const avattu = await ryhmaKutsu({ laite: 'puhelin-2', haltija: h2 });
  assert.deepEqual(avattu.body.taydennykset, { '1:4': 'XXOX' + '-'.repeat(21) });

  // Vanha avain ei enää vapauta ryhmää.
  assert.equal((await ryhmaKutsu({ method: 'POST', toiminto: 'vapauta', body: { laite: 'puhelin-2', haltija: h1 } })).statusCode, 409);
  assert.equal((await ryhmaKutsu({ method: 'POST', toiminto: 'vapauta', body: { laite: 'puhelin-2', haltija: h2 } })).statusCode, 200);
  assert.equal(taulukko.MOBIILI_RYHMAT.rivit[2][2], '');
});

// --- Suora tulos (MOBIILI_TULOKSET = SUORAAN) ---

test('suora tulos: valmis Compak-kortti tyhjään tulossoluun, korjaus seuraa, paperin tulos jää', async () => {
  alusta();
  taulukko.KISANSPEKSIT.rivit.push(['MOBIILI_TULOKSET', 'Suoraan']);
  taulukko['OSALLISTUJAT+TULOKSET'] = { id: 9, rivit: [
    ['NRO', 'SARJA', 'NIMI', 1, 2, 'TULOS YHT.'], [1, 'Y', 'Aaltonen A', 20, '', 20], [3, 'Y', 'Cederberg C', '', '', 0],
    [4, 'Y', 'Dahl D', '', 21, 21]
  ] };
  const h = await ota('laite-1');
  const valmis = 'XXXXO'.repeat(5);

  // Keskeneräinen kortti: pääsivua ei lueta eikä kirjoiteta.
  lukuja = 0;
  await tallenna({ laite: 'laite-1', haltija: h, kortit: [{ nro: 3, merkit: MERKIT, versio: VERSIO }] });
  assert.equal(lukuja, 1);
  assert.equal(taulukko['OSALLISTUJAT+TULOKSET'].rivit[2][4], '');

  lukuja = 0;
  kirjoitukset = 0;
  const res = await tallenna({ laite: 'laite-1', haltija: h, kortit: [
    { nro: 3, merkit: valmis, versio: VERSIO + 1 }, { nro: 4, merkit: valmis, versio: VERSIO }
  ] });
  assert.equal(res.statusCode, 200);
  assert.equal(kirjoitukset, 1, 'kortit, tulos ja loki yhdellä kirjoituksella');
  assert.equal(lukuja, 2, 'kortit ja pääsivu soluina');
  const paa = taulukko['OSALLISTUJAT+TULOKSET'].rivit;
  assert.equal(paa[2][4], 20);
  assert.equal(paa[3][4], 21, 'paperilta kirjoitettu tulos jää');
  const loki = taulukko.MOBIILI_LOKI.rivit;
  assert.equal(loki.at(-2)[7], 'TULOS 20 SARAKKEESEEN 2');
  assert.equal(loki.at(-1)[7], 'TULOS 20 EI KIRJOITETTU: SARAKKEESSA 2 ON 21');

  // Korjattu kortti: solussa on mobiilin oma edellinen tulos, joten se päivittyy.
  await tallenna({ laite: 'laite-1', haltija: h, kortit: [{ nro: 3, merkit: 'X'.repeat(25), versio: VERSIO + 2 }] });
  assert.equal(paa[2][4], 25);
  assert.equal(taulukko.MOBIILI_LOKI.rivit.at(-1)[7], 'TULOS 20 → 25 SARAKKEESEEN 2');

  // Paperilta sama tulos: ei kirjoiteta eikä huomauteta; kaavaa ei korvata.
  paa[2][4] = 24;
  await tallenna({ laite: 'laite-1', haltija: h, kortit: [{ nro: 3, merkit: 'X'.repeat(24) + 'O', versio: VERSIO + 3 }] });
  assert.equal(paa[2][4], 24);
  assert.equal(taulukko.MOBIILI_LOKI.rivit.at(-1)[7], '');
  paa[2][4] = { kaava: '=SUM(24)', arvo: 24 };
  await tallenna({ laite: 'laite-1', haltija: h, kortit: [{ nro: 3, merkit: 'X'.repeat(23) + 'OO', versio: VERSIO + 4 }] });
  assert.deepEqual(paa[2][4], { kaava: '=SUM(24)', arvo: 24 });
  assert.equal(taulukko.MOBIILI_LOKI.rivit.at(-1)[7], 'TULOS 23 EI KIRJOITETTU: SARAKKEESSA 2 ON KAAVA');

  // Sama tulos uudelleen (merkinnät vaihtuivat): pääsivua ei lueta.
  lukuja = 0;
  await tallenna({ laite: 'laite-1', haltija: h, kortit: [{ nro: 3, merkit: 'OX' + 'X'.repeat(21) + 'OX', versio: VERSIO + 5 }] });
  assert.equal(lukuja, 1);

  // Taulukkokaavan täyttämä sarake: tyhjäänkään soluun ei kirjoiteta.
  paa[1][3] = { kaava: '=ARRAYFORMULA(1)', arvo: 20 };
  paa[2][3] = '';
  paa[3][3] = { taytetty: 7 };
  taulukko['MOBIILI Rata 1'] = { id: 30, rivit: [] };
  const rata1 = await kutsu({ method: 'POST', toiminto: 'ota', token: avain(1), body: { laite: 'laite-1', nimi: 'x' } });
  await kutsu({ method: 'POST', toiminto: 'tallenna', token: avain(1), body: { laite: 'laite-1', haltija: rata1.body.haltija, kortit: [{ nro: 3, merkit: valmis, versio: VERSIO }] } });
  assert.equal(paa[2][3], '');
  assert.equal(taulukko.MOBIILI_LOKI.rivit.at(-1)[7], 'TULOS 20 EI KIRJOITETTU: SARAKKEESSA 1 ON KAAVA');
});

test('suora tulos: suojattu pääsivu ei estä kortin tallennusta', async () => {
  alusta();
  taulukko.KISANSPEKSIT.rivit.push(['MOBIILI_TULOKSET', 'SUORAAN']);
  taulukko['OSALLISTUJAT+TULOKSET'] = { id: 9, rivit: [['NRO', 'NIMI', 'X', 1, 2], [3, 'Cederberg C', '', '', '']] };
  suojattuPaa = true;
  const h = await ota('laite-1');
  const res = await tallenna({ laite: 'laite-1', haltija: h, kortit: [{ nro: 3, merkit: 'X'.repeat(25), versio: VERSIO }] });
  assert.equal(res.statusCode, 200);
  assert.equal(taulukko['MOBIILI Rata 2'].rivit[3][2], 25);
  assert.equal(taulukko['OSALLISTUJAT+TULOKSET'].rivit[1][4], '');
  assert.equal(taulukko.MOBIILI_LOKI.rivit.at(-1)[7], 'TULOS 25 SARAKKEESEEN 2 EPÄONNISTUI (PÄÄSIVU SUOJATTU)');
});

test('suora tulos: TOIMISTO (oletus) ei kirjoita pääsivulle', async () => {
  alusta();
  taulukko['OSALLISTUJAT+TULOKSET'] = { id: 9, rivit: [['NRO', 'NIMI', 'X', 1, 2], [3, 'Cederberg C', '', '', '']] };
  const h = await ota('laite-1');
  lukuja = 0;
  await tallenna({ laite: 'laite-1', haltija: h, kortit: [{ nro: 3, merkit: 'X'.repeat(25), versio: VERSIO }] });
  assert.equal(lukuja, 1);
  assert.equal(taulukko['OSALLISTUJAT+TULOKSET'].rivit[1][4], '');
});

test('suora tulos: ryhmäkortin kuitattu ja valmis asema omaan tulossarakkeeseensa', async () => {
  alustaRyhma();
  taulukko.KISANSPEKSIT.rivit.push(['MOBIILI_TULOKSET', 'SUORAAN']);
  taulukko['OSALLISTUJAT+TULOKSET'].rivit = [
    ['NRO', 'Ryhmä', 'NIMI', 1, 2, 3, 4], [4, 2, 'Dahl D', '', '', '', ''], [5, 2, 'Fors F', '', '', '', '']
  ];
  const h = await otaRyhma();
  const res = await tallennaRyhma({ laite: 'puhelin-1', haltija: h, kortit: [
    // Asema 1 kuitattu ja valmis, asema 2 kesken.
    { layout: 1, nro: 4, merkit: 'XXOXXXXXXO' + 'X'.repeat(14) + '-', versio: VERSIO, kuitatut: ['1'] },
    // Valmis mutta kuittaamatta: ei tulosta.
    { layout: 1, nro: 5, merkit: RYHMA_MERKIT, versio: VERSIO }
  ] });
  assert.equal(res.statusCode, 200);
  const paa = taulukko['OSALLISTUJAT+TULOKSET'].rivit;
  assert.deepEqual(paa[1].slice(3), [8, '', '', '']);
  assert.deepEqual(paa[2].slice(3), ['', '', '', '']);
  assert.match(taulukko.MOBIILI_LOKI.rivit.find((r) => r[2] === 4 && r[1] === 'Layout 1')[7], /^RYHMÄ 2, TULOS 8 SARAKKEESEEN 1$/);

  // Koko kortti hyväksytty: molemmat asemat.
  await tallennaRyhma({ laite: 'puhelin-1', haltija: h, kortit: [
    { layout: 1, nro: 5, merkit: RYHMA_MERKIT, versio: VERSIO + 1, hyvaksytty: Date.UTC(2026, 9, 27, 10), kuitatut: ['1', '2'] }
  ] });
  assert.deepEqual(paa[2].slice(3), [8, 15, '', '']);
  assert.match(taulukko.MOBIILI_LOKI.rivit.at(-1)[7], /^RYHMÄ 2, HYVÄKSYTTY, TULOS 8 SARAKKEESEEN 1, TULOS 15 SARAKKEESEEN 2$/);

  // Korjaus poistaa kuittauksen: mobiilin oma tulos poistuu, kunnes ampuja kuittaa uudelleen.
  await tallennaRyhma({ laite: 'puhelin-1', haltija: h, kortit: [
    { layout: 1, nro: 5, merkit: 'X'.repeat(25), versio: VERSIO + 2, kuitatut: ['2'] }
  ] });
  assert.deepEqual(paa[2].slice(3, 5), ['', 15]);
});
