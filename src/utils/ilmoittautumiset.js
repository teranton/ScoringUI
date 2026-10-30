// Ilmoittautuneiden lähteet: kisan Ilmoittautuneet-välilehti (kaava pääsivulta) sekä ilmoittautumiset, joita ei ole
// vielä siirretty pääsivulle: Suomisport-tuonti (Suomisport Import), ScoringUI:n lomake (ILMOITTAUTUMISET) ja kisaan
// liitetyn Google-lomakkeen vastaukset (Lomakevastaukset N / Form Responses N). API antaa lähteistä vain nimen,
// sarjan, seuran ja siirtomerkinnän (api/_lib/sheetsData.js), joten maksutiedot, Sportti-ID:t ja yhteystiedot eivät
// lähde julkiseksi. Sama tiedosto määrittää lomakkeen asetukset (KISANSPEKSIT) frontendille ja api/ilmoittaudu.js:lle.
import { parseCsvRows } from './csv.js';
import { speksiArvo } from './radanJono.js';
import { parsiPaivamaara } from './kisaStatus.js';

export const LOMAKE_VALILEHTI = 'ILMOITTAUTUMISET';
export const LOMAKE_OTSIKKO = ['AIKALEIMA', 'SUKUNIMI', 'ETUNIMI', 'NIMI', 'SARJA', 'SEURA', 'SÄHKÖPOSTI', 'PUHELIN', 'LISÄTIETOJA', 'SIIRRETTY'];
export const SUOMISPORT_VALILEHTI = 'Suomisport Import';
// Google-lomakkeen vastausvälilehti on suomeksi "Lomakevastaukset 1", englanniksi "Form Responses 1".
export const GOOGLE_LOMAKE_VALILEHDET = ['Lomakevastaukset 1', 'Form Responses 1'];
export const LAHDE_VALILEHDET = [SUOMISPORT_VALILEHTI, LOMAKE_VALILEHTI, ...GOOGLE_LOMAKE_VALILEHDET];

const sanat = (otsikko) => String(otsikko ?? '').toUpperCase().split(/[^A-ZÅÄÖÜ0-9]+/).filter(Boolean);
const KENEN_NIMI = new Set(['KILPAILIJAN', 'AMPUJAN', 'OSALLISTUJAN']);

// Lähdevälilehden sarakkeen merkitys otsikon ensimmäisen sanan mukaan: 'nimi', 'sukunimi', 'etunimi', 'sarja',
// 'seura', 'siirretty' tai null (muut sarakkeet, esim. Sportti-ID, HUOM, sähköposti, eivät lähde API:sta).
// "Nimi (sukunimi etunimi)" ja "Kilpailijan nimi" ovat nimiä, "Seuran yhteyshenkilö" ei ole seura.
export function lahdeSarake(otsikko) {
  const s = sanat(otsikko);
  if (s.length === 0) return null;
  const [eka, toka] = s;
  if (eka === 'SUKUNIMI' || eka === 'SURNAME' || (eka === 'LAST' && toka === 'NAME') || eka === 'LASTNAME') return 'sukunimi';
  if (eka === 'ETUNIMI' || eka === 'ETUNIMET' || (eka === 'FIRST' && toka === 'NAME') || eka === 'FIRSTNAME') return 'etunimi';
  if (['NIMI', 'NAME', 'KOKONIMI', 'AMPUJA'].includes(eka) || (KENEN_NIMI.has(eka) && toka === 'NIMI')) return 'nimi';
  if (eka === 'SARJA' || eka === 'CLASS' || eka === 'LUOKKA') return 'sarja';
  if (eka === 'SEURA' || eka === 'CLUB') return 'seura';
  if (eka === 'SIIRRETTY') return 'siirretty';
  return null;
}

const valit = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

// Nimi vertailuun: kirjainkoko, välit ja aksentit (paitsi å, ä, ö) ohitetaan, sanojen järjestyksellä ei ole väliä.
export function nimiAvain(nimi) {
  return valit(nimi).toLowerCase().normalize('NFC')
    .split(' ').filter(Boolean).sort().join(' ');
}

// Lähdevälilehden ilmoittautumiset [{ nimi, sarja, seura }]: rivit, joilla on nimi, ja oletuksena vain siirtämättömät.
// Erilliset suku- ja etunimet yhdistetään muotoon "Sukunimi Etunimi" kuten Suomisport-tuonnissa.
// lahde: CSV-teksti tai rivit (taulukko taulukoita).
export function lahteenIlmoittautuneet(lahde, { myosSiirretyt = false } = {}) {
  const rivit = Array.isArray(lahde) ? lahde.map((r) => (Array.isArray(r) ? r : [])) : parseCsvRows(lahde || '');
  if (rivit.length < 2) return [];
  const sarakkeet = {};
  rivit[0].forEach((otsikko, i) => {
    const tyyppi = lahdeSarake(otsikko);
    if (tyyppi && sarakkeet[tyyppi] === undefined) sarakkeet[tyyppi] = i;
  });
  const solu = (rivi, tyyppi) => (sarakkeet[tyyppi] === undefined ? '' : valit(rivi[sarakkeet[tyyppi]]));
  const tulos = [];
  for (const rivi of rivit.slice(1)) {
    if (!myosSiirretyt && solu(rivi, 'siirretty')) continue;
    const nimi = solu(rivi, 'nimi') || valit(`${solu(rivi, 'sukunimi')} ${solu(rivi, 'etunimi')}`);
    if (!nimi || /^\d+$/.test(nimi)) continue;
    tulos.push({ nimi, sarja: solu(rivi, 'sarja'), seura: solu(rivi, 'seura') });
  }
  return tulos;
}

// Lähteiden ilmoittautuneet, joita ei ole jo listalla (nimet: Ilmoittautuneet-välilehden nimet). Sama ampuja
// useammassa lähteessä näytetään kerran (ensimmäinen lähde voittaa).
export function lisattavatIlmoittautuneet(nimet, lahdeCsvt) {
  const nahdyt = new Set((nimet || []).map(nimiAvain));
  const lisattavat = [];
  for (const csv of lahdeCsvt || []) {
    for (const ilmo of lahteenIlmoittautuneet(csv)) {
      const avain = nimiAvain(ilmo.nimi);
      if (nahdyt.has(avain)) continue;
      nahdyt.add(avain);
      lisattavat.push(ilmo);
    }
  }
  return lisattavat;
}

// --- Lomakkeen asetukset (KISANSPEKSIT) ---

const HELSINKI = 'Europe/Helsinki';

// Helsingin seinäkellon aika UTC-hetkeksi (kesä- ja talviaika huomioiden).
export function helsinginHetki(vuosi, kuukausi, paiva, tunti = 0, minuutti = 0) {
  const arvio = Date.UTC(vuosi, kuukausi - 1, paiva, tunti, minuutti);
  const osat = new Intl.DateTimeFormat('en-GB', {
    timeZone: HELSINKI, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(arvio));
  const o = Object.fromEntries(osat.map((p) => [p.type, Number(p.value)]));
  const siirtyma = Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute) - arvio;
  return new Date(arvio - siirtyma);
}

// Lomakkeen sulkeutumishetki: ILMOITTAUTUMINEN_PAATTYY ("15.11.2026", "15.11.2026 18:00", "2026-11-15 18:00")
// Helsingin aikaa; pelkkä päivä = päivän loppuun. Ilman asetusta kilpailupäivän alkuun (edellisen päivän loppuun).
export function ilmoittautumisenTakaraja(asetus, alkuPvm) {
  const teksti = valit(asetus);
  if (teksti) {
    const [paivaOsa, aikaOsa] = teksti.split(/\s+|T/);
    const paiva = parsiPaivamaara(paivaOsa);
    if (paiva) {
      const aika = String(aikaOsa || '').match(/^(\d{1,2})[:.](\d{2})/);
      if (aika) return helsinginHetki(paiva.getFullYear(), paiva.getMonth() + 1, paiva.getDate(), Number(aika[1]), Number(aika[2]));
      return helsinginHetki(paiva.getFullYear(), paiva.getMonth() + 1, paiva.getDate() + 1);
    }
  }
  const alku = parsiPaivamaara(alkuPvm);
  return alku ? helsinginHetki(alku.getFullYear(), alku.getMonth() + 1, alku.getDate()) : null;
}

// Sarjavalikko: ILMOITTAUTUMISEN_SARJAT pilkuilla tai puolipisteillä erotettuna; tyhjä = vapaa teksti.
export function lomakkeenSarjat(asetus) {
  return [...new Set(String(asetus ?? '').split(/[,;]/).map(valit).filter(Boolean))];
}

// Lomakkeen tila KISANSPEKSIT-riveistä: { kaytossa, auki, takaraja, sarjat }. Lomake on käytössä vain arvolla
// ILMOITTAUTUMINEN = LOMAKE, ja auki rekisterin alkupäivään (tai ILMOITTAUTUMINEN_PAATTYY-hetkeen) asti.
export function lomakkeenTila(speksiRivit, alkuPvm, nyt = new Date()) {
  const kaytossa = speksiArvo(speksiRivit, 'ILMOITTAUTUMINEN').toUpperCase() === 'LOMAKE';
  const takaraja = ilmoittautumisenTakaraja(speksiArvo(speksiRivit, 'ILMOITTAUTUMINEN_PAATTYY'), alkuPvm);
  return {
    kaytossa,
    auki: kaytossa && Boolean(takaraja) && nyt < takaraja,
    takaraja,
    sarjat: lomakkeenSarjat(speksiArvo(speksiRivit, 'ILMOITTAUTUMISEN_SARJAT'))
  };
}

// --- Lomakkeen kentät (frontend ja api/ilmoittaudu.js) ---

export const KENTTA_MAKS = { sukunimi: 60, etunimi: 60, sarja: 30, seura: 60, sahkoposti: 120, puhelin: 30, lisatietoja: 500 };
const SAHKOPOSTI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const puhdas = (t, maks) => valit([...String(t ?? '')].filter((c) => c >= ' ' && c !== '\u007f').join('')).slice(0, maks);
// Taulukkoon ei kirjoiteta kaavaksi tulkittavaa tekstiä (=, +, -, @ alussa), vaikka kirjoitus on RAW.
const eiKaavaa = (t) => t.replace(/^[=+\-@]+/, '').trim();

// Siistityt kentät ja virheet { kentat, virheet: { kentta: 'koodi' } }. sarjat: sallitut sarjat (tyhjä = vapaa).
export function tarkistaLomake(syote, sarjat = []) {
  const k = {};
  for (const [nimi, maks] of Object.entries(KENTTA_MAKS)) k[nimi] = eiKaavaa(puhdas(syote?.[nimi], maks));
  const virheet = {};
  if (!k.sukunimi) virheet.sukunimi = 'pakollinen';
  if (!k.etunimi) virheet.etunimi = 'pakollinen';
  if (!k.sarja) virheet.sarja = 'pakollinen';
  else if (sarjat.length && !sarjat.some((s) => s.toUpperCase() === k.sarja.toUpperCase())) virheet.sarja = 'tuntematon';
  if (!k.seura) virheet.seura = 'pakollinen';
  if (!k.sahkoposti) virheet.sahkoposti = 'pakollinen';
  else if (!SAHKOPOSTI.test(k.sahkoposti)) virheet.sahkoposti = 'virheellinen';
  if (syote?.suostumus !== true) virheet.suostumus = 'pakollinen';
  if (sarjat.length && !virheet.sarja) k.sarja = sarjat.find((s) => s.toUpperCase() === k.sarja.toUpperCase());
  return { kentat: k, virheet };
}

// Nimi pääsivun muotoon kuten Suomisport-tuonnissa: "Sukunimi Etunimi", sanojen alkukirjaimet isoiksi.
export function lomakkeenNimi(sukunimi, etunimi) {
  // Kokonaan pienillä tai isoilla kirjoitettu nimi muotoillaan, muuten kirjoitusasu säilyy (McDonald, von Wright).
  const iso = (t) => {
    const teksti = valit(t);
    if (teksti !== teksti.toLowerCase() && teksti !== teksti.toUpperCase()) return teksti;
    return teksti.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, eteen, kirjain) => eteen + kirjain.toUpperCase());
  };
  return valit(`${iso(sukunimi)} ${iso(etunimi)}`);
}
