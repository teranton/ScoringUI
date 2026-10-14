#!/usr/bin/env node
// Mittaa ScoringUI:n kisojen avausajat eri välimuistitasoilla.
// Käyttö:  npm run mittaa -- https://<scoringui-osoite> [--paattyneita 4] [--kylma]
//          npm run mittaa -- http://localhost:3000          (vercel dev)
// Kisat valitaan rekisteristä (/api/rekisteri): käynnissä olevat, tulossa olevista 2 lähintä ja
// päättyneistä uusimmat (oletus 4). Jokaiselle kisalle tehdään peräkkäin:
//   1 avaus     sama URL kuin sovellus käyttää: mitä kävijä saa juuri nyt (CDN osuma tai ohitus)
//   2 toisto    sama URL heti uudelleen: pitäisi tulla CDN:stä
//   3 ohi CDN   URL + satunnainen parametri: funktio vastaa (palvelimen välimuisti, Blob-kuva tai Google)
//   4 kylmä     vain --kylma: välilehtijoukko, jota ei ole välimuistissa, joten haku menee Googleen.
//               Päättyneelle kisalle käytetään live-välilehtiä (kylmä vain ensimmäisellä ajokerralla,
//               tallentaa niistä Blob-kuvan); muille satunnainen välilehtipari, jota sovellus ei pyydä.
//          npm run tarkista -- https://<scoringui-osoite>
//   --tarkista  lukeeko palvelutili jokaisen rekisterin kisan Googlesta (myös piilotetut). Jokaiselle kisalle pyydetään
//               välilehtipari, jota sovellus ei koskaan pyydä, joten välimuistissa ei ole mitään ja vastaus tulee
//               Googlesta (lähde google) tai on virhe (esim. 502, kun taulukkoa ei ole jaettu palvelutilille).
//               Pari vaihtuu ajokerrasta toiseen, koska ensimmäinen ajo jättää vastauksen välimuistiin.
// Päivien tulkinta ja välilehtilista tulevat API:n omista moduuleista. Ei npm-riippuvuuksia (Node 18+).

import { parseCsvRows } from '../src/utils/csv.js';
import { parsiPaivamaara } from '../src/utils/kisaStatus.js';
import { kisanPaivaTila, onkoKorjausaikaOhi } from '../api/_lib/kisaValimuisti.js';
import { SALLITUT_VALILEHDET } from '../api/_lib/sheetsData.js';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/$/, '');
const paattyneita = Number(args[args.indexOf('--paattyneita') + 1]) || 4;
const kylma = args.includes('--kylma');
const tarkista = args.includes('--tarkista');
if (!base) {
  console.error('Anna osoite, esim. npm run tarkista -- https://scoring-ui.vercel.app');
  process.exit(1);
}

// Päättyneelle kisalle sovellus pyytää nämä (src/App.jsx sivutKisalle); muille kaikki julkaistavat välilehdet.
const STAATTINEN = ['Tulokset Y', 'NEW_Joukkue', 'KISANSPEKSIT'];
const LIVE = SALLITUT_VALILEHDET;

function url(sheetId, nimet, lisa = '') {
  const p = new URLSearchParams({ sheetId });
  nimet.forEach((n) => p.append('sheetNames', n));
  return `${base}/api/kisa?${p}${lisa}`;
}

async function mittaa(osoite) {
  const alku = performance.now();
  const res = await fetch(osoite, { headers: { 'Accept-Encoding': 'gzip, br' } });
  const ttfb = performance.now() - alku;
  const runko = await res.text();
  const yht = performance.now() - alku;
  let json = null;
  try { json = JSON.parse(runko); } catch { /* ei JSONia */ }
  return {
    http: res.status,
    ms: Math.round(yht),
    ttfb: Math.round(ttfb),
    cdn: res.headers.get('x-vercel-cache') || '-',
    age: res.headers.get('age') || '-',
    lahde: res.headers.get('x-scoringui-lahde') || json?.timing?.source || '-',
    google: json?.timing?.google_ms ?? '',
    fn: json?.timing?.total_ms ?? '',
    kb: Math.round(runko.length / 1024),
    runko,
    virhe: res.ok ? '' : (json?.error || runko.slice(0, 80))
  };
}

const odota = (ms) => new Promise((r) => setTimeout(r, ms));
const satunnainen = () => Math.random().toString(36).slice(2, 8);

// Välilehtiparit, joita sovellus ei pyydä (se pyytää vain KISANSPEKSIT yksin, STAATTINEN ja LIVE).
function satunnainenPari() {
  const parit = [];
  for (let i = 0; i < LIVE.length; i++) for (let j = i + 1; j < LIVE.length; j++) parit.push([LIVE[i], LIVE[j]]);
  return parit[Math.floor(Math.random() * parit.length)];
}

// OK: luettiin Googlesta. VIRHE: Google ei vastannut (virhekoodi tai varalla oleva vanha data, lähde *-fallback),
// esim. taulukkoa ei ole jaettu palvelutilille. VÄLIMUISTI: pari oli jo välimuistissa, joten lukua ei tarkistettu.
function luokittele(t) {
  if (t.http !== 200 || String(t.lahde).endsWith('-fallback')) return 'VIRHE';
  return t.lahde === 'google' ? 'OK' : 'VÄLIMUISTI';
}

async function tarkistaKaikki(kisat) {
  if (!kisat.length) throw new Error('Rekisteristä ei löytynyt yhtään kisaa: tarkista osoite');
  const pari = satunnainenPari();
  console.log(`Välilehtipari: ${pari.join(' + ')}\n`);
  const rivit = [];
  for (const k of kisat) {
    let t = await mittaa(url(k.sheetId, pari, `&_m=${satunnainen()}`));
    // 503 = Googlen lukukiintiö (minuuttikohtainen) täynnä: odotetaan ja yritetään kerran uudelleen.
    if (t.http === 503) { await odota(30000); t = await mittaa(url(k.sheetId, pari, `&_m=${satunnainen()}`)); }
    rivit.push({ kisa: String(k.nimi).slice(0, 34), http: t.http, 'lähde': t.lahde, ms: t.ms, tulos: luokittele(t), ...(t.virhe ? { virhe: t.virhe } : {}) });
    await odota(2500);
  }
  console.table(rivit);
  const virheet = rivit.filter((r) => r.tulos === 'VIRHE').length;
  const valimuistissa = rivit.filter((r) => r.tulos === 'VÄLIMUISTI').length;
  if (virheet) console.log(`\n${virheet} kisaa ei saatu luettua Googlesta. Tarkista niiden jako palvelutilille.`);
  if (valimuistissa) console.log(`\n${valimuistissa} kisaa tuli välimuistista (pari oli jo käytössä): aja uudelleen, niin pari vaihtuu.`);
  if (!virheet && !valimuistissa) console.log('\nKaikki kisat luettiin Googlesta palvelutilillä.');
  process.exit(virheet || valimuistissa ? 1 : 0);
}

async function main() {
  const rek = await mittaa(`${base}/api/rekisteri`);
  console.log(`Rekisteri: ${rek.ms} ms (TTFB ${rek.ttfb}), CDN ${rek.cdn}, age ${rek.age}\n`);
  if (rek.http !== 200) throw new Error(`Rekisterin haku epäonnistui: ${rek.http} ${rek.virhe}`);
  // API käyttää rekisteristä vain sheetId:n ensimmäisen rivin, joten toistot ohitetaan.
  const nahdyt = new Set();
  const kisat = parseCsvRows(rek.runko)
    .filter((r) => /^[A-Za-z0-9_-]{20,}$/.test(String(r[4] || '').trim()))
    .map((r) => ({ nimi: r[1], alkuPvm: r[2], loppuPvm: r[3], sheetId: r[4].trim() }))
    .filter((k) => !nahdyt.has(k.sheetId) && nahdyt.add(k.sheetId))
    .map((k) => ({ ...k, tila: kisanPaivaTila(k) }));

  // Lähin ensin; kisa ilman kelvollista päivää viimeiseksi.
  const aika = (k) => parsiPaivamaara(k.alkuPvm)?.getTime() ?? Infinity;
  const valitut = [
    ...kisat.filter((k) => k.tila === 'kaynnissa'),
    ...kisat.filter((k) => k.tila === 'tulossa').sort((a, b) => aika(a) - aika(b)).slice(0, 2),
    ...kisat.filter((k) => k.tila === 'paattynyt').sort((a, b) => aika(b) - aika(a)).slice(0, paattyneita)
  ];
  if (tarkista) return tarkistaKaikki(kisat);
  if (!valitut.length) throw new Error('Rekisteristä ei löytynyt kisoja');

  const tulokset = [];
  for (const k of valitut) {
    const ryhma = k.tila === 'paattynyt' ? (onkoKorjausaikaOhi(k) ? 'päättynyt' : 'päättynyt (korjausaika)') : k.tila;
    const nimet = k.tila === 'paattynyt' ? STAATTINEN : LIVE;
    const vaiheet = [
      ['1 avaus', url(k.sheetId, nimet)],
      ['2 toisto', url(k.sheetId, nimet)],
      ['3 ohi CDN', url(k.sheetId, nimet, `&_m=${satunnainen()}`)]
    ];
    if (kylma) {
      const kylmatNimet = k.tila === 'paattynyt' ? LIVE : satunnainenPari();
      vaiheet.push(['4 kylmä', url(k.sheetId, kylmatNimet, `&_m=${satunnainen()}`)]);
    }
    for (const [vaihe, osoite] of vaiheet) {
      const t = await mittaa(osoite);
      tulokset.push({ kisa: String(k.nimi).slice(0, 28), ryhma, vaihe, ...t });
      await odota(1500);
    }
  }

  console.table(tulokset.map((t) => ({
    kisa: t.kisa, tila: t.ryhma, vaihe: t.vaihe, http: t.http, 'ms': t.ms, 'ttfb': t.ttfb,
    'x-vercel-cache': t.cdn, age: t.age, 'lähde': t.lahde, 'funktio ms': t.fn, 'google ms': t.google, kb: t.kb,
    ...(t.virhe ? { virhe: t.virhe } : {})
  })));

  // Mediaanit tilan ja vaiheen mukaan.
  const ryhmat = new Map();
  for (const t of tulokset.filter((x) => x.http === 200)) {
    const avain = `${t.ryhma} | ${t.vaihe}`;
    ryhmat.set(avain, [...(ryhmat.get(avain) || []), t.ms]);
  }
  const mediaani = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log('\nMediaani (ms), tila | vaihe:');
  for (const [avain, ajat] of [...ryhmat].sort()) console.log(`  ${avain.padEnd(40)} ${String(mediaani(ajat)).padStart(6)}   (n=${ajat.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
