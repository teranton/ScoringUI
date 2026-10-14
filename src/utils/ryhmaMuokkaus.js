// src/utils/ryhmaMuokkaus.js
// Ryhmien muokkaus: ampujien paikat pääsivun osallistujariveillä (nimetty alue OSALLISTUJAT).
// Ryhmä ja ampujanumero tulevat taulukossa rivin paikasta (Sporting/ESP: ROUNDUP(SEQUENCE()/ryhmäkoko),
// Compak: aikataulun kaavat viittaavat pääsivun riveihin), joten kahden ampujan vaihto ryhmien välillä
// on kahden rivin sisällön vaihto. Kaavoja ja kaavojen täyttämiä soluja ei kosketa.

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

// rowData: spreadsheets.get-vastauksen sheets[0].data[0].rowData (otsikkorivi ensin).
// Palauttaa ampujat paikkajärjestyksessä. Paikka on rivin järjestysnumero alueella (0 = ensimmäinen).
export function parsiOsallistujat(rowData, alue) {
  const rivit = Array.isArray(rowData) ? rowData : [];
  const sarakkeet = etsiSarakkeet(rivit[0]?.values || []);
  const ampujat = [];
  const maara = alue.loppuRivi - alue.alkuRivi;
  for (let paikka = 0; paikka < maara; paikka++) {
    const solut = rivit[paikka + 1]?.values || [];
    const nimiSolu = solut[sarakkeet.nimi];
    const nimi = solunTeksti(nimiSolu);
    // Kuten arvonnassa: tyhjä, kaava tai pelkkä numero ei ole ampuja. Kaavan täyttämää nimeä ei voi siirtää.
    if (!nimi || onKaava(nimiSolu) || onKaavanTayttama(nimiSolu) || !Number.isNaN(Number(nimi))) continue;
    const ryhma = sarakkeet.ryhma >= 0 ? parseInt(solunTeksti(solut[sarakkeet.ryhma]), 10) : NaN;
    ampujat.push({
      paikka,
      rivi: alue.alkuRivi + paikka,
      nro: sarakkeet.nro >= 0 ? solunTeksti(solut[sarakkeet.nro]) : '',
      ryhma: Number.isFinite(ryhma) && ryhma > 0 ? ryhma : null,
      nimi,
      sarja: sarakkeet.sarja >= 0 ? solunTeksti(solut[sarakkeet.sarja]) : '',
      seura: sarakkeet.seura >= 0 ? solunTeksti(solut[sarakkeet.seura]) : '',
      onTuloksia: sarakkeet.tulokset.some((i) => solunTeksti(solut[i]) !== ''),
      solut
    });
  }
  return { sarakkeet, ampujat };
}

// Ryhmät taulukon Ryhmä-sarakkeesta, jos se on, muuten paikoista: paikat 0..koko-1 ovat ryhmä 1 jne.
// Ryhmät, joissa ei ole ketään, jätetään pois.
export function muodostaRyhmat(ampujat, koko) {
  const ryhmat = new Map();
  for (const ampuja of ampujat) {
    const numero = ampuja.ryhma ?? Math.floor(ampuja.paikka / koko) + 1;
    if (!ryhmat.has(numero)) ryhmat.set(numero, { numero, ampujat: [] });
    ryhmat.get(numero).ampujat.push(ampuja);
  }
  return [...ryhmat.values()].sort((a, b) => a.numero - b.numero);
}

// Vaihdettavat sarakkeet: kummassakaan rivissä ei ole kaavaa eikä kaavan täyttämää arvoa,
// ja ainakin toisessa on jotain. Tyhjä solu siirtyy tyhjänä. Vain sarakkeet 0..leveys-1 (etsiSarakkeet).
export function vaihdettavatSarakkeet(solutA, solutB, leveys) {
  const sarakkeet = [];
  for (let i = 0; i < leveys; i++) {
    const a = solutA[i];
    const b = solutB[i];
    if (onKaava(a) || onKaava(b) || onKaavanTayttama(a) || onKaavanTayttama(b)) continue;
    if (!a?.userEnteredValue && !b?.userEnteredValue) continue;
    sarakkeet.push(i);
  }
  return sarakkeet;
}

// Sarakkeet, joissa toisella rivillä on kaava ja toisella syötetty arvo. Niitä ei voi vaihtaa,
// joten vaihto jäisi osittaiseksi: se torjutaan.
export function ristiriitaisetSarakkeet(solutA, solutB, leveys) {
  const sarakkeet = [];
  for (let i = 0; i < leveys; i++) {
    const a = solutA[i];
    const b = solutB[i];
    const syotettyA = Boolean(a?.userEnteredValue) && !onKaava(a);
    const syotettyB = Boolean(b?.userEnteredValue) && !onKaava(b);
    if ((onKaava(a) && syotettyB) || (onKaava(b) && syotettyA)) sarakkeet.push(i);
  }
  return sarakkeet;
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

const syote = (solu) => (solu?.userEnteredValue ? { userEnteredValue: solu.userEnteredValue } : {});

// batchUpdate-pyynnöt, jotka vaihtavat kahden ampujan rivien syötetyt arvot (muotoilut jäävät paikalleen).
export function vaihtoPyynnot(sheetId, ampujaA, ampujaB, leveys) {
  const sarakkeet = vaihdettavatSarakkeet(ampujaA.solut, ampujaB.solut, leveys);
  const pyynnot = [];
  for (const [kohde, lahde] of [[ampujaA, ampujaB], [ampujaB, ampujaA]]) {
    for (const { alku, loppu } of jaksot(sarakkeet)) {
      const values = [];
      for (let i = alku; i < loppu; i++) values.push(syote(lahde.solut[i]));
      pyynnot.push({
        updateCells: {
          range: { sheetId, startRowIndex: kohde.rivi, endRowIndex: kohde.rivi + 1, startColumnIndex: alku, endColumnIndex: loppu },
          rows: [{ values }],
          fields: 'userEnteredValue'
        }
      });
    }
  }
  return pyynnot;
}

// Tarkistaa tuoreesta datasta, että vaihdettavat ampujat ovat yhä samoilla riveillä, kummallakaan ei ole tuloksia,
// eikä samassa sarakkeessa ole toisella kaavaa ja toisella syötettyä arvoa.
// Palauttaa { ok: true, a, b } tai { ok: false, syy: 'muuttunut' | 'tuloksia' | 'kaavoja' }.
export function tarkistaVaihto(ampujat, odotettuA, odotettuB, leveys = Infinity) {
  const rivilla = (odotettu) => ampujat.find((x) => x.rivi === odotettu.rivi && x.nimi === odotettu.nimi);
  const a = rivilla(odotettuA);
  const b = rivilla(odotettuB);
  if (!a || !b || a.rivi === b.rivi) return { ok: false, syy: 'muuttunut' };
  if (a.onTuloksia || b.onTuloksia) return { ok: false, syy: 'tuloksia' };
  const raja = Math.min(leveys, Math.max(a.solut.length, b.solut.length));
  if (ristiriitaisetSarakkeet(a.solut, b.solut, raja).length) return { ok: false, syy: 'kaavoja' };
  return { ok: true, a, b };
}

// Näkymän välitön päivitys ennen tallennuksen valmistumista: ampujat vaihtavat paikkaa ja numeroa.
export function vaihdaPaikallisesti(ampujat, a, b) {
  return ampujat.map((x) => {
    if (x.rivi === a.rivi) return { ...b, paikka: a.paikka, rivi: a.rivi, nro: a.nro, ryhma: a.ryhma };
    if (x.rivi === b.rivi) return { ...a, paikka: b.paikka, rivi: b.rivi, nro: b.nro, ryhma: b.ryhma };
    return x;
  });
}
