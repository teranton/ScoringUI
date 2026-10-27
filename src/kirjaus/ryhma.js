// Ryhmäpuhelimen korttilogiikka (Sporting / FITASC / ESP): kortti per (layout, ampuja), kiekot asemittain.
// Kortti: { layout, nro, merkit (X/O/-, layoutin kiekkojen verran), versio, lahetetty, kuitatut (puhelimen asemien
// tunnukset, jotka ampuja on hyväksynyt), hyvaksytty (ms, true tai null: kaikki asemat hyväksytty) }.
// Kortit ovat oliossa avaimella "<layout>:<nro>". Puhtaat funktiot (ryhma.test.js).
import { uusiVersio } from './kortit.js';

export const korttiAvain = (layout, nro) => `${layout}:${nro}`;
export const tyhjat = (kohteita) => '-'.repeat(kohteita);
export const osumat = (merkit) => [...merkit].filter((m) => m === 'X').length;
export const taytetyt = (merkit) => [...merkit].filter((m) => m !== '-').length;

export const merkitOf = (kortit, layout, nro) => kortit[korttiAvain(layout.nro, nro)]?.merkit || tyhjat(layout.kohteita);

// Aseman kiekot kortilla: { alku, loppu } (loppu ei mukana).
export function asemanVali(layout, asema) {
  const alku = layout.asemat.slice(0, asema).reduce((s, a) => s + a.kohteita, 0);
  return { alku, loppu: alku + (layout.asemat[asema]?.kohteita || 0) };
}

// Layoutin asemajako ("10,8,7", sama kuin api/_lib/kirjausRyhma.js asemaJako): lähtee kortin mukana.
export const asemaJako = (layout) => layout.asemat.map((a) => a.kohteita).join(',');

// Ampumajärjestys siirrettynä k paikkaa: aloittaja siirtyy yhdellä per layoutin kierros (kuten paperikortissa,
// ScoringLib ScoreCardFill.rotateShooters) ja per asema (asemanSiirto). k = 0 tai puuttuva: numerojärjestys.
export function kierrata(ampujat, kierros) {
  const k = ampujat.length && Number.isInteger(kierros) && kierros > 0 ? kierros % ampujat.length : 0;
  return [...ampujat.slice(k), ...ampujat.slice(0, k)];
}

// Ryhmän layoutit ammuntajärjestyksessä: aikataulun kierroksen mukaan, aikataulusta puuttuvat lopussa numerojärjestyksessä.
export function layoutJarjestys(layoutit) {
  return [...(layoutit || [])].sort((a, b) => (a.kierros ?? 999) - (b.kierros ?? 999) || a.nro - b.nro);
}

// Layoutin tilanne: { valmiit (kaikki kiekot merkitty), hyvaksytyt, ampujia }. Keskeyttäneitä ei odoteta (heillä ei ole
// hyväksyntää), paitsi jos heidän korttinsa on jo hyväksytty.
export function layoutinTila(layout, ampujat, kortit, keskeyttaneet = []) {
  let valmiit = 0;
  let hyvaksytyt = 0;
  const mukana = ampujat.filter((a) => !keskeyttaneet.includes(a.nro) || kortit[korttiAvain(layout.nro, a.nro)]?.hyvaksytty);
  for (const a of mukana) {
    const kortti = kortit[korttiAvain(layout.nro, a.nro)];
    if (kortti && taytetyt(kortti.merkit) === layout.kohteita) valmiit++;
    if (kortti?.hyvaksytty) hyvaksytyt++;
  }
  return { valmiit, hyvaksytyt, ampujia: mukana.length };
}

export const layoutHyvaksytty = (layout, ampujat, kortit, keskeyttaneet = []) => {
  const t = layoutinTila(layout, ampujat, kortit, keskeyttaneet);
  return t.ampujia > 0 && t.hyvaksytyt === t.ampujia;
};

// Ensimmäinen layout, jota ei ole vielä hyväksytty kokonaan (muuten viimeinen).
export function aloitusLayout(jarjestys, ampujat, kortit, keskeyttaneet = []) {
  return jarjestys.find((l) => !layoutHyvaksytty(l, ampujat, kortit, keskeyttaneet)) || jarjestys[jarjestys.length - 1] || null;
}

// Puhelimen asemat (näkymä): [{ id, alku, loppu, kohteita, osat: [{ alku, loppu, siirto, nimi }] }]. Oletuksena taulukon
// asemat, kukin yhtenä osana. FITASC-layoutissa (yksi taulukon asema, ohjelma RATAn_OHJELMA-avaimesta) asemat ovat
// ohjelman pisteet 1..n: ensin sinkut, sitten tuplat, joissa ampumajärjestys siirtyy yhdellä (siirto 1).
// Kortin kiekot ja tallennus pysyvät taulukon asemittain. Muistissa layout-oliota kohden.
const pisteMuisti = new WeakMap();
export function pisteet(layout) {
  if (!pisteMuisti.has(layout)) pisteMuisti.set(layout, laskePisteet(layout));
  return pisteMuisti.get(layout);
}

function laskePisteet(layout) {
  if (layout.ohjelma?.length && layout.asemat.length === 1
    && layout.ohjelma.reduce((s, p) => s + p.sinkut + 2 * p.tuplat, 0) === layout.kohteita) {
    let alku = 0;
    return layout.ohjelma.map((p, k) => {
      const osat = [];
      if (p.sinkut) osat.push({ alku, loppu: alku + p.sinkut, siirto: 0, nimi: 'sinkut' });
      const tuplaAlku = alku + p.sinkut;
      if (p.tuplat) osat.push({ alku: tuplaAlku, loppu: tuplaAlku + 2 * p.tuplat, siirto: p.sinkut ? 1 : 0, nimi: 'tuplat' });
      const piste = { id: String(k + 1), alku, loppu: tuplaAlku + 2 * p.tuplat, kohteita: p.sinkut + 2 * p.tuplat, osat };
      alku = piste.loppu;
      return piste;
    });
  }
  return layout.asemat.map((a, k) => {
    const { alku, loppu } = asemanVali(layout, k);
    return { id: a.id, alku, loppu, kohteita: a.kohteita, osat: [{ alku, loppu, siirto: 0, nimi: null }] };
  });
}

// Puhelimen aseman indeksi kiekolle i.
export function pisteKiekolle(layout, i) {
  const p = pisteet(layout);
  const k = p.findIndex((x) => i < x.loppu);
  return k === -1 ? Math.max(0, p.length - 1) : k;
}

// Asemien ammuntajärjestys (indeksit): lähtöasemalta (aikataulun "asema S", layout.alkuasema) loppuun ja alusta sen eteen.
export function asemaJarjestys(layout) {
  const p = pisteet(layout);
  const alku = Math.max(0, p.findIndex((x) => String(x.id) === String(layout.alkuasema ?? '')));
  return p.map((_, k) => (alku + k) % p.length);
}

// Aseman ampumajärjestyksen siirto: layoutin kierros + aseman paikka ammuntajärjestyksessä (kuten paperikortissa).
export function asemanSiirto(layout, asema) {
  return (layout.kierros || 0) + Math.max(0, asemaJarjestys(layout).indexOf(asema));
}

// Asema on kesken, kun jollakulla (keskeyttämättömällä) on siinä tyhjä kiekko tai hyväksymätön tulos.
export const asemaKesken = (layout, asema, ampujat, kortit, keskeyttaneet = []) => {
  const { alku, loppu } = pisteet(layout)[asema] || { alku: 0, loppu: 0 };
  return ampujat.some((amp) => !keskeyttaneet.includes(amp.nro)
    && (merkitOf(kortit, layout, amp.nro).slice(alku, loppu).includes('-') || !asemaKuitattu(kortit, layout, amp.nro, asema)));
};

// Ensimmäinen kesken oleva asema ammuntajärjestyksessä (muuten viimeinen). Tyhjä layout avautuu lähtöasemalta.
export function aloitusAsema(layout, ampujat, kortit, keskeyttaneet = []) {
  const jarjestys = asemaJarjestys(layout);
  return jarjestys.find((a) => asemaKesken(layout, a, ampujat, kortit, keskeyttaneet)) ?? jarjestys[jarjestys.length - 1] ?? 0;
}

// Seuraava kesken oleva asema ammuntajärjestyksessä nykyisen jälkeen (kiertäen), tai null.
export function seuraavaAsema(layout, asema, ampujat, kortit) {
  const jarjestys = asemaJarjestys(layout);
  const i = jarjestys.indexOf(asema);
  for (let k = 1; k < jarjestys.length; k++) {
    const a = jarjestys[(i + k) % jarjestys.length];
    if (asemaKesken(layout, a, ampujat, kortit)) return a;
  }
  return null;
}

const kesken = (layout, nro, kortit, { alku, loppu }) => {
  const tyhja = merkitOf(kortit, layout, nro).indexOf('-', alku);
  return tyhja !== -1 && tyhja < loppu ? tyhja : -1;
};

// Aseman osa, jota ammutaan: ensimmäinen, jossa jollakulla on tyhjä kiekko (FITASC: sinkut ennen tuplia). Ampujat
// aseman järjestyksessä; osan järjestys siirtyy osan siirron verran. Palauttaa { osa, mukana } tai null (asema valmis).
function nykyinenOsa(layout, asema, ampujat, kortit, keskeyttaneet) {
  for (const osa of pisteet(layout)[asema]?.osat || []) {
    // Siirto ammuvien kesken: keskeyttänyt ei vie aloittajan paikkaa.
    const mukana = kierrata(ampujat.filter((a) => !keskeyttaneet.includes(a.nro)), osa.siirto);
    if (mukana.some((a) => kesken(layout, a.nro, kortit, osa) !== -1)) return { osa, mukana };
  }
  return null;
}

// Kiekon i osa asemalla: { alku, loppu, siirto, nimi }.
export function kohdanOsa(layout, asema, i) {
  const osat = pisteet(layout)[asema]?.osat || [];
  return osat.find((o) => i >= o.alku && i < o.loppu) || osat[0] || null;
}

// Seuraavaksi merkittävä kiekko asemalla: valitun ampujan ensimmäinen tyhjä kiekko asemalla (kirjaaja valitsi hänet,
// myös FITASCin tuplat ennen muiden sinkkuja), muuten ammuttavan osan ensimmäinen ampuja (järjestyksessä valitusta
// eteenpäin), jolla on siinä tyhjä kiekko. Palauttaa { nro, i } tai null (asema valmis).
export function seuraavaKohta(layout, asema, ampujat, kortit, valittu = null, keskeyttaneet = []) {
  const nyt = nykyinenOsa(layout, asema, ampujat, kortit, keskeyttaneet);
  if (!nyt) return null;
  if (valittu !== null && !keskeyttaneet.includes(valittu) && ampujat.some((a) => a.nro === valittu)) {
    const i = kesken(layout, valittu, kortit, pisteet(layout)[asema]);
    if (i !== -1) return { nro: valittu, i };
  }
  const { osa, mukana } = nyt;
  const alkuI = Math.max(0, mukana.findIndex((a) => a.nro === valittu));
  for (let k = 0; k < mukana.length; k++) {
    const { nro } = mukana[(alkuI + k) % mukana.length];
    const i = kesken(layout, nro, kortit, osa);
    if (i !== -1) return { nro, i };
  }
  return null;
}

// Seuraava ampuja valitun jälkeen, jolla on ammuttavassa osassa tyhjiä kiekkoja (FITASC: ampuja vaihtuu kesken aseman).
export function seuraavaAmpuja(layout, asema, ampujat, kortit, valittu, keskeyttaneet = []) {
  const nyt = nykyinenOsa(layout, asema, ampujat, kortit, keskeyttaneet);
  if (!nyt) return null;
  const { osa, mukana } = nyt;
  const i = mukana.findIndex((a) => a.nro === valittu);
  if (i === -1) return null;
  for (let k = 1; k <= mukana.length; k++) {
    const { nro } = mukana[(i + k) % mukana.length];
    if (kesken(layout, nro, kortit, osa) !== -1) return nro;
  }
  return null;
}

// Asettaa merkin; merkin muutos poistaa hyväksynnän. Palauttaa { kortit, historia }.
export function merkitse({ kortit, historia }, layout, { nro, i }, merkki, nyt = Date.now()) {
  const avain = korttiAvain(layout.nro, nro);
  const vanha = kortit[avain];
  const merkit = merkitOf(kortit, layout, nro);
  if (i < 0 || i >= layout.kohteita || merkit[i] === merkki) return { kortit, historia };
  const uudet = merkit.slice(0, i) + merkki + merkit.slice(i + 1);
  // Muuttuneen aseman hyväksyntä poistuu (muiden asemien jää).
  const asemaId = pisteet(layout)[pisteKiekolle(layout, i)]?.id;
  const kuitatut = kuitatutOf(vanha, layout).filter((id) => id !== asemaId);
  return {
    kortit: { ...kortit, [avain]: { layout: layout.nro, nro, merkit: uudet, versio: uusiVersio(vanha?.versio, nyt), lahetetty: false, kuitatut, hyvaksytty: null } },
    historia: [...historia, { layout: layout.nro, nro, i, ennen: merkit[i] }].slice(-200)
  };
}

// Peruu viimeisimmän merkinnän. Palauttaa { kortit, historia, kohta: { layout, nro, i } } tai null.
export function peru({ kortit, historia }, layoutit, nyt = Date.now()) {
  const viimeinen = historia[historia.length - 1];
  const layout = viimeinen && layoutit.find((l) => l.nro === viimeinen.layout);
  if (!layout) return null;
  const { kortit: uudet } = merkitse({ kortit, historia: [] }, layout, viimeinen, viimeinen.ennen, nyt);
  return { kortit: uudet, historia: historia.slice(0, -1), kohta: viimeinen };
}

// Kortin hyväksytyt asemat (tunnukset). Ennen asemakohtaista hyväksyntää hyväksytty kortti kattaa kaikki asemat.
export function kuitatutOf(kortti, layout) {
  if (!kortti) return [];
  if (kortti.hyvaksytty && !kortti.kuitatut?.length) return pisteet(layout).map((p) => p.id);
  return Array.isArray(kortti.kuitatut) ? kortti.kuitatut : [];
}

export const asemaKuitattu = (kortit, layout, nro, asema) =>
  kuitatutOf(kortit[korttiAvain(layout.nro, nro)], layout).includes(pisteet(layout)[asema]?.id);

// Ampuja hyväksyy aseman tuloksensa (vain täysi asema). Kun kaikki asemat on hyväksytty, koko kortti on hyväksytty.
// Uusi versio, jotta hyväksyntä lähtee taulukkoon.
export function kuittaaAsema(kortit, layout, nro, asema, nyt = Date.now()) {
  const avain = korttiAvain(layout.nro, nro);
  const kortti = kortit[avain];
  const piste = pisteet(layout)[asema];
  if (!kortti || !piste || kortti.merkit.slice(piste.alku, piste.loppu).includes('-')) return kortit;
  const vanhat = kuitatutOf(kortti, layout);
  if (vanhat.includes(piste.id)) return kortit;
  const kuitatut = [...vanhat, piste.id];
  const kaikki = pisteet(layout).every((p) => kuitatut.includes(p.id)) && taytetyt(kortti.merkit) === layout.kohteita;
  return { ...kortit, [avain]: { ...kortti, kuitatut, versio: uusiVersio(kortti.versio, nyt), lahetetty: false, hyvaksytty: kaikki ? nyt : null } };
}

// Palvelimen kortit paikallisiin (kuten kortit.js yhdistaPalvelimelta): uudempi versio voittaa, sama versio merkitään
// lähetetyksi. kaikki = avauksen koko korttilista: lähetetyksi merkitty kortti, jota taulukossa ei ole, lähetetään uudelleen.
export function yhdistaPalvelimelta(kortit, palvelimen, { kaikki = false } = {}) {
  let tulos = kortit;
  const nahdyt = new Set();
  for (const p of palvelimen || []) {
    const avain = korttiAvain(p.layout, p.nro);
    nahdyt.add(avain);
    const oma = tulos[avain];
    const palvelimelta = {
      layout: p.layout, nro: p.nro, merkit: p.merkit, versio: p.versio, lahetetty: true,
      kuitatut: Array.isArray(p.kuitatut) ? p.kuitatut : [], hyvaksytty: p.hyvaksytty ? (oma?.hyvaksytty || true) : null
    };
    if (!oma || p.versio > oma.versio || (p.versio === oma.versio && p.merkit !== oma.merkit)) tulos = { ...tulos, [avain]: palvelimelta };
    else if (p.versio === oma.versio && !oma.lahetetty) tulos = { ...tulos, [avain]: { ...oma, lahetetty: true } };
    else if (kaikki && p.versio < oma.versio && oma.lahetetty) tulos = { ...tulos, [avain]: { ...oma, lahetetty: false } };
  }
  if (kaikki) {
    for (const [avain, oma] of Object.entries(tulos)) {
      if (oma.lahetetty && !nahdyt.has(avain)) tulos = { ...tulos, [avain]: { ...oma, lahetetty: false } };
    }
  }
  return tulos;
}

// Lähettämättömät kortit API:n muodossa (enintään maks), asemajaon kanssa, kun layout tunnetaan. Hylätyt (ei ryhmässä
// tai layout poistettu) eivät lähde uudelleen. Sama sääntö public/kirjaus-sw.js lahetettavat.
export function lahettamattomat(kortit, maks = 60, layoutit = []) {
  return Object.values(kortit)
    .filter((k) => !k.lahetetty && !k.hylatty)
    .slice(0, maks)
    .map((k) => {
      const layout = layoutit.find((l) => l.nro === k.layout);
      return {
        layout: k.layout, nro: k.nro, merkit: k.merkit, versio: k.versio,
        ...(k.kuitatut?.length ? { kuitatut: k.kuitatut } : {}), ...(k.hyvaksytty ? { hyvaksytty: k.hyvaksytty } : {}),
        ...(layout ? { jako: asemaJako(layout) } : {})
      };
    });
}

// Tallennuksen vastaus: lähetetyt versiot lähetetyiksi, palvelimen uudemmat käyttöön, ryhmään kuulumattomat ja poistettujen
// layoutien kortit hylätyiksi (ne jäävät laitteelle ja lokiin, mutta eivät lähde uudelleen).
export function kuittaa(kortit, lahetetyt, { tallennetut = [], uudemmat = [], hylatyt = [] }) {
  let tulos = kortit;
  const versiot = new Map(lahetetyt.map((k) => [korttiAvain(k.layout, k.nro), k.versio]));
  for (const t of tallennetut) {
    const avain = korttiAvain(t.layout, t.nro);
    const oma = tulos[avain];
    if (oma && oma.versio === versiot.get(avain)) tulos = { ...tulos, [avain]: { ...oma, lahetetty: true } };
  }
  for (const h of hylatyt) {
    const avain = korttiAvain(h.layout, h.nro);
    const oma = tulos[avain];
    if ((h.syy === 'ryhma' || h.syy === 'layout') && oma && oma.versio === versiot.get(avain)) tulos = { ...tulos, [avain]: { ...oma, hylatty: true } };
  }
  return yhdistaPalvelimelta(tulos, uudemmat);
}

// Layoutin asemajako muuttui (asemataulukkoa korjattu): kortit sovitetaan asema kerrallaan (aseman tulossarake yhdistää
// vanhan ja uuden; lisätyt kiekot tyhjinä, poistetut pois) ja lähetetään uudelleen. vanhat = edelliset layoutit
// (merkinnät tehtiin niiden jaolla); ilman niitä pituus sovitetaan lopusta.
export function sovitaPituudet(kortit, layoutit, vanhat = [], nyt = Date.now()) {
  let tulos = kortit;
  for (const [avain, k] of Object.entries(kortit)) {
    const layout = layoutit.find((l) => l.nro === k.layout);
    if (!layout) continue;
    const vanha = vanhat.find((l) => l.nro === k.layout);
    const vanhallaJaolla = vanha && vanha.kohteita === k.merkit.length && asemaJako(vanha) !== asemaJako(layout);
    if (!vanhallaJaolla && k.merkit.length === layout.kohteita) continue;
    let merkit;
    if (vanhallaJaolla) {
      merkit = layout.asemat.map((asema) => {
        const a = vanha.asemat.findIndex((x) => x.sarake === asema.sarake);
        const osa = a === -1 ? '' : k.merkit.slice(asemanVali(vanha, a).alku, asemanVali(vanha, a).loppu);
        return osa.slice(0, asema.kohteita).padEnd(asema.kohteita, '-');
      }).join('');
    } else {
      merkit = k.merkit.length > layout.kohteita ? k.merkit.slice(0, layout.kohteita) : k.merkit.padEnd(layout.kohteita, '-');
    }
    tulos = { ...tulos, [avain]: { ...k, merkit, versio: uusiVersio(k.versio, nyt), lahetetty: false, kuitatut: [], hyvaksytty: null } };
  }
  return tulos;
}

// Korvatun puhelimen merkinnät ({ "<layout>:<nro>": merkit }) vain tyhjiin kiekkoihin, ja vain kerran per merkintä
// (sovelletut), jotta tämän puhelimen perumat eivät palaa. Palauttaa { kortit, sovelletut, taytetyt }.
export function otaTaydennykset(kortit, taydennykset, layoutit, sovelletut = {}, nyt = Date.now()) {
  let uudet = kortit;
  const uudetSovelletut = { ...sovelletut };
  let taytetyt = 0;
  for (const [avain, merkit] of Object.entries(taydennykset || {})) {
    if (typeof merkit !== 'string' || merkit === sovelletut[avain]) continue;
    const [l, n] = avain.split(':').map(Number);
    const layout = layoutit.find((x) => x.nro === l);
    if (!layout || merkit.length !== layout.kohteita) continue;
    const aiemmat = sovelletut[avain] || '';
    const oma = uudet[avain];
    let muuttui = false;
    const tulos = [...(oma?.merkit || tyhjat(layout.kohteita))].map((m, i) => {
      const t = merkit[i];
      if (m !== '-' || !t || t === '-' || (aiemmat[i] && aiemmat[i] !== '-')) return m;
      muuttui = true;
      return t;
    }).join('');
    uudetSovelletut[avain] = merkit;
    if (muuttui) {
      uudet = { ...uudet, [avain]: { layout: l, nro: n, merkit: tulos, versio: uusiVersio(oma?.versio, nyt), lahetetty: false, kuitatut: kuitatutOf(oma, layout), hyvaksytty: null } };
      taytetyt++;
    }
  }
  return { kortit: uudet, sovelletut: uudetSovelletut, taytetyt };
}
