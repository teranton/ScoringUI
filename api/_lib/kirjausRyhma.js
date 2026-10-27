// Mobiilikirjauksen ryhmäpuhelin (Sporting / FITASC / ESP): ryhmän ampujat pääsivulta, layoutit asemineen
// KISANSPEKSIT-välilehdeltä, ryhmän layoutien järjestys ryhmäaikataulusta ja korttirivit MOBIILI Layout N -välilehdillä.
// Samat säännöt kuin ScoringLibin tuloskorttien täytössä (ScoreCardFill.readSquads, readLayouts, squadRounds), joten
// puhelin näyttää saman ryhmän ja samat asemat kuin paperikortti. Ei Google-kutsuja (kirjausRyhma.test.js).
import { normalisoiAsetus } from '../../src/utils/kisaAsetukset.js';
import { MAKS_NRO, puhdasTeksti, speksiArvo } from './kirjausData.js';

export const PAA_VALILEHTI = 'OSALLISTUJAT+TULOKSET';
export const RYHMAT_VALILEHTI = 'MOBIILI_RYHMAT';
export const layoutValilehti = (nro) => `MOBIILI Layout ${nro}`;
export const MAKS_LAYOUT = 50;
export const MAKS_KOHTEITA = 200;
// Ryhmäkoko, kun pääsivulla ei ole Ryhmä-saraketta eikä KISANSPEKSIT-avainta AIKATAULURYHMAKOKO.
export const OLETUS_RYHMAKOKO = 6;
export const RYHMA_META = 8;

const n = normalisoiAsetus;

// --- Layoutit ja asemat ---

const ASEMA_OTSIKOT = /^(LAYOUT|ASEMA|RATA|LANE|STATION)$/;
const MAX_OTSIKOT = /^(MAX|MAKS|MAARA|COUNT)$/;
const ASEMATAULU_RIVEJA = 26;

// Asemataulukon rivit [tunnus, maksimi]: tunnus- ja maksimiotsikon alla, ilman otsikoita J3:K28 (ScoringLib Speksit.asemaRivit).
export function asemaRivit(rivit) {
  let alku = { rivi: 2, sarake: 9 };
  haku: for (let r = 0; r < rivit.length; r++) {
    const rivi = Array.isArray(rivit[r]) ? rivit[r] : [];
    for (let c = 0; c < rivi.length - 1; c++) {
      if (ASEMA_OTSIKOT.test(n(rivi[c])) && MAX_OTSIKOT.test(n(rivi[c + 1]))) {
        alku = { rivi: r + 1, sarake: c };
        break haku;
      }
    }
  }
  return Array.from({ length: ASEMATAULU_RIVEJA }, (_, i) => {
    const rivi = rivit[alku.rivi + i] || [];
    return [String(rivi[alku.sarake] ?? '').trim(), String(rivi[alku.sarake + 1] ?? '').trim()];
  });
}

// Layoutien nimet avaimista RATA1_NIMI.. (vanha paikka H3:H10), järjestyksessä, vain nimetyt.
function layoutNimet(rivit) {
  const nimet = [];
  for (let nro = 1; nro <= MAKS_LAYOUT; nro++) {
    const nimi = speksiArvo(rivit, `RATA${nro}_NIMI`);
    if (nimi) nimet.push(nimi);
  }
  if (nimet.length > 0) return nimet;
  // Ilman avaimia vanha H3:H10.
  return Array.from({ length: 8 }, (_, i) => String(rivit[2 + i]?.[7] ?? '').trim()).filter(Boolean);
}

// FITASC-layoutin ohjelma RATAn_OHJELMA-avaimesta: pisteet pilkuilla, kukin "4S+2D" (sinkut ensin, tupla = 2 kiekkoa).
// Palauttaa [{ sinkut, tuplat }] tai null (ei tätä muotoa, esim. Compakin "SSSD"). Sama kuin ScoringLib fitascOhjelma.
export function fitascOhjelma(arvo) {
  const teksti = String(arvo ?? '').trim().toUpperCase();
  if (!teksti) return null;
  const pisteet = teksti.split(/\s*[,;]\s*/).filter(Boolean).map((osa) => {
    const m = osa.match(/^(?:(\d+)\s*S)?\s*\+?\s*(?:(\d+)\s*D)?$/);
    if (!m || (m[1] === undefined && m[2] === undefined)) return null;
    return { sinkut: Number(m[1] || 0), tuplat: Number(m[2] || 0) };
  });
  return pisteet.length && pisteet.length <= 20 && pisteet.every((p) => p && p.sinkut + p.tuplat > 0) ? pisteet : null;
}

// Layoutit: [{ nro, nimi, asemat: [{ sarake, id, kohteita }], kohteita, ohjelma? }]. Asemia on LAYOUT/KISA (muuten asemataulukon
// asemat, joilla on maksimi), ja ne jaetaan tasan layouteille järjestyksessä. sarake on aseman tulossarake (1..) pääsivulla.
// ohjelma: yhden aseman layoutille (FITASC) RATAn_OHJELMA-pisteet, kun niiden kiekot täsmäävät layoutiin.
// Palauttaa { layoutit } tai { virhe }.
export function lueLayoutit(rivit) {
  const nimet = layoutNimet(rivit);
  if (nimet.length === 0) return { virhe: 'KISANSPEKSIT: layoutien nimet (RATA1_NIMI..) puuttuvat' };
  const taulu = asemaRivit(rivit).filter(([id]) => id !== '').map(([id, maks]) => ({ id, kohteita: Number.parseInt(maks, 10) || 0 }));
  const kisa = Number.parseInt(speksiArvo(rivit, 'LAYOUT/KISA'), 10);
  const maara = kisa > 0 ? kisa : taulu.filter((a) => a.kohteita > 0).length;
  if (maara === 0 || maara > taulu.length) return { virhe: 'KISANSPEKSIT: asemataulukko puuttuu tai on vajaa' };
  if (maara % nimet.length !== 0) return { virhe: `KISANSPEKSIT: ${maara} asemaa ei jakaudu tasan ${nimet.length} layoutille` };
  const per = maara / nimet.length;
  const layoutit = nimet.slice(0, MAKS_LAYOUT).map((nimi, i) => {
    const asemat = taulu.slice(i * per, (i + 1) * per).map((a, k) => ({ sarake: i * per + k + 1, id: a.id, kohteita: a.kohteita }));
    const kohteita = asemat.reduce((s, a) => s + a.kohteita, 0);
    const ohjelma = asemat.length === 1 ? fitascOhjelma(speksiArvo(rivit, `RATA${i + 1}_OHJELMA`)) : null;
    const sopii = ohjelma && ohjelma.reduce((s, p) => s + p.sinkut + 2 * p.tuplat, 0) === kohteita;
    return { nro: i + 1, nimi, asemat, kohteita, ...(sopii ? { ohjelma } : {}) };
  });
  if (layoutit.some((l) => l.kohteita < 1 || l.kohteita > MAKS_KOHTEITA)) {
    return { virhe: `KISANSPEKSIT: layoutin kiekkomäärä ei ole välillä 1–${MAKS_KOHTEITA}` };
  }
  return { layoutit };
}

// --- Ryhmän ampujat ---

// Ryhmän ampujat pääsivulta (muotoillut arvot, otsikko rivillä 1): NRO, NIMI ja RYHMÄ otsikon mukaan. Rivin ryhmä on
// Ryhmä-sarakkeen luku, muuten ylöspäin pyöristetty NRO / ryhmäkoko. Nimi, joka on sama kuin oma numero, on vapaa paikka.
// Palauttaa [{ nro, nimi }] numerojärjestyksessä.
// Ryhmän numero solusta: ensimmäinen kokonaisluku, joten muotoiltu ("Ryhmä 3", "3,00") ja muotoilematon arvo (3)
// antavat saman ryhmän (avaus lukee pääsivun muotoiltuna, tallennus muotoilemattomana; ScoringLib readSquads samoin).
export function ryhmaLuku(arvo) {
  const m = String(arvo ?? '').match(/\d+/);
  return m ? Number(m[0]) : Number.NaN;
}

// Layoutin asemajako ("10,8,7"): laite lähettää sen kortin mukana, ja eri jaolla merkityt kortit hylätään (asemataulukkoa
// muutettu, vaikka kiekkojen määrä olisi sama).
export const asemaJako = (layout) => layout.asemat.map((a) => a.kohteita).join(',');

export function ryhmanAmpujat(rivit, ryhma, ryhmaKoko = OLETUS_RYHMAKOKO) {
  const otsikko = (rivit?.[0] || []).map(n);
  const sarake = (nimi, oletus) => {
    const i = otsikko.indexOf(nimi);
    return i >= 0 ? i : oletus;
  };
  const nroS = sarake('NRO', 0);
  const nimiS = sarake('NIMI', 2);
  const ryhmaS = sarake('RYHMA', -1);
  const koko = ryhmaKoko > 0 ? ryhmaKoko : OLETUS_RYHMAKOKO;
  const ampujat = [];
  (rivit || []).slice(1).forEach((rivi) => {
    if (!Array.isArray(rivi)) return;
    const nro = Number.parseInt(rivi[nroS], 10);
    if (!(nro > 0) || nro > MAKS_NRO) return;
    const nimi = puhdasTeksti(rivi[nimiS], 80);
    if (!nimi || nimi === String(nro)) return;
    const taulukosta = ryhmaS >= 0 ? ryhmaLuku(rivi[ryhmaS]) : Number.NaN;
    const oma = taulukosta > 0 ? taulukosta : Math.ceil(nro / koko);
    if (oma === ryhma && !ampujat.some((a) => a.nro === nro)) ampujat.push({ nro, nimi });
  });
  return ampujat.sort((a, b) => a.nro - b.nro);
}

// Ryhmäkoko KISANSPEKSIT-avaimesta AIKATAULURYHMAKOKO (luku), muuten oletus.
export function ryhmaKoko(speksit) {
  const koko = Number.parseInt(speksiArvo(speksit, 'AIKATAULURYHMAKOKO'), 10);
  return koko > 0 ? koko : OLETUS_RYHMAKOKO;
}

// --- Ryhmän layoutit aikataulusta ---

const minuutit = (aika) => {
  const m = String(aika ?? '').trim().match(/^(\d{1,2})[.:](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Ryhmän vuorot ryhmäaikataulusta (Aikataulu-välilehdet välilehtijärjestyksessä): otsikkorivillä "Start" ja layoutien
// nimet, sen alla aikarivit, joiden soluissa "Ryhmä N" tai asemalähdössä "Ryhmä N · asema S" (ryhmä = solun ensimmäinen
// luku, S = lähtöaseman tunnus). Päivät välilehtien järjestyksessä ja ylhäältä alas, rinnakkaiset istunnot lähtöajan
// mukaan (ScoringLib ScoreCardFill.squadRounds).
// aikataulut: [{ nimi, rivit }]. Palauttaa { [layoutin nro]: { kierros (0..), aika, paiva, alkuasema? } }; tyhjä, jos
// ryhmää ei löydy.
export function ryhmanVuorot(aikataulut, layoutit, ryhma) {
  const haetut = new Map(layoutit.map((l) => [n(l.nimi), l.nro]));
  const vuorot = [];
  (aikataulut || []).forEach(({ nimi, rivit }, v) => {
    (rivit || []).forEach((rivi, r) => {
      if (!Array.isArray(rivi)) return;
      rivi.forEach((solu, sc) => {
        if (n(solu) !== 'START') return;
        const sarakkeet = [];
        for (let c = sc + 1; c < rivi.length && haetut.has(n(rivi[c])); c++) sarakkeet.push({ c, nro: haetut.get(n(rivi[c])) });
        for (let rr = r + 1; rr < rivit.length; rr++) {
          const aikaRivi = rivit[rr] || [];
          const aika = minuutit(aikaRivi[sc]);
          if (aika === null) break;
          for (const { c, nro } of sarakkeet) {
            const solu = String(aikaRivi[c] ?? '');
            const m = solu.match(/(\d+)/);
            if (!m || Number(m[1]) !== ryhma || vuorot.some((x) => x.nro === nro)) continue;
            const asema = solu.match(/asema\s*([^\s·,;)]+)/i);
            vuorot.push({ nro, avain: [v, r, aika], aika: String(aikaRivi[sc]).trim(), paiva: nimi, ...(asema ? { alkuasema: asema[1].slice(0, 20) } : {}) });
          }
        }
      });
    });
  });
  vuorot.sort((a, b) => a.avain[0] - b.avain[0] || a.avain[1] - b.avain[1] || a.avain[2] - b.avain[2]);
  return Object.fromEntries(vuorot.map((x, kierros) => [x.nro, {
    kierros, aika: x.aika, paiva: x.paiva, ...(x.alkuasema ? { alkuasema: x.alkuasema } : {})
  }]));
}

// --- Kortit ---

// Kortin merkit: X osuma, O ohi, - ampumatta; yksi merkki per layoutin kiekko.
export const onkoRyhmaMerkit = (merkit, kohteita) => typeof merkit === 'string' && merkit.length === kohteita && /^[XO-]+$/.test(merkit);

// MOBIILI Layout N -otsikko: NRO, NIMI, TULOS, PÄIVITETTY, LAITE, VERSIO, RYHMÄ, HYVÄKSYTTY, asemien tulokset
// (ASEMA <tulossarake>), sitten kiekot <tulossarake>/<kiekko>.
export function ryhmaKorttiOtsikko(layout) {
  return [
    'NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', 'LAITE', 'VERSIO', 'RYHMÄ', 'HYVÄKSYTTY',
    ...layout.asemat.map((a) => `ASEMA ${a.sarake}`),
    ...layout.asemat.flatMap((a) => Array.from({ length: a.kohteita }, (_, k) => `${a.sarake}/${k + 1}`))
  ];
}

// Asemien osumat kortin merkeistä layoutin asemajärjestyksessä.
export function asemienTulokset(layout, merkit) {
  let alku = 0;
  return layout.asemat.map((a) => {
    const osa = merkit.slice(alku, alku + a.kohteita);
    alku += a.kohteita;
    return [...osa].filter((m) => m === 'X').length;
  });
}

export function ryhmaKorttiRivi(layout, { nro, nimi, merkit, versio, laite, aika, ryhma, hyvaksytty }) {
  const asemat = asemienTulokset(layout, merkit);
  return [nro, nimi || '', asemat.reduce((s, x) => s + x, 0), aika, laite, versio, ryhma, hyvaksytty || '',
    ...asemat, ...[...merkit].map((m) => (m === '-' ? '' : m))];
}

// MOBIILI Layout N -rivi → { nro, merkit, versio, laite, aika, hyvaksytty } tai null (tyhjä rivi).
export function lueRyhmaKorttiRivi(rivi, layout) {
  if (!Array.isArray(rivi)) return null;
  const nro = Number.parseInt(rivi[0], 10);
  if (!Number.isInteger(nro)) return null;
  const alku = RYHMA_META + layout.asemat.length;
  const merkit = Array.from({ length: layout.kohteita }, (_, i) => {
    const m = String(rivi[alku + i] ?? '').trim().toUpperCase();
    return m === 'X' || m === 'O' ? m : '-';
  }).join('');
  const versio = Number(rivi[5]);
  return {
    nro,
    merkit,
    versio: Number.isFinite(versio) ? versio : 0,
    laite: String(rivi[4] ?? ''),
    aika: String(rivi[3] ?? ''),
    hyvaksytty: String(rivi[7] ?? '').trim()
  };
}

// Tarkistaa ryhmän tallennuksen rungon: { laite, haltija, kortit: [{ layout, nro, merkit, versio, hyvaksytty }] }.
// Kiekkojen määrä tarkistetaan layoutia vasten api/kirjaus.js:ssä. hyvaksytty = ampujan hyväksynnän aika (ms), true
// (taulukosta saatu hyväksyntä, aika säilyy) tai puuttuu.
// Palauttaa { laite, haltija, kortit } tai { virhe }.
export const MAKS_RYHMAKORTTEJA = 60;
const HYVAKSYNTA_MIN_MS = Date.UTC(2020, 0, 1);
export function tarkistaRyhmaTallennus(runko, onLaitetunnus) {
  const laite = typeof runko?.laite === 'string' ? runko.laite : '';
  if (!onLaitetunnus(laite)) return { virhe: 'Laitteen tunnus puuttuu' };
  const haltija = typeof runko?.haltija === 'string' ? runko.haltija.slice(0, 200) : '';
  const kortit = runko?.kortit ?? [];
  if (!Array.isArray(kortit)) return { virhe: 'Ei kortteja' };
  if (kortit.length > MAKS_RYHMAKORTTEJA) return { virhe: `Enintään ${MAKS_RYHMAKORTTEJA} korttia kerralla` };
  const nahty = new Set();
  for (const k of kortit) {
    if (!Number.isInteger(k?.layout) || k.layout < 1 || k.layout > MAKS_LAYOUT) return { virhe: 'Virheellinen layout' };
    if (!Number.isInteger(k.nro) || k.nro < 1 || k.nro > MAKS_NRO) return { virhe: 'Virheellinen ampujan numero' };
    const tunnus = `${k.layout}:${k.nro}`;
    if (nahty.has(tunnus)) return { virhe: 'Sama kortti kahdesti' };
    nahty.add(tunnus);
    if (typeof k.merkit !== 'string' || !/^[XO-]{1,200}$/.test(k.merkit)) return { virhe: 'Virheelliset merkinnät' };
    if (!Number.isSafeInteger(k.versio) || k.versio < 1) return { virhe: 'Virheellinen versio' };
    if (k.hyvaksytty !== undefined && k.hyvaksytty !== null && k.hyvaksytty !== true && k.hyvaksytty !== false
      && (!Number.isSafeInteger(k.hyvaksytty) || k.hyvaksytty < HYVAKSYNTA_MIN_MS)) return { virhe: 'Virheellinen hyväksyntä' };
    if (k.jako !== undefined && (typeof k.jako !== 'string' || !/^\d{1,3}(,\d{1,3}){0,49}$/.test(k.jako))) return { virhe: 'Virheellinen asemajako' };
  }
  return {
    laite,
    haltija,
    kortit: kortit.map((k) => ({
      layout: k.layout, nro: k.nro, merkit: k.merkit, versio: k.versio, hyvaksytty: k.hyvaksytty || null, ...(k.jako ? { jako: k.jako } : {})
    }))
  };
}
