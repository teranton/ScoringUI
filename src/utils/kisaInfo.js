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

const SAHKOPOSTI = /[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}/i;
// Puhelinnumero: +358 tai 0 alussa ja vähintään 7 numeroa (välilyönnit ja viivat sallittu).
const PUHELIN = /(?:\+\d{1,3}|0)[\d\s-]{6,}\d/;

// Yhteystieto osiksi: [{ teksti, href? }], jossa sähköpostit (mailto:) ja puhelinnumerot (tel:) ovat linkkejä.
export function yhteystiedonOsat(arvo) {
  let loput = puhdasTeksti(arvo, 500);
  const osat = [];
  while (loput) {
    const posti = loput.match(SAHKOPOSTI);
    const puhelin = loput.match(PUHELIN);
    const osuma = [posti, puhelin].filter(Boolean).sort((a, b) => a.index - b.index)[0];
    if (!osuma) {
      osat.push({ teksti: loput });
      break;
    }
    if (osuma.index > 0) osat.push({ teksti: loput.slice(0, osuma.index) });
    const teksti = osuma[0];
    const href = osuma === posti ? `mailto:${teksti}` : `tel:${teksti.replace(/[\s-]/g, '')}`;
    osat.push({ teksti, href });
    loput = loput.slice(osuma.index + teksti.length);
  }
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

const sisaltaa = (teksti, sana) => String(teksti || '').toLowerCase().includes(sana);

// Info-sivun tiedot. speksiRivit: KISANSPEKSIT parsittuna, kisa: rekisterin rivi (parsiKilpailurekisteri).
export function kisanInfo(speksiRivit, kisa = {}) {
  const rivit = Array.isArray(speksiRivit) ? speksiRivit : [];
  const arvo = (avain, maks = 200) => puhdasTeksti(speksiArvo(rivit, avain), maks);

  const asiakirjat = extractMaterialGuidesFromRows(rivit);
  const kutsu = asiakirjat.find((a) => sisaltaa(a.title, 'kutsu')) || null;
  const ilmoittautumisAsiakirja = asiakirjat.find((a) => sisaltaa(a.title, 'ilmoittau')) || null;

  const rekisterinPaikka = KOORDINAATIT.test(String(kisa.paikka || '').trim()) ? '' : puhdasTeksti(kisa.paikka, 120);
  const paikka = arvo('KISAPAIKKA') || rekisterinPaikka;

  return {
    laji: lajinNimi(arvo('KILPAILUTYYPPI') || kisa.laji),
    kiekkoja: kokonaisluku(arvo('KIEKKOMAARA')),
    kuvaus: monirivinen(speksiArvo(rivit, 'KUVAUS'), 2000),
    paikka,
    karttaUrl: karttaLinkki(paikka),
    jarjestaja: arvo('JARJESTAJA') || puhdasTeksti(kisa.jarjestaja, 120) || arvo('Järjestävät seurat:'),
    yhteystieto: yhteystiedonOsat(speksiArvo(rivit, 'YHTEYSTIETO')),
    ilmoittautumisLinkki: turvallinenLinkki(speksiArvo(rivit, 'ILMOITTAUTUMISLINKKI')) || ilmoittautumisAsiakirja?.url || '',
    osallistumismaksu: muotoileMaksu(speksiArvo(rivit, 'OSALLISTUMISMAKSU')),
    aloitusAika: muotoileKellonaika(speksiArvo(rivit, 'ALOITUS_AIKA')),
    sarjat: lomakkeenSarjat(speksiArvo(rivit, 'ILMOITTAUTUMISEN_SARJAT')),
    asiakirjat,
    kutsu
  };
}
