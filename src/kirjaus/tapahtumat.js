// Mobiilikirjauksen tapahtumat kortilla: toimintahäiriöt, varoitukset ja vähennykset (Compak-kortti ja ryhmäpuhelimen
// layoutkortti). Tapahtuma kuuluu kortin kiekkoon i (0-alkuinen), jotta laite näyttää sen kiekon sävynä.
//   H  toimintahäiriö, kiekko uusitaan (ei merkintää kiekkoon)
//   N  toimintahäiriö rajan yli: kiekko merkitään nollaksi (FITASC: kolmas ja seuraavat häiriöt kierroksella)
//   V  varoitus (tuomarin; ei vaikuta tulokseen)
//   R  vähennys n kiekkoa: tulossarakkeeseen kirjoitetaan osumat − vähennys (Compak: kortti, ryhmäkortti: kiekon asema)
// Taulukossa (sarake TAPAHTUMAT) puolipisteillä: "H5; N12; V12 Ase auki; R20x2 Myöhästyi" (kiekot 1-alkuisina).
// Puhtaat funktiot, käytössä laitteella ja API:ssa (tapahtumat.test.js).

export const TYYPIT = ['H', 'N', 'V', 'R'];
export const OLETUS_HAIRIORAJA = 2;
export const MAKS_TAPAHTUMIA = 40;
export const MAKS_SYY = 60;
export const MAKS_VAHENNYS = 25;

const puhdasSyy = (syy) => String(syy ?? '').replace(/[;\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAKS_SYY);

// Tapahtumateksti → [{ t, i, n?, syy? }]. Virheelliset osat jätetään pois.
export function jasennaTapahtumat(teksti) {
  if (Array.isArray(teksti)) return teksti;
  return String(teksti ?? '').split(';').flatMap((osa) => {
    const m = osa.trim().match(/^([HNVR])(\d{1,3})(?:x(\d{1,2}))?(?:\s+(.*))?$/i);
    if (!m) return [];
    const i = Number(m[2]) - 1;
    if (i < 0) return [];
    const t = m[1].toUpperCase();
    const n = t === 'R' ? Math.min(MAKS_VAHENNYS, Math.max(1, Number(m[3]) || 1)) : undefined;
    const syy = puhdasSyy(m[4]);
    return [{ t, i, ...(n ? { n } : {}), ...(syy ? { syy } : {}) }];
  }).slice(0, MAKS_TAPAHTUMIA);
}

// [{ t, i, n?, syy? }] → teksti (tyhjä, kun tapahtumia ei ole).
export function tapahtumaTeksti(tapahtumat) {
  return jasennaTapahtumat(tapahtumat).map((x) => {
    const n = x.t === 'R' && x.n > 1 ? `x${x.n}` : '';
    const syy = puhdasSyy(x.syy);
    return `${x.t}${x.i + 1}${n}${syy ? ` ${syy}` : ''}`;
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

export const hairiot = (tapahtumat) => jasennaTapahtumat(tapahtumat).filter((x) => x.t === 'H' || x.t === 'N').length;
export const varoitukset = (tapahtumat) => jasennaTapahtumat(tapahtumat).filter((x) => x.t === 'V').length;

// Vähennykset kiekoilta alku..loppu-1 (oletus koko kortti).
export function vahennys(tapahtumat, alku = 0, loppu = Infinity) {
  return jasennaTapahtumat(tapahtumat)
    .filter((x) => x.t === 'R' && x.i >= alku && x.i < loppu)
    .reduce((s, x) => s + (x.n || 1), 0);
}

// Tulos vähennyksen jälkeen, ei alle nollan.
export const vahennetty = (osumat, tapahtumat, alku, loppu) => Math.max(0, osumat - vahennys(tapahtumat, alku, loppu));

export const kiekonTapahtumat = (tapahtumat, i) => jasennaTapahtumat(tapahtumat).filter((x) => x.i === i);

// Kiekon sävy laitteella: vahvin tapahtuma (vähennys > varoitus > häiriö) tai null.
export function kiekonKorostus(tapahtumat, i) {
  const omat = kiekonTapahtumat(tapahtumat, i).map((x) => x.t);
  if (omat.includes('R')) return 'vahennys';
  if (omat.includes('V')) return 'varoitus';
  if (omat.includes('H') || omat.includes('N')) return 'hairio';
  return null;
}

// Kiekon sävy kulmakolmiona (kiekon väri näkyy yhä): inline-tyyli laitteen ruudulle.
export const KOROSTUSVARIT = { hairio: '#f59e0b', varoitus: '#facc15', vahennys: '#a855f7' };
export const KOROSTUSNIMET = { hairio: 'toimintahäiriö', varoitus: 'varoitus', vahennys: 'vähennys' };
export function korostusTyyli(korostus) {
  const vari = KOROSTUSVARIT[korostus];
  return vari ? { backgroundImage: `linear-gradient(225deg, ${vari} 0 38%, transparent 38%)` } : undefined;
}

// Kiekon tapahtumat luettavana tekstinä (aria-label, kuittaus).
export function kiekonSelite(tapahtumat, i) {
  return kiekonTapahtumat(tapahtumat, i).map((x) => {
    const nimi = x.t === 'H' ? 'toimintahäiriö' : x.t === 'N' ? 'toimintahäiriö yli rajan (nolla)' : x.t === 'V' ? 'varoitus' : `vähennys ${x.n || 1}`;
    return x.syy ? `${nimi}: ${x.syy}` : nimi;
  }).join(', ');
}

// Sallitut toimintahäiriöt per kortti KISANSPEKSIT-avaimesta TOIMINTAHAIRIOT (0..9), muuten 2 (FITASC Sporting ja
// Compak: 2 per 25 kiekon kierros; ryhmäkortti = layout).
export function hairioRaja(arvo) {
  const t = String(arvo ?? '').trim();
  if (!/^\d$/.test(t)) return OLETUS_HAIRIORAJA;
  return Number(t);
}

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
  return t === 'H' ? 'häiriö' : t === 'N' ? 'häiriö, nolla' : t === 'V' ? 'varoitus' : 'vähennys';
}

// Lyhyt yhteenveto lokiin ja toimistolle: "HÄIRIÖT 2, VAROITUKSET 1, VÄHENNYS 1" tai ''.
export function yhteenveto(tapahtumat) {
  const lista = jasennaTapahtumat(tapahtumat);
  if (lista.length === 0) return '';
  return [
    hairiot(lista) ? `HÄIRIÖT ${hairiot(lista)}` : '',
    varoitukset(lista) ? `VAROITUKSET ${varoitukset(lista)}` : '',
    vahennys(lista) ? `VÄHENNYS ${vahennys(lista)}` : ''
  ].filter(Boolean).join(', ');
}
