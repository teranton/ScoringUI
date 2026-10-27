// Ryhmäpuhelimen korttilogiikka (Sporting / FITASC / ESP): kortti per (layout, ampuja), kiekot asemittain.
// Kortti: { layout, nro, merkit (X/O/-, layoutin kiekkojen verran), versio, lahetetty, hyvaksytty (ms, true tai null) }.
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

// Kiekko i:n asema layoutilla (indeksi).
export function asemaKiekolle(layout, i) {
  let loppu = 0;
  const a = layout.asemat.findIndex((s) => (loppu += s.kohteita) > i);
  return a === -1 ? Math.max(0, layout.asemat.length - 1) : a;
}

// Layoutin asemajako ("10,8,7", sama kuin api/_lib/kirjausRyhma.js asemaJako): lähtee kortin mukana.
export const asemaJako = (layout) => layout.asemat.map((a) => a.kohteita).join(',');

// Ampumajärjestys siirrettynä k paikkaa: aloittaja siirtyy yhdellä per layoutin kierros (kuten paperikortissa,
// ScoringLib ScoreCardFill.rotateShooters) ja per asema. k = 0 tai puuttuva: numerojärjestys.
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

// Ensimmäinen asema, jolla jonkun ampujan kiekko on merkitsemättä (muuten viimeinen).
export function aloitusAsema(layout, ampujat, kortit) {
  const i = layout.asemat.findIndex((_, a) => {
    const { alku, loppu } = asemanVali(layout, a);
    return ampujat.some((amp) => merkitOf(kortit, layout, amp.nro).slice(alku, loppu).includes('-'));
  });
  return i === -1 ? Math.max(0, layout.asemat.length - 1) : i;
}

// Seuraavaksi merkittävä kiekko asemalla: valitun ampujan ensimmäinen tyhjä kiekko, muuten ensimmäinen ampuja
// (järjestyksessä valitusta eteenpäin), jolla on tyhjä kiekko. Palauttaa { nro, i } tai null (asema valmis).
export function seuraavaKohta(layout, asema, ampujat, kortit, valittu = null, keskeyttaneet = []) {
  const { alku, loppu } = asemanVali(layout, asema);
  const mukana = ampujat.filter((a) => !keskeyttaneet.includes(a.nro));
  const alkuI = Math.max(0, mukana.findIndex((a) => a.nro === valittu));
  for (let k = 0; k < mukana.length; k++) {
    const { nro } = mukana[(alkuI + k) % mukana.length];
    const tyhja = merkitOf(kortit, layout, nro).indexOf('-', alku);
    if (tyhja !== -1 && tyhja < loppu) return { nro, i: tyhja };
  }
  return null;
}

// Seuraava ampuja valitun jälkeen, jolla on asemalla tyhjiä kiekkoja (FITASC: ampuja vaihtuu kesken aseman).
export function seuraavaAmpuja(layout, asema, ampujat, kortit, valittu, keskeyttaneet = []) {
  const mukana = ampujat.filter((a) => !keskeyttaneet.includes(a.nro));
  const i = mukana.findIndex((a) => a.nro === valittu);
  if (i === -1) return null;
  const { alku, loppu } = asemanVali(layout, asema);
  for (let k = 1; k <= mukana.length; k++) {
    const { nro } = mukana[(i + k) % mukana.length];
    const tyhja = merkitOf(kortit, layout, nro).indexOf('-', alku);
    if (tyhja !== -1 && tyhja < loppu) return nro;
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
  return {
    kortit: { ...kortit, [avain]: { layout: layout.nro, nro, merkit: uudet, versio: uusiVersio(vanha?.versio, nyt), lahetetty: false, hyvaksytty: null } },
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

// Ampuja hyväksyy layoutin korttinsa (vain täysi kortti). Uusi versio, jotta hyväksyntä lähtee taulukkoon.
export function hyvaksy(kortit, layout, nro, nyt = Date.now()) {
  const avain = korttiAvain(layout.nro, nro);
  const kortti = kortit[avain];
  if (!kortti || taytetyt(kortti.merkit) !== layout.kohteita || kortti.hyvaksytty) return kortit;
  return { ...kortit, [avain]: { ...kortti, versio: uusiVersio(kortti.versio, nyt), lahetetty: false, hyvaksytty: nyt } };
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
    const palvelimelta = { layout: p.layout, nro: p.nro, merkit: p.merkit, versio: p.versio, lahetetty: true, hyvaksytty: p.hyvaksytty ? (oma?.hyvaksytty || true) : null };
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
        ...(k.hyvaksytty ? { hyvaksytty: k.hyvaksytty } : {}), ...(layout ? { jako: asemaJako(layout) } : {})
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
    tulos = { ...tulos, [avain]: { ...k, merkit, versio: uusiVersio(k.versio, nyt), lahetetty: false, hyvaksytty: null } };
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
      uudet = { ...uudet, [avain]: { layout: l, nro: n, merkit: tulos, versio: uusiVersio(oma?.versio, nyt), lahetetty: false, hyvaksytty: null } };
      taytetyt++;
    }
  }
  return { kortit: uudet, sovelletut: uudetSovelletut, taytetyt };
}
