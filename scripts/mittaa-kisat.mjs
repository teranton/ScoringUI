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
// Välilehtilistat (STAATTINEN, LIVE) ovat samat kuin src/App.jsx:n sivutKisalle; pidä ne samoina.
// Skripti ei tarvitse riippuvuuksia (Node 18+).

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/$/, '');
const paattyneita = Number(args[args.indexOf('--paattyneita') + 1]) || 4;
const kylma = args.includes('--kylma');
const tarkista = args.includes('--tarkista');
if (!base) {
  console.error('Anna osoite, esim. npm run tarkista -- https://scoring-ui.vercel.app');
  process.exit(1);
}

const STAATTINEN = ['Tulokset Y', 'NEW_Joukkue', 'KISANSPEKSIT'];
const LIVE = ['Tulokset Y', 'NEW_Joukkue', 'Ryhmäjako', 'Ilmoittautuneet', 'KISANSPEKSIT', 'Aikataulu', 'Aikataulu La', 'Aikataulu Su'];
const KORJAUSAIKA_PV = 14;

function parseCsv(teksti) {
  const rivit = [];
  let rivi = [], kentta = '', lainaus = false;
  for (let i = 0; i < teksti.length; i++) {
    const c = teksti[i];
    if (lainaus) {
      if (c === '"' && teksti[i + 1] === '"') { kentta += '"'; i++; }
      else if (c === '"') lainaus = false;
      else kentta += c;
    } else if (c === '"') lainaus = true;
    else if (c === ',') { rivi.push(kentta); kentta = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && teksti[i + 1] === '\n') i++;
      rivi.push(kentta); rivit.push(rivi); rivi = []; kentta = '';
    } else kentta += c;
  }
  if (kentta || rivi.length) { rivi.push(kentta); rivit.push(rivi); }
  return rivit;
}

function pvm(s) {
  const t = String(s || '').trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const o = iso ? [iso[3], iso[2], iso[1]] : t.split('.');
  if (o.length !== 3) return null;
  const d = new Date(Number(o[2]), Number(o[1]) - 1, Number(o[0]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function tila(alku, loppu, nyt = new Date()) {
  const a = pvm(alku), l = loppu ? pvm(loppu) : a;
  if (!a || !l) return 'tulossa';
  const t = new Date(nyt); t.setHours(0, 0, 0, 0);
  if (t < a) return 'tulossa';
  if (t > l) return 'paattynyt';
  return 'kaynnissa';
}

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

async function tarkistaKaikki(kisat) {
  const pari = satunnainenPari();
  console.log(`Välilehtipari: ${pari.join(' + ')}\n`);
  const rivit = [];
  for (const k of kisat) {
    let t = await mittaa(url(k.sheetId, pari, `&_m=${satunnainen()}`));
    // 503 = Googlen lukukiintiö (minuuttikohtainen) täynnä: odotetaan ja yritetään kerran uudelleen.
    if (t.http === 503) { await odota(30000); t = await mittaa(url(k.sheetId, pari, `&_m=${satunnainen()}`)); }
    const ok = t.http === 200 && t.lahde === 'google';
    rivit.push({ kisa: String(k.nimi).slice(0, 34), http: t.http, 'lähde': t.lahde, ms: t.ms, tulos: ok ? 'OK' : 'TARKISTA', ...(t.virhe ? { virhe: t.virhe } : {}) });
    await odota(2500);
  }
  console.table(rivit);
  const huonot = rivit.filter((r) => r.tulos !== 'OK');
  console.log(huonot.length ? `\n${huonot.length} kisaa ei luettu Googlesta. Jos lähde on muu kuin google, aja uudelleen (uusi pari).` : '\nKaikki kisat luettiin Googlesta palvelutilillä.');
  process.exit(huonot.some((r) => r.http !== 200) ? 1 : 0);
}

async function main() {
  const rek = await mittaa(`${base}/api/rekisteri`);
  console.log(`Rekisteri: ${rek.ms} ms (TTFB ${rek.ttfb}), CDN ${rek.cdn}, age ${rek.age}\n`);
  const rekisteriCsv = await (await fetch(`${base}/api/rekisteri`)).text();
  const kisat = parseCsv(rekisteriCsv)
    .filter((r) => /^[A-Za-z0-9_-]{20,}$/.test(String(r[4] || '').trim()))
    .map((r) => ({ nimi: r[1], alku: r[2], loppu: r[3], sheetId: r[4].trim(), tila: tila(r[2], r[3]) }));

  const jarj = (a, b) => (pvm(b.alku)?.getTime() || 0) - (pvm(a.alku)?.getTime() || 0);
  const valitut = [
    ...kisat.filter((k) => k.tila === 'kaynnissa'),
    ...kisat.filter((k) => k.tila === 'tulossa').sort(jarj).reverse().slice(0, 2),
    ...kisat.filter((k) => k.tila === 'paattynyt').sort(jarj).slice(0, paattyneita)
  ];
  if (tarkista) return tarkistaKaikki(kisat);
  if (!valitut.length) throw new Error('Rekisteristä ei löytynyt kisoja');

  const tulokset = [];
  for (const k of valitut) {
    const loppu = pvm(k.loppu) || pvm(k.alku);
    const korjausaika = k.tila === 'paattynyt' && loppu && (Date.now() - loppu) / 864e5 <= KORJAUSAIKA_PV + 1;
    const ryhma = k.tila === 'paattynyt' ? (korjausaika ? 'päättynyt (korjausaika)' : 'päättynyt') : k.tila;
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
