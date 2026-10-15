import test from 'node:test';
import assert from 'node:assert/strict';

import {
  jarjestaAmpujat,
  laskeRataTilastot,
  laskeTaulukkoAsettelu,
  laskeTulosteTaulukonKoko,
  muodostaTulosteRatko,
  onkoAliTulosPuuttuu,
  parsiTaulukkoAmpujat,
  tunnistaPaivaSarakeNimet
} from './henkiloTaulukko.js';

const HENKILOT = [
  ['Sija', 'Nimi', 'Sarja', 'Seura', 'La', 'Su', 'Tulos', '1', '2', '3', 'Ratko', ''],
  ['1', 'Matti Meikäläinen', 'Y', 'Seura A', '50', '48', '98', '25', '24', '24', '', ''],
  ['2', 'Liisa Virtanen', 'N', 'Seura B', '49', '', '49', '25', '-', '', 'DNF', ''],
  ['', '', '', '', '', '', '', '', '', '', '', '']
];

test('parsiTaulukkoAmpujat lukee sarakkeet otsikoiden perusteella', () => {
  const ampujat = parsiTaulukkoAmpujat(HENKILOT, 3);

  assert.equal(ampujat.length, 2);
  assert.deepEqual(ampujat[0], {
    id: 'Matti Meikäläinen|1',
    nimi: 'Matti Meikäläinen',
    sarja: 'Y',
    seura: 'Seura A',
    la: '50',
    su: '48',
    tulos: '98',
    kokonaistulos: '98',
    ratko: '',
    ratko2: '',
    ratkoNaytto: { statusEtiketit: [], teksti: '' },
    erat: { 1: '25', 2: '24', 3: '24' }
  });
  assert.deepEqual(ampujat[1].erat, { 1: '25', 2: '-', 3: '' });
  assert.equal(ampujat[1].su, '');
  assert.deepEqual(ampujat[1].ratkoNaytto.statusEtiketit, ['DNF']);
});

test('parsiTaulukkoAmpujat: ilman päiväsarakkeita la/su ovat null', () => {
  const ampujat = parsiTaulukkoAmpujat([
    ['Nimi', 'Sarja', 'Seura', 'Tulos', '1', '2'],
    ['Pekka', 'Y', 'Seura C', '47', '23', '24']
  ], 2);

  assert.equal(ampujat[0].la, null);
  assert.equal(ampujat[0].su, null);
  assert.equal(ampujat[0].tulos, '47');
  assert.deepEqual(ampujat[0].erat, { 1: '23', 2: '24' });
});

test('parsiTaulukkoAmpujat palauttaa tyhjän listan ilman datarivejä', () => {
  assert.deepEqual(parsiTaulukkoAmpujat([HENKILOT[0]], 3), []);
  assert.deepEqual(parsiTaulukkoAmpujat(null, 3), []);
});

test('tunnistaPaivaSarakeNimet käyttää AP/IP-otsikoita kun ne löytyvät', () => {
  assert.deepEqual(tunnistaPaivaSarakeNimet(HENKILOT, 'fi'), { laLabel: 'La', suLabel: 'Su' });
  assert.deepEqual(tunnistaPaivaSarakeNimet(HENKILOT, 'en'), { laLabel: 'Sat', suLabel: 'Sun' });
  assert.deepEqual(tunnistaPaivaSarakeNimet([['Nimi', 'AP', 'IP']], 'fi'), { laLabel: 'AP', suLabel: 'IP' });
  assert.deepEqual(tunnistaPaivaSarakeNimet([['Nimi', 'Aamupäivä', 'Iltapäivä']], 'en'), { laLabel: 'AP', suLabel: 'IP' });
  assert.deepEqual(tunnistaPaivaSarakeNimet(null, 'fi'), { laLabel: 'La', suLabel: 'Su' });
});

test('jarjestaAmpujat järjestää numerot numeroina ja tekstit suomeksi', () => {
  const ampujat = [
    { nimi: 'Öljynen', laskettuSija: 2, tulos: '90', erat: { 1: '20' } },
    { nimi: 'Aalto', laskettuSija: 1, tulos: '95', erat: { 1: '-' } },
    { nimi: 'Ärjä', laskettuSija: '', tulos: '80', erat: { 1: '25' } }
  ];

  assert.deepEqual(jarjestaAmpujat(ampujat, 'sija', 'asc').map((a) => a.nimi), ['Ärjä', 'Aalto', 'Öljynen']);
  assert.deepEqual(jarjestaAmpujat(ampujat, 'tulos', 'desc').map((a) => a.nimi), ['Aalto', 'Öljynen', 'Ärjä']);
  assert.deepEqual(jarjestaAmpujat(ampujat, 'nimi', 'asc').map((a) => a.nimi), ['Aalto', 'Ärjä', 'Öljynen']);
  assert.deepEqual(jarjestaAmpujat(ampujat, 'era-1', 'desc').map((a) => a.nimi), ['Ärjä', 'Öljynen', 'Aalto']);
  assert.equal(ampujat[0].nimi, 'Öljynen');
});

test('laskeRataTilastot laskee keskiarvon, mediaanin ja maksimiosuuden', () => {
  const ampujat = [
    { erat: { 1: '25', 2: '20' } },
    { erat: { 1: '24', 2: '-' } },
    { erat: { 1: '25', 2: '22' } },
    { erat: { 1: 'N/A', 2: '' } }
  ];

  const [rata1, rata2] = laskeRataTilastot(ampujat, [1, 2], { 1: 25, 2: 25 });
  assert.deepEqual(rata1, { rataNumero: 1, count: 3, avg: 74 / 3, median: 25, maxPct: (2 / 3) * 100 });
  assert.deepEqual(rata2, { rataNumero: 2, count: 2, avg: 21, median: 21, maxPct: 0 });

  const [tyhja] = laskeRataTilastot([], [1], {});
  assert.deepEqual(tyhja, { rataNumero: 1, count: 0, avg: null, median: null, maxPct: null });
});

test('onkoAliTulosPuuttuu tunnistaa tyhjät ja viivat', () => {
  for (const arvo of ['', ' ', '-', '—', 'n/a', null, undefined]) {
    assert.equal(onkoAliTulosPuuttuu(arvo), true, String(arvo));
  }
  assert.equal(onkoAliTulosPuuttuu('0'), false);
  assert.equal(onkoAliTulosPuuttuu(24), false);
});

test('laskeTaulukkoAsettelu: mittaamaton leveys antaa väljän asettelun', () => {
  const asettelu = laskeTaulukkoAsettelu({ leveys: 0, ratojenMaara: 8, onkoSarja: true, paivienMaara: 2 });
  assert.equal(asettelu.taso, 'desktop');
  assert.equal(asettelu.mahtuu, true);
  assert.equal(asettelu.piilotettuja, false);
  assert.equal(asettelu.leveydet.rata, 30);
});

test('laskeTaulukkoAsettelu: leveällä näytöllä radat levenevät enintään kattoon', () => {
  const vahan = laskeTaulukkoAsettelu({ leveys: 1280, ratojenMaara: 6, naytaRatko: true, onkoSarja: true, paivienMaara: 2 });
  assert.equal(vahan.taso, 'desktop');
  assert.equal(vahan.leveydet.rata, 40);

  const compak = laskeTaulukkoAsettelu({ leveys: 1440, ratojenMaara: 24, naytaRatko: true, onkoSarja: true, paivienMaara: 2 });
  assert.equal(compak.taso, 'desktop');
  assert.equal(compak.leveydet.rata, 35);
  assert.equal(compak.mahtuu, true);
});

test('laskeTaulukkoAsettelu: kapeammalla ensin kavennetaan, sitten pudotetaan sarakkeita', () => {
  const lappari = laskeTaulukkoAsettelu({ leveys: 1280, ratojenMaara: 24, naytaRatko: true, onkoSarja: true, paivienMaara: 2 });
  assert.equal(lappari.taso, 'desktop');
  assert.deepEqual(lappari.sarakkeet, { sarja: true, seura: false, paivat: true });

  const eiSeuroja = laskeTaulukkoAsettelu({ leveys: 1024, ratojenMaara: 24, naytaRatko: true, onkoSeura: false });
  assert.equal(eiSeuroja.piilotettuja, false);

  const tabletti = laskeTaulukkoAsettelu({ leveys: 1024, ratojenMaara: 24, naytaRatko: true, onkoSarja: true, paivienMaara: 2 });
  assert.equal(tabletti.taso, 'mobile');
  assert.deepEqual(tabletti.sarakkeet, { sarja: true, seura: true, paivat: true });

  const pieniKisa = laskeTaulukkoAsettelu({ leveys: 390, ratojenMaara: 5, onkoSarja: true });
  assert.equal(pieniKisa.taso, 'mobile');
  assert.deepEqual(pieniKisa.sarakkeet, { sarja: true, seura: false, paivat: false });
  assert.equal(pieniKisa.lyhennaNimet, false);

  const puhelin = laskeTaulukkoAsettelu({ leveys: 390, ratojenMaara: 8, naytaRatko: true, onkoSarja: true, paivienMaara: 2 });
  assert.equal(puhelin.taso, 'compact');
  assert.deepEqual(puhelin.sarakkeet, { sarja: false, seura: false, paivat: false });
  assert.equal(puhelin.lyhennaNimet, true);
  assert.equal(puhelin.piilotettuja, true);
  assert.equal(puhelin.mahtuu, true);
  assert.equal(puhelin.leveydet.rata, 26);
});

test('laskeTaulukkoAsettelu: jos mikään ei mahdu, tiivein asettelu ja vieritys', () => {
  const asettelu = laskeTaulukkoAsettelu({ leveys: 390, ratojenMaara: 24, naytaRatko: true, onkoSarja: true });
  assert.equal(asettelu.taso, 'compact');
  assert.equal(asettelu.mahtuu, false);
  assert.equal(asettelu.leveydet.rata, 18);
});

test('laskeTaulukkoAsettelu: kaikki sarakkeet -tilassa mitään ei piiloteta', () => {
  const asettelu = laskeTaulukkoAsettelu({
    leveys: 390, ratojenMaara: 8, naytaRatko: true, onkoSarja: true, paivienMaara: 2, kaikkiSarakkeet: true
  });
  assert.equal(asettelu.taso, 'compact');
  assert.deepEqual(asettelu.sarakkeet, { sarja: true, seura: true, paivat: true });
  assert.equal(asettelu.piilotettuja, false);
  assert.equal(asettelu.mahtuu, false);
});

test('laskeTaulukkoAsettelu: Seura on pisimmän seuran levyinen, enintään tason maksimi', () => {
  const lyhyet = laskeTaulukkoAsettelu({ leveys: 1280, ratojenMaara: 6, seuraMerkit: 4 });
  assert.equal(lyhyet.leveydet.seura, 55);

  const pitkat = laskeTaulukkoAsettelu({ leveys: 1280, ratojenMaara: 6, seuraMerkit: 35 });
  assert.equal(pitkat.leveydet.seura, 140);

  const mobiili = laskeTaulukkoAsettelu({ leveys: 1024, ratojenMaara: 24, naytaRatko: true, onkoSarja: true, paivienMaara: 2, seuraMerkit: 10 });
  assert.equal(mobiili.taso, 'mobile');
  assert.equal(mobiili.leveydet.seura, 70);

  const trapp = laskeTaulukkoAsettelu({ leveys: 1024, ratojenMaara: 24, naytaRatko: true, onkoSarja: true, paivienMaara: 2, seuraMerkit: 8 });
  assert.equal(trapp.leveydet.seura, 69);
});

test('laskeTulosteTaulukonKoko: pysty 8 rataan asti, vaaka sen yli ja tiivis yli 16 radalla', () => {
  assert.deepEqual(laskeTulosteTaulukonKoko(8), { vaaka: false, tiivis: false });
  assert.deepEqual(laskeTulosteTaulukonKoko(9), { vaaka: true, tiivis: false });
  assert.deepEqual(laskeTulosteTaulukonKoko(16), { vaaka: true, tiivis: false });
  assert.deepEqual(laskeTulosteTaulukonKoko(24), { vaaka: true, tiivis: true });
});

test('muodostaTulosteRatko näyttää statuksen aina ja ratkon vain tasatuloksen ampujalle', () => {
  const tasa = { id: 'a', ratkoNaytto: { statusEtiketit: [], teksti: '24' } };
  const status = { id: 'b', ratkoNaytto: { statusEtiketit: ['DNF'], teksti: '' } };
  assert.equal(muodostaTulosteRatko(tasa, new Set(['a'])), '24');
  assert.equal(muodostaTulosteRatko(tasa, new Set()), '');
  assert.equal(muodostaTulosteRatko(status, new Set()), 'DNF');
});
