// Kisadatan välimuistisäännöt: CDN-otsikot ja tallennetun kuvan (snapshot) tuoreusraja kisan päivistä.
import { laskeKisanStatusJaTyyli, parsiPaivamaara } from '../../src/utils/kisaStatus.js';

const TUNTI_MS = 60 * 60 * 1000;
const PAIVA_MS = 24 * TUNTI_MS;
// Näin kauan kisan päättymisen jälkeen tuloksia voidaan vielä korjata; sen jälkeen tallennettu kuva päivitetään kerran päivässä.
export const KORJAUSAIKA_MS = 14 * PAIVA_MS;

// CDN-säännöt sekunteina: s-maxage (tuore) ja stale-while-revalidate (vanhaa tarjotaan, kun uusi haetaan taustalla).
// Korjausaikana päättyneen kisan vanhaa vastausta tarjotaan korkeintaan vuorokauden, sen jälkeen 30 vrk.
const SAANNOT = {
  paattynytKorjausaika: { tuore: 3600, vanha: 86400 },
  paattynyt: { tuore: 3600, vanha: 2592000 },
  kaynnissa: { tuore: 15, vanha: 15 },
  tulossa: { tuore: 60, vanha: 300 }
};

const otsikko = ({ tuore, vanha }) => `public, s-maxage=${tuore}, stale-while-revalidate=${vanha}`;

export const CDN_OTSIKOT = Object.fromEntries(Object.entries(SAANNOT).map(([avain, saanto]) => [avain, otsikko(saanto)]));
// Varalla olevan (Google ei vastannut) datan saa pitää CDN:ssä vain hetken.
export const VARALLA_OTSIKKO = 'public, s-maxage=10';

// Tila rekisterin päivistä. KISANSPEKSIT-ohitus ei vaikuta välimuistiin: kisapäivinä data pidetään aina tuoreena.
export function kisanPaivaTila(kisa, nyt = new Date()) {
  return laskeKisanStatusJaTyyli(kisa?.alkuPvm, kisa?.loppuPvm, nyt).status;
}

// Onko kisan päättymisestä kulunut yli korjausajan.
export function onkoKorjausaikaOhi(kisa, nyt = Date.now()) {
  const loppu = parsiPaivamaara(kisa?.loppuPvm) || parsiPaivamaara(kisa?.alkuPvm);
  return loppu ? (nyt - loppu.getTime()) > KORJAUSAIKA_MS + PAIVA_MS : false;
}

function saanto(paivaTila, kisa, nyt) {
  if (paivaTila === 'paattynyt' && !onkoKorjausaikaOhi(kisa, nyt)) return SAANNOT.paattynytKorjausaika;
  return SAANNOT[paivaTila] || SAANNOT.tulossa;
}

// Palvelimen oma vastausvälimuisti pitää vastauksen yhtä kauan kuin CDN pitää sen tuoreena.
export function vastausTuoreMs(paivaTila, kisa = null, nyt = Date.now()) {
  return saanto(paivaTila, kisa, nyt).tuore * 1000;
}

// ikaMs: vastauksen ikä palvelimen välimuistissa. CDN saa jäljellä olevan ajan, jotta välimuistit eivät kasaudu.
export function cdnOtsikko(paivaTila, kisa = null, nyt = Date.now(), ikaMs = 0) {
  const { tuore, vanha } = saanto(paivaTila, kisa, nyt);
  return otsikko({ tuore: Math.max(1, tuore - Math.floor(ikaMs / 1000)), vanha });
}

function kuvanIka(kuva, nyt) {
  if (!kuva || kuva.paivaTila !== 'paattynyt' || !Number.isFinite(kuva.tallennettu)) return Infinity;
  return nyt - kuva.tallennettu;
}

// Päättyneen kisan tallennettu kuva on tuore tunnin korjausaikana ja vuorokauden sen jälkeen.
export function onkoKuvaTuore(kuva, nyt = Date.now()) {
  const maksimiIka = onkoKorjausaikaOhi(kuva, nyt) ? PAIVA_MS : TUNTI_MS;
  return kuvanIka(kuva, nyt) < maksimiIka;
}

// Korjausajan jälkeen tulokset eivät enää muutu: vanhempikin kuva annetaan heti CDN:n vanhan vastauksen
// rajoissa (1 h + 30 vrk), ja tuore data haetaan silloin taustalla. Korjausaikana kelpaa vain tuore kuva.
export function onkoKuvaKaytettava(kuva, nyt = Date.now()) {
  if (!onkoKorjausaikaOhi(kuva, nyt)) return onkoKuvaTuore(kuva, nyt);
  const { tuore, vanha } = SAANNOT.paattynyt;
  return kuvanIka(kuva, nyt) < (tuore + vanha) * 1000;
}
