// Kisadatan välimuistisäännöt: CDN-otsikot ja tallennetun kuvan (snapshot) tuoreusraja kisan päivistä.
import { laskeKisanStatusJaTyyli, parsiPaivamaara } from '../../src/utils/kisaStatus.js';

const TUNTI_MS = 60 * 60 * 1000;
const PAIVA_MS = 24 * TUNTI_MS;
// Näin kauan kisan päättymisen jälkeen tuloksia voidaan vielä korjata; sen jälkeen tallennettu kuva päivitetään kerran päivässä.
export const KORJAUSAIKA_MS = 14 * PAIVA_MS;

export const CDN_OTSIKOT = {
  paattynyt: 'public, s-maxage=3600, stale-while-revalidate=2592000',
  kaynnissa: 'public, s-maxage=15, stale-while-revalidate=15',
  tulossa: 'public, s-maxage=60, stale-while-revalidate=300'
};

// Tila rekisterin päivistä. KISANSPEKSIT-ohitus ei vaikuta välimuistiin: kisapäivinä data pidetään aina tuoreena.
export function kisanPaivaTila(kisa, nyt = new Date()) {
  return laskeKisanStatusJaTyyli(kisa?.alkuPvm, kisa?.loppuPvm, nyt).status;
}

export function cdnOtsikko(paivaTila) {
  return CDN_OTSIKOT[paivaTila] || CDN_OTSIKOT.tulossa;
}

// Päättyneen kisan tallennettu kuva kelpaa tunnin korjausaikana ja vuorokauden sen jälkeen.
export function onkoKuvaTuore(kuva, nyt = Date.now()) {
  if (!kuva || kuva.paivaTila !== 'paattynyt' || !Number.isFinite(kuva.tallennettu)) return false;
  const loppu = parsiPaivamaara(kuva.loppuPvm) || parsiPaivamaara(kuva.alkuPvm);
  const korjausaikaOhi = loppu ? (nyt - loppu.getTime()) > KORJAUSAIKA_MS + PAIVA_MS : false;
  const maksimiIka = korjausaikaOhi ? PAIVA_MS : TUNTI_MS;
  return (nyt - kuva.tallennettu) < maksimiIka;
}
