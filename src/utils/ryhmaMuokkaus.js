// src/utils/ryhmaMuokkaus.js
// Ryhmien muokkaus: ampujien paikat pääsivun osallistujariveillä (nimetty alue OSALLISTUJAT).
// Ryhmä ja ampujanumero tulevat taulukossa rivin paikasta (Sporting/ESP: ROUNDUP(SEQUENCE()/ryhmäkoko),
// NRO: SEQUENCE(COUNTA(nimet)), Compak: aikataulun kaavat viittaavat pääsivun riveihin), joten ampujan
// siirto on rivien sisällön siirto. Vapaa paikka on rivi, jonka nimenä on sen oma numero (kuten arvonnassa
// ja Compak-aikataulussa), jotta numerointi pysyy yhtenäisenä. Kaavoja ja kaavojen täyttämiä soluja ei kosketa.

export const OSALLISTUJA_ALUE = 'OSALLISTUJAT';

const normalisoi = (teksti) => String(teksti || '').trim().toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

// Ryhmäkoko KISANSPEKSIT-asetuksesta AIKATAULU_RYHMAKOKO ('group5' / 'group6' / 'inline').
// INLINE (Compak) näytetään viiden ryhminä kuten aikataulun ryhmänäkymässä.
export function ryhmaKokoAsetuksesta(ryhmittely) {
  return ryhmittely === 'group6' ? 6 : 5;
}

// Nimetyn alueen OSALLISTUJAT välilehti ja rivit taulukon metatiedoista
// (spreadsheets.get: namedRanges, sheets.properties(sheetId,title,gridProperties.rowCount)).
// Avoimen alueen (esim. A2:E) loppu on välilehden viimeinen rivi.
export function etsiOsallistujaAlue(meta) {
  const alue = (meta?.namedRanges || []).find((r) => normalisoi(r.name) === OSALLISTUJA_ALUE);
  if (!alue) throw new Error(`Taulukosta puuttuu nimetty alue ${OSALLISTUJA_ALUE}.`);
  const { sheetId = 0, startRowIndex = 0, endRowIndex } = alue.range || {};
  const valilehti = (meta.sheets || []).find((s) => (s.properties?.sheetId ?? 0) === sheetId);
  if (!valilehti) throw new Error(`Alueen ${OSALLISTUJA_ALUE} välilehteä ei löytynyt.`);
  const loppuRivi = endRowIndex || valilehti.properties?.gridProperties?.rowCount || 0;
  if (startRowIndex < 1) throw new Error(`Alueen ${OSALLISTUJA_ALUE} yläpuolella pitää olla otsikkorivi.`);
  if (loppuRivi <= startRowIndex) {
    throw new Error(`Alueella ${OSALLISTUJA_ALUE} ei ole rivejä.`);
  }
  return {
    sheetId,
    otsikko: valilehti.properties.title,
    otsikkoRivi: startRowIndex - 1, // 0-pohjainen
    alkuRivi: startRowIndex,
    loppuRivi // ei mukana
  };
}

// A1-alue otsikkoriviltä alueen loppuun, koko leveydeltä.
export function osallistujaAlueA1(alue) {
  const nimi = `'${String(alue.otsikko).replace(/'/g, "''")}'`;
  return `${nimi}!${alue.otsikkoRivi + 1}:${alue.loppuRivi}`;
}

const solunTeksti = (solu) => String(solu?.formattedValue ?? '').trim();
const onKaava = (solu) => solu?.userEnteredValue?.formulaValue !== undefined;
// Taulukkokaavan (ARRAYFORMULA, SEQUENCE ...) täyttämällä solulla on arvo mutta ei omaa syötettä.
const onKaavanTayttama = (solu) => !solu?.userEnteredValue && solunTeksti(solu) !== '';

// Sarakkeet otsikkorivin nimistä samoin kuin ScoringLibin arvonnassa (Distributor.js).
export function etsiSarakkeet(otsikkoSolut) {
  const otsikot = (otsikkoSolut || []).map((s) => solunTeksti(s).toLowerCase());
  const etsi = (sanat) => otsikot.findIndex((o) => sanat.some((sana) => o.includes(sana)));
  const nimi = etsi(['nimi', 'name', 'osallistuja']);
  if (nimi === -1) throw new Error('Pääsivulta ei löytynyt NIMI-saraketta.');
  const nro = otsikot.findIndex((o) => ['NRO', 'NUMERO', 'KILPAILUNUMERO', 'NO'].includes(normalisoi(o)));
  // Ampujan tiedot ovat otsikoiden yhtenäisessä lohkossa. Ensimmäisen tyhjän otsikon jälkeen tulee muuta,
  // esim. Ohjeita-sarake, jonka tekstit eivät kuulu kenellekään ampujalle.
  const tyhja = otsikot.findIndex((o) => o === '');
  return {
    leveys: tyhja === -1 ? otsikot.length : tyhja,
    nro,
    nimi,
    // Sporting/ESP: Ryhmä-sarakkeen kaava ROUNDUP(SEQUENCE()/ryhmäkoko) kertoo taulukon oman ryhmän.
    ryhma: otsikot.findIndex((o) => normalisoi(o) === 'RYHMA'),
    sarja: etsi(['sarja', 'category']),
    seura: etsi(['seura', 'club']),
    // Asemien tulossarakkeiden otsikot ovat luvut 1..N.
    tulokset: otsikot.map((o, i) => (/^\d+$/.test(o) ? i : -1)).filter((i) => i >= 0)
  };
}

// Paikan tyyppi: 'ampuja', 'vapaa' (nimenä numero), 'tyhja' (ei nimeä) tai 'lukittu' (nimi tulee kaavasta).
// Vapaan paikan numero luetaan syötteestä, jotta sarakkeen numeromuotoilu ("12,00") ei muuta sitä.
function paikanTyyppi(nimiSolu) {
  const nimi = solunTeksti(nimiSolu);
  if (onKaava(nimiSolu) || onKaavanTayttama(nimiSolu)) return nimi ? 'lukittu' : 'tyhja';
  if (!nimi) return 'tyhja';
  return typeof nimiSolu?.userEnteredValue?.numberValue === 'number' || /^\d+$/.test(nimi) ? 'vapaa' : 'ampuja';
}

const paikanNimi = (nimiSolu, tyyppi) => {
  const luku = nimiSolu?.userEnteredValue?.numberValue;
  return tyyppi === 'vapaa' && typeof luku === 'number' ? String(luku) : solunTeksti(nimiSolu);
};

// Vapaan paikan nimi: paikan oma numero (sama kuin arvonnassa).
export const vapaanPaikanNimi = (paikka) => String(Number(paikka.nro) || paikka.paikka + 1);

// Ampujan paikka: nimi syötetty tai kaavasta.
export const onAmpuja = (p) => p.tyyppi === 'ampuja' || p.tyyppi === 'lukittu';

// rowData: spreadsheets.get-vastauksen sheets[0].data[0].rowData (otsikkorivi ensin).
// Palauttaa alueen kaikki paikat järjestyksessä. Paikka on rivin järjestysnumero alueella (0 = ensimmäinen).
export function parsiOsallistujat(rowData, alue) {
  const rivit = Array.isArray(rowData) ? rowData : [];
  const sarakkeet = etsiSarakkeet(rivit[0]?.values || []);
  const paikat = [];
  const maara = alue.loppuRivi - alue.alkuRivi;
  for (let paikka = 0; paikka < maara; paikka++) {
    const solut = rivit[paikka + 1]?.values || [];
    const nimiSolu = solut[sarakkeet.nimi];
    const tyyppi = paikanTyyppi(nimiSolu);
    const ryhma = sarakkeet.ryhma >= 0 ? parseInt(solunTeksti(solut[sarakkeet.ryhma]), 10) : NaN;
    const nro = sarakkeet.nro >= 0 ? solunTeksti(solut[sarakkeet.nro]) : '';
    paikat.push({
      paikka,
      rivi: alue.alkuRivi + paikka,
      // Tyhjän rivin numero on se, jonka SEQUENCE antaa, kun rivi täytetään.
      nro: nro || String(paikka + 1),
      ryhma: Number.isFinite(ryhma) && ryhma > 0 ? ryhma : null,
      tyyppi,
      // Tyhjä rivi, jonka nimisolussa on kaava: sinne ei voi kirjoittaa.
      kaavaNimi: onKaava(nimiSolu) || onKaavanTayttama(nimiSolu),
      nimi: paikanNimi(nimiSolu, tyyppi),
      sarja: onAmpuja({ tyyppi }) && sarakkeet.sarja >= 0 ? solunTeksti(solut[sarakkeet.sarja]) : '',
      seura: onAmpuja({ tyyppi }) && sarakkeet.seura >= 0 ? solunTeksti(solut[sarakkeet.seura]) : '',
      onTuloksia: tyyppi === 'ampuja' && sarakkeet.tulokset.some((i) => solunTeksti(solut[i]) !== ''),
      solut
    });
  }
  return { sarakkeet, paikat, ampujat: paikat.filter((p) => p.tyyppi === 'ampuja') };
}

const ryhmanNumero = (p, koko) => p.ryhma ?? Math.floor(p.paikka / koko) + 1;

// Ryhmäkoko, jolla paikat jaetaan: asetuksen koko tai suurin ryhmä, jos taulukossa on isompia (Ryhmä-sarake).
export function laskeRyhmaKoko(paikat, kokoAsetus) {
  const laskuri = new Map();
  for (const p of paikat) {
    if (p.tyyppi === 'tyhja') continue;
    const n = ryhmanNumero(p, kokoAsetus);
    laskuri.set(n, (laskuri.get(n) || 0) + 1);
  }
  return { koko: Math.max(kokoAsetus, ...laskuri.values()), ryhmat: laskuri };
}

// Ryhmät paikkoineen. Ryhmä tulee taulukon Ryhmä-sarakkeesta, jos se on, muuten paikasta (0..koko-1 = ryhmä 1).
// Mukana ovat ryhmät, joissa on ampuja tai vapaa paikka; viimeisen ryhmän loppuun jäävät tyhjät rivit
// näytetään vapaina paikkoina. Ryhmän koko on asetuksen koko tai suurin ryhmä, jos taulukossa on isompia.
export function muodostaRyhmat(paikat, kokoAsetus) {
  const { koko, ryhmat: laskuri } = laskeRyhmaKoko(paikat, kokoAsetus);
  const ryhmat = new Map();
  for (const p of paikat) {
    const numero = ryhmanNumero(p, koko);
    // Tyhjä kaavarivi ei ole vapaa paikka, koska sinne ei voi kirjoittaa.
    if (!laskuri.has(numero) || (p.tyyppi === 'tyhja' && p.kaavaNimi)) continue;
    if (!ryhmat.has(numero)) ryhmat.set(numero, { numero, koko, paikat: [] });
    ryhmat.get(numero).paikat.push(p);
  }
  return [...ryhmat.values()]
    .map((r) => ({ ...r, ampujia: r.paikat.filter(onAmpuja).length }))
    .sort((a, b) => a.numero - b.numero);
}

// Ryhmän täyttöaste värikoodia varten: 'taysi', 'lahes' (yksi vapaa), 'vajaa' (2+ vapaata) tai 'tyhja'.
export function ryhmanTayttoaste(ryhma) {
  if (ryhma.ampujia === 0) return 'tyhja';
  if (ryhma.ampujia >= ryhma.koko) return 'taysi';
  return ryhma.ampujia === ryhma.koko - 1 ? 'lahes' : 'vajaa';
}

// Siirtosuunnitelma: mitä kullekin riville kirjoitetaan. sijoitukset: [{ kohde: paikka, lahde: paikka | null }],
// jossa null tarkoittaa vapaata paikkaa (nimenä kohderivin numero).
//  - kohde on vapaa tai tyhjä paikka: ampuja siirtyy sinne ja hänen paikkansa vapautuu ('siirto');
//    välissä olevat tyhjät rivit merkitään vapaiksi, jotta numerointi pysyy yhtenäisenä,
//  - kohde on ampuja samassa ryhmässä: ampuja siirtyy kohteen paikalle ja väliin jäävät siirtyvät yhdellä ('jarjestys'),
//  - kohde on ampuja toisessa ryhmässä: ampujat vaihtavat paikkaa ('vaihto').
// Palauttaa { ok: true, toiminto, sijoitukset } tai { ok: false, syy: 'muuttunut' | 'tuloksia' | 'lukittu' }
// ('lukittu': muutettavalla rivillä nimi tulee kaavasta).
export function suunnitteleSiirto(paikat, lahdeRivi, kohdeRivi, koko) {
  const rivilla = new Map(paikat.map((p) => [p.rivi, p]));
  const lahde = rivilla.get(lahdeRivi);
  const kohde = rivilla.get(kohdeRivi);
  if (!lahde || !kohde || lahde.rivi === kohde.rivi) return { ok: false, syy: 'muuttunut' };
  if (lahde.tyyppi === 'lukittu') return { ok: false, syy: 'lukittu' };
  if (lahde.tyyppi !== 'ampuja') return { ok: false, syy: 'muuttunut' };
  const sisalto = (p) => (p.tyyppi === 'ampuja' ? p : null);
  let toiminto;
  let sijoitukset;
  if (kohde.tyyppi === 'vapaa' || kohde.tyyppi === 'tyhja') {
    toiminto = 'siirto';
    const valissa = paikat.filter((p) => p.tyyppi === 'tyhja' && p.paikka < kohde.paikka);
    sijoitukset = [{ kohde, lahde }, { kohde: lahde, lahde: null }, ...valissa.map((p) => ({ kohde: p, lahde: null }))];
  } else if (ryhmanNumero(kohde, koko) === ryhmanNumero(lahde, koko)) {
    toiminto = 'jarjestys';
    const alas = lahde.paikka < kohde.paikka;
    const [alku, loppu] = alas ? [lahde.paikka, kohde.paikka] : [kohde.paikka, lahde.paikka];
    const paikalla = new Map(paikat.map((p) => [p.paikka, p]));
    sijoitukset = [];
    for (let i = alku; i <= loppu; i++) {
      const rivi = paikalla.get(i);
      if (i === kohde.paikka) sijoitukset.push({ kohde: rivi, lahde });
      else sijoitukset.push({ kohde: rivi, lahde: sisalto(paikalla.get(alas ? i + 1 : i - 1)) });
    }
  } else {
    toiminto = 'vaihto';
    sijoitukset = [{ kohde, lahde }, { kohde: lahde, lahde: kohde }];
  }
  if (sijoitukset.some(({ kohde: k }) => k.tyyppi === 'lukittu' || k.kaavaNimi)) return { ok: false, syy: 'lukittu' };
  if (sijoitukset.some(({ kohde: k, lahde: l }) => k.onTuloksia || l?.onTuloksia)) return { ok: false, syy: 'tuloksia' };
  return { ok: true, toiminto, sijoitukset };
}

// Peräkkäiset sarakkeet yhdeksi alueeksi.
function jaksot(sarakkeet) {
  const tulos = [];
  for (const s of sarakkeet) {
    const viimeinen = tulos[tulos.length - 1];
    if (viimeinen && viimeinen.loppu === s) viimeinen.loppu = s + 1;
    else tulos.push({ alku: s, loppu: s + 1 });
  }
  return tulos;
}

const syote = (solu) => (solu?.userEnteredValue && !onKaava(solu) ? { userEnteredValue: solu.userEnteredValue } : {});
const onSyotetty = (solu) => Boolean(solu?.userEnteredValue) && !onKaava(solu);

// batchUpdate-pyynnöt sijoituksille: syötetyt arvot kopioidaan lähteen riviltä kohteen riville sarakkeisiin
// 0..leveys-1 (muotoilut jäävät paikalleen). Vapaan paikan nimeksi tulee kohderivin numero ja muut solut tyhjenevät.
// Kohteen kaava- ja kaavan täyttämiin soluihin ei kirjoiteta. Jos siirto jäisi siksi osittaiseksi (lähteessä kaava
// tai syötetty arvo sarakkeessa, jota kohteeseen ei voi kirjoittaa), palautetaan { ok: false, syy: 'kaavoja' }.
export function siirtoPyynnot(sheetId, sijoitukset, sarakkeet) {
  const pyynnot = [];
  for (const { kohde, lahde } of sijoitukset) {
    const uudet = new Map();
    for (let i = 0; i < sarakkeet.leveys; i++) {
      const vanha = kohde.solut[i];
      const kirjoitettava = !onKaava(vanha) && !onKaavanTayttama(vanha);
      let uusi;
      if (lahde) {
        const solu = lahde.solut[i];
        if (onKaava(solu) && kirjoitettava) return { ok: false, syy: 'kaavoja' };
        if (!kirjoitettava) {
          if (onSyotetty(solu)) return { ok: false, syy: 'kaavoja' };
          continue;
        }
        uusi = syote(solu);
      } else {
        if (!kirjoitettava) continue;
        uusi = i === sarakkeet.nimi ? { userEnteredValue: { numberValue: Number(vapaanPaikanNimi(kohde)) } } : {};
      }
      if (!uusi.userEnteredValue && !vanha?.userEnteredValue) continue;
      uudet.set(i, uusi);
    }
    for (const { alku, loppu } of jaksot([...uudet.keys()])) {
      const values = [];
      for (let i = alku; i < loppu; i++) values.push(uudet.get(i));
      pyynnot.push({
        updateCells: {
          range: { sheetId, startRowIndex: kohde.rivi, endRowIndex: kohde.rivi + 1, startColumnIndex: alku, endColumnIndex: loppu },
          rows: [{ values }],
          fields: 'userEnteredValue'
        }
      });
    }
  }
  return { ok: true, pyynnot };
}

// Mitä nimisoluissa pitää lukea sijoitusten jälkeen (kumoamisen tarkistukseen).
export function odotetutNimet(sijoitukset) {
  return sijoitukset.map(({ kohde, lahde }) => ({ rivi: kohde.rivi, nimi: lahde ? lahde.nimi : vapaanPaikanNimi(kohde) }));
}

// Täsmäävätkö rivien nimet odotettuihin (tuore data ennen kirjoitusta).
export function nimetTasmaavat(paikat, odotetut) {
  const rivilla = new Map(paikat.map((p) => [p.rivi, p]));
  return odotetut.every(({ rivi, nimi }) => (rivilla.get(rivi)?.nimi ?? null) === nimi);
}

// Kumoaminen: sijoitukset, jotka palauttavat rivit ennen siirtoa luettuun tilaan.
// tuoreet: nykyiset paikat; ennen: siirron sijoitusten kohteet sellaisina kuin ne olivat ennen kirjoitusta.
export function kumoaSijoitukset(tuoreet, ennen) {
  const rivilla = new Map(tuoreet.map((p) => [p.rivi, p]));
  return ennen.map((vanha) => ({ kohde: rivilla.get(vanha.rivi), lahde: vanha }))
    .filter((s) => s.kohde);
}

// Näkymän välitön päivitys ennen tallennuksen valmistumista. Paikka, rivi, numero ja ryhmä kuuluvat riville.
export function sovellaPaikallisesti(paikat, sijoitukset) {
  const uudet = new Map(sijoitukset.map(({ kohde, lahde }) => [kohde.rivi, lahde]));
  return paikat.map((p) => {
    if (!uudet.has(p.rivi)) return p;
    const lahde = uudet.get(p.rivi);
    const paikanTiedot = { paikka: p.paikka, rivi: p.rivi, nro: p.nro, ryhma: p.ryhma };
    if (!lahde) {
      return { ...p, ...paikanTiedot, tyyppi: 'vapaa', nimi: vapaanPaikanNimi(p), sarja: '', seura: '', onTuloksia: false };
    }
    return { ...lahde, ...paikanTiedot };
  });
}
