// Kisan Info-sivun tiedot: KISANSPEKSIT-välilehden Kisainfo-osio (KUVAUS, KIEKKOMAARA, KISAPAIKKA, JARJESTAJA,
// YHTEYSTIETO, ILMOITTAUTUMISLINKKI), kisan muut asetukset (KILPAILUTYYPPI, OSALLISTUMISMAKSU, ALOITUS_AIKA,
// ILMOITTAUTUMISEN_SARJAT, Järjestävät seurat:) ja OHJE:-rivien asiakirjat. Rekisterin sarakkeet I (paikka),
// J (laji) ja K (järjestäjä) ovat varana. Puhtaita funktioita; näytetään vain täytetyt tiedot.
import { speksiArvo, puhdasTeksti } from './radanJono.js';
import { lomakkeenSarjat } from './ilmoittautumiset.js';
import { extractMaterialGuidesFromRows } from './materials.js';

const LAJIT = {
  COMPAK: { nimi: 'Compak Sporting', lyhyt: 'Compak' },
  SPORTING: { nimi: 'Sporting', lyhyt: 'Sporting' },
  FITASC: { nimi: 'FITASC Sporting', lyhyt: 'FITASC' },
  ESP: { nimi: 'English Sporting', lyhyt: 'ESP' }
};

const lajiAvain = (arvo) => String(arvo ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');

// Lajin koko nimi (Info-sivu) tai lyhyt nimi (etusivun kortti). Tuntematon arvo näytetään sellaisenaan.
export function lajinNimi(arvo, { lyhyt = false } = {}) {
  const laji = LAJIT[lajiAvain(arvo)];
  if (laji) return lyhyt ? laji.lyhyt : laji.nimi;
  return puhdasTeksti(arvo, 40);
}

// Rekisterin I-sarakkeen koordinaatit (sääennustetta varten) eivät ole näytettävä paikka.
const KOORDINAATIT = /^-?\d{1,3}[.,]\d+[\s,;]+-?\d{1,3}[.,]\d+$/;

export function turvallinenLinkki(arvo) {
  const teksti = String(arvo ?? '').trim();
  if (!teksti) return '';
  try {
    const url = new URL(teksti);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

// Kokonaisluku tekstistä ("200", "200 kiekkoa") tai 0.
function kokonaisluku(arvo) {
  const osuma = String(arvo ?? '').replace(/\s/g, '').match(/^\d+/);
  return osuma ? Number(osuma[0]) : 0;
}

// Osallistumismaksu: pelkkä luku euroina ("60" → "60 €", "45,50" → "45,50 €"), muu teksti sellaisenaan.
export function muotoileMaksu(arvo) {
  const teksti = puhdasTeksti(arvo, 120);
  if (!teksti) return '';
  return /^\d+([.,]\d{1,2})?$/.test(teksti) ? `${teksti.replace('.', ',')} €` : teksti;
}

// Ensimmäinen lähtö: "09:00:00" tai "9:00" → "9.00".
export function muotoileKellonaika(arvo) {
  const osuma = String(arvo ?? '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!osuma || Number(osuma[1]) > 23) return '';
  return `${Number(osuma[1])}.${osuma[2]}`;
}

const SAHKOPOSTI = /[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}/gi;
// Puhelinnumero: +358 tai 0 ja suuntanumero (ei 0), sitten numeroryhmiä välilyönnein tai viivoin (040 123 4567,
// 09-123 456, +358 40 1234567), 7–13 numeroa. Ei kirjaimen tai numeron vieressä, joten tilinumero tai viite ei muutu linkiksi.
const PUHELIN = /(?<![\w+])(?:\+358[\s-]?|0)[1-9]\d{0,2}(?:[\s-]?\d{2,4}){1,3}(?!\w)/g;

// Yhteystieto osiksi: [{ teksti, href? }], jossa sähköpostit (mailto:) ja puhelinnumerot (tel:) ovat linkkejä.
export function yhteystiedonOsat(arvo) {
  const teksti = puhdasTeksti(arvo, 500);
  const osumat = [
    ...[...teksti.matchAll(SAHKOPOSTI)].map((m) => ({ alku: m.index, teksti: m[0], href: `mailto:${m[0]}` })),
    ...[...teksti.matchAll(PUHELIN)]
      .filter((m) => { const n = m[0].replace(/\D/g, '').length; return n >= 7 && n <= 13; })
      .map((m) => ({ alku: m.index, teksti: m[0], href: `tel:${m[0].replace(/[\s-]/g, '')}` }))
  ].sort((a, b) => a.alku - b.alku);
  const osat = [];
  let kohta = 0;
  for (const o of osumat) {
    if (o.alku < kohta) continue; // päällekkäinen osuma (numero sähköpostissa)
    if (o.alku > kohta) osat.push({ teksti: teksti.slice(kohta, o.alku) });
    osat.push({ teksti: o.teksti, href: o.href });
    kohta = o.alku + o.teksti.length;
  }
  if (kohta < teksti.length) osat.push({ teksti: teksti.slice(kohta) });
  return osat;
}

export function karttaLinkki(paikka) {
  const teksti = puhdasTeksti(paikka, 200);
  return teksti ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(teksti)}` : '';
}

// Monirivinen teksti (solun rivinvaihdot säilyvät, muut ohjausmerkit pois).
function monirivinen(arvo, maks) {
  return String(arvo ?? '').replace(/\r\n?/g, '\n').split('\n').map((rivi) => puhdasTeksti(rivi, maks)).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, maks);
}

export function onkoSuomisport(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'suomisport.fi' || host.endsWith('.suomisport.fi');
  } catch {
    return false;
  }
}

// Etusivun kortin tiedot rekisteristä: paikka (sarake I, ei koordinaatteja) ja järjestäjä (sarake K).
export function rekisterinTiedot(kisa = {}) {
  const paikka = String(kisa.paikka || '').trim();
  return {
    paikka: KOORDINAATIT.test(paikka) ? '' : puhdasTeksti(paikka, 120),
    jarjestaja: puhdasTeksti(kisa.jarjestaja, 120)
  };
}

// Kisan päivät tekstinä ("7.3.2027" tai "24.4.2027 – 25.4.2027"), tyhjä ilman alkupäivää.
export function kisanPaivat(alku, loppu) {
  if (!alku) return '';
  return !loppu || alku === loppu ? alku : `${alku} – ${loppu}`;
}

const sisaltaa = (teksti, sana) => String(teksti || '').toLowerCase().includes(sana);

// Info-sivun tiedot. speksiRivit: KISANSPEKSIT parsittuna, kisa: rekisterin rivi (parsiKilpailurekisteri).
export function kisanInfo(speksiRivit, kisa = {}) {
  const rivit = Array.isArray(speksiRivit) ? speksiRivit : [];
  const arvo = (avain, maks = 200) => puhdasTeksti(speksiArvo(rivit, avain), maks);

  const asiakirjat = extractMaterialGuidesFromRows(rivit);
  const kutsu = asiakirjat.find((a) => sisaltaa(a.title, 'kutsu')) || null;
  // Varalla Suomisportin tapahtumalinkki OHJE:-riveiltä (vanhat kisat: "OHJE: Ilmoittautumislinkki").
  const suomisportAsiakirja = asiakirjat.find((a) => onkoSuomisport(a.url)) || null;
  const ilmoittautumisLinkki = turvallinenLinkki(speksiArvo(rivit, 'ILMOITTAUTUMISLINKKI')) || suomisportAsiakirja?.url || '';

  const rekisteri = rekisterinTiedot(kisa);
  const paikka = arvo('KISAPAIKKA') || rekisteri.paikka;

  return {
    laji: lajinNimi(arvo('KILPAILUTYYPPI') || kisa.laji),
    kiekkoja: kokonaisluku(arvo('KIEKKOMAARA')),
    kuvaus: monirivinen(speksiArvo(rivit, 'KUVAUS'), 2000),
    paikka,
    karttaUrl: karttaLinkki(paikka),
    // Taulukon arvot ensin, jotta järjestäjän korjaus näkyy; rekisterin K on vara (vanhat kisat).
    jarjestaja: arvo('JARJESTAJA') || arvo('Järjestävät seurat:') || rekisteri.jarjestaja,
    yhteystieto: yhteystiedonOsat(speksiArvo(rivit, 'YHTEYSTIETO')),
    ilmoittautumisLinkki,
    ilmoittautuminenSuomisportissa: onkoSuomisport(ilmoittautumisLinkki),
    osallistumismaksu: muotoileMaksu(speksiArvo(rivit, 'OSALLISTUMISMAKSU')),
    aloitusAika: muotoileKellonaika(speksiArvo(rivit, 'ALOITUS_AIKA')),
    sarjat: lomakkeenSarjat(speksiArvo(rivit, 'ILMOITTAUTUMISEN_SARJAT')),
    asiakirjat,
    kutsu
  };
}
