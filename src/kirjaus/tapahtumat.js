// Mobiilikirjauksen tapahtumat kortilla: toimintahäiriöt ja varoitukset (Compak-kortti ja ryhmäpuhelimen
// layoutkortti). Tapahtuma kuuluu kortin kiekkoon i (0-alkuinen), jotta laite näyttää sen kiekon sävynä.
//   H  toimintahäiriö, kiekko uusitaan (ei merkintää kiekkoon)
//   N  toimintahäiriö rajan yli: kiekko merkitään nollaksi
//   V  varoitus (tuomarin). Ensimmäinen ei vaikuta tulokseen; seuraavasta kiekko merkitään yleensä nollaksi
//      (laite kysyy, merkki O kiekkoon). Tapahtumat eivät muuta tulosta: tulos on kiekkojen osumat.
// Taulukossa (sarake TAPAHTUMAT) puolipisteillä: "H5; N12; V12 Ase auki; V20 Myöhästyi" (kiekot 1-alkuisina).
// Puhtaat funktiot, käytössä laitteella ja API:ssa (tapahtumat.test.js).

export const TYYPIT = ['H', 'N', 'V'];
export const OLETUS_HAIRIORAJA = 2;
export const MAKS_TAPAHTUMIA = 40;
export const MAKS_SYY = 60;

const puhdasSyy = (syy) => String(syy ?? '').replace(/[;\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAKS_SYY);

// Tapahtumateksti → [{ t, i, syy? }]. Virheelliset osat jätetään pois.
export function jasennaTapahtumat(teksti) {
  if (Array.isArray(teksti)) return teksti;
  return String(teksti ?? '').split(';').flatMap((osa) => {
    const m = osa.trim().match(/^([HNV])(\d{1,3})(?:\s+(.*))?$/i);
    if (!m) return [];
    const i = Number(m[2]) - 1;
    if (i < 0) return [];
    const t = m[1].toUpperCase();
    const syy = puhdasSyy(m[3]);
    return [{ t, i, ...(syy ? { syy } : {}) }];
  }).slice(0, MAKS_TAPAHTUMIA);
}

// [{ t, i, syy? }] → teksti (tyhjä, kun tapahtumia ei ole).
export function tapahtumaTeksti(tapahtumat) {
  return jasennaTapahtumat(tapahtumat).map((x) => {
    const syy = puhdasSyy(x.syy);
    return `${x.t}${x.i + 1}${syy ? ` ${syy}` : ''}`;
  }).join('; ');
}

// Onko teksti kelvollinen tapahtumalista kortille, jolla on kohteita kiekkoa (tyhjä kelpaa).
export function onkoTapahtumat(teksti, kohteita) {
  if (teksti === undefined || teksti === null || teksti === '') return true;
  if (typeof teksti !== 'string' || teksti.length > MAKS_TAPAHTUMIA * (MAKS_SYY + 10)) return false;
  const osat = teksti.split(';').map((x) => x.trim()).filter(Boolean);
  const lista = jasennaTapahtumat(teksti);
  return osat.length === lista.length && lista.every((x) => x.i < kohteita);
}

// Kanoninen muoto (vertailuun ja tallennukseen).
export const normalisoi = (teksti) => tapahtumaTeksti(jasennaTapahtumat(teksti));

// Toimintahäiriöt kiekoilta alku..loppu-1 (oletus koko kortti; English Sporting laskee asemittain).
export const hairiot = (tapahtumat, alku = 0, loppu = Infinity) => jasennaTapahtumat(tapahtumat)
  .filter((x) => (x.t === 'H' || x.t === 'N') && x.i >= alku && x.i < loppu).length;
export const varoitukset = (tapahtumat) => jasennaTapahtumat(tapahtumat).filter((x) => x.t === 'V').length;

export const kiekonTapahtumat = (tapahtumat, i) => jasennaTapahtumat(tapahtumat).filter((x) => x.i === i);

// Kiekon sävy laitteella: vahvin tapahtuma (varoitus > häiriö) tai null.
export function kiekonKorostus(tapahtumat, i) {
  const omat = kiekonTapahtumat(tapahtumat, i).map((x) => x.t);
  if (omat.includes('V')) return 'varoitus';
  if (omat.includes('H') || omat.includes('N')) return 'hairio';
  return null;
}

// Kiekon sävy kulmakolmiona (kiekon väri näkyy yhä): inline-tyyli laitteen ruudulle.
export const KOROSTUSVARIT = { hairio: '#f59e0b', varoitus: '#a855f7' };
export const KOROSTUSNIMET = { hairio: 'toimintahäiriö', varoitus: 'varoitus' };
export function korostusTyyli(korostus) {
  const vari = KOROSTUSVARIT[korostus];
  return vari ? { backgroundImage: `linear-gradient(225deg, ${vari} 0 38%, transparent 38%)` } : undefined;
}

// Kiekon tapahtumat luettavana tekstinä (aria-label, kuittaus).
export function kiekonSelite(tapahtumat, i) {
  return kiekonTapahtumat(tapahtumat, i).map((x) => {
    const nimi = x.t === 'H' ? 'toimintahäiriö' : x.t === 'N' ? 'toimintahäiriö yli rajan (nolla)' : 'varoitus';
    return x.syy ? `${nimi}: ${x.syy}` : nimi;
  }).join(', ');
}

// FITASCin säännöt (Compak ja FITASC Sporting): 1 toimintahäiriö per 25 kiekon layout.
export const FITASC_HAIRIORAJA = 1;

// Sallitut toimintahäiriöt per kortti KISANSPEKSIT-avaimesta TOIMINTAHAIRIOT (0..9). Ilman avainta lajin mukaan:
// COMPAK ja FITASC 1 per layout (FITASCin säännöt), ESP 2 per asema, muut 2 per kortti (Compak-rata tai ryhmän layout).
// Raja lasketaan asemittain (English Sporting: 2 per asema), muuten per kortti.
export const hairiotAsemittain = (tyyppi) => String(tyyppi ?? '').trim().toUpperCase() === 'ESP';

export function hairioRaja(arvo, tyyppi = '') {
  const t = String(arvo ?? '').trim();
  if (/^\d$/.test(t)) return Number(t);
  return ['COMPAK', 'FITASC'].includes(String(tyyppi ?? '').trim().toUpperCase()) ? FITASC_HAIRIORAJA : OLETUS_HAIRIORAJA;
}

// Kortilla on jo enimmäismäärä tapahtumia: uutta ei voi lisätä (laite kertoo sen kirjaajalle).
export const taynna = (tapahtumat) => jasennaTapahtumat(tapahtumat).length >= MAKS_TAPAHTUMIA;
export const TAYNNA_VIESTI = `Kortilla on jo ${MAKS_TAPAHTUMIA} häiriötä tai varoitusta. Kirjaa lisät paperille ja kerro toimistolle.`;

export function lisaa(tapahtumat, tapahtuma) {
  return tapahtumaTeksti([...jasennaTapahtumat(tapahtumat), tapahtuma]);
}

// Poistaa kiekon i tapahtumat (tyypit: vain nämä; oletus kaikki).
export function poista(tapahtumat, i, tyypit = TYYPIT) {
  return tapahtumaTeksti(jasennaTapahtumat(tapahtumat).filter((x) => x.i !== i || !tyypit.includes(x.t)));
}

// Viimeisimmän muutoksen nimi (PERU-napin selite): uusin lisätty tapahtuma tai poisto.
export function tapahtumaMuutos(ennen, nyt) {
  const a = jasennaTapahtumat(ennen);
  const b = jasennaTapahtumat(nyt);
  if (b.length <= a.length) return 'poisto';
  const t = b[b.length - 1].t;
  return t === 'H' ? 'häiriö' : t === 'N' ? 'häiriö, nolla' : 'varoitus';
}

// Lyhyt yhteenveto lokiin ja toimistolle: "HÄIRIÖT 2, VAROITUKSET 1" tai ''.
export function yhteenveto(tapahtumat) {
  const lista = jasennaTapahtumat(tapahtumat);
  if (lista.length === 0) return '';
  return [
    hairiot(lista) ? `HÄIRIÖT ${hairiot(lista)}` : '',
    varoitukset(lista) ? `VAROITUKSET ${varoitukset(lista)}` : ''
  ].filter(Boolean).join(', ');
}
