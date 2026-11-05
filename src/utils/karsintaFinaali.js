// Karsinnan jälkeinen finaali tulosvälilehden FINAALI-sarakkeessa (esim. Compakin top-6-finaali): finaalin tulos
// lisätään karsinnan tulokseen (TULOS), ja tasatuloksen ratkaisee RATKO kuten muutenkin. Finaalia ampumattomien
// tulos on karsinnan tulos. Pudotuspelikaavio (FINAALI-välilehti) on eri asia.

// Normalisoitu otsikko (A-Z0-9): FINAALI tai FINAL.
const onFinaaliOtsikko = (otsikko) => otsikko === 'FINAALI' || otsikko === 'FINAL';

export function etsiFinaaliSarake(otsikotNormalisoitu) {
  return (otsikotNormalisoitu || []).findIndex((o) => onFinaaliOtsikko(String(o || '')));
}

const kokonaisluku = (arvo) => {
  const teksti = String(arvo ?? '').trim();
  return /^-?\d+$/.test(teksti) ? Number(teksti) : null;
};

// Aseman solun pisteet kuten taulukon kaava ne laskee: alkava luku ('24*' = 24), muu (tyhjä, DNF, -) = 0.
const asemanPisteet = (arvo) => Number.parseInt(String(arvo ?? '').trim(), 10) || 0;

// { tulos, karsinta, finaali }: tulos = karsinta + finaali, kun finaalin solussa on luku. Jos sheetin TULOS on jo
// asemien summa + finaali (kaava laskee finaalin mukaan), sitä ei lisätä toiseen kertaan. asemat: asemien solut.
// finaali on näytettävä finaalin tulos: tyhjä, kun solussa ei ole lukua tai luku on 0 (finaalia ampumattomat).
export function yhdistaFinaali(tulos, finaali, asemat = []) {
  const finaaliLuku = kokonaisluku(finaali);
  const tulosLuku = kokonaisluku(tulos);
  if (finaaliLuku === null || tulosLuku === null) return { tulos, karsinta: tulos, finaali: '' };

  const naytettava = finaaliLuku > 0 ? String(finaaliLuku) : '';
  const asemaSumma = asemat.reduce((s, arvo) => s + asemanPisteet(arvo), 0);
  if (finaaliLuku !== 0 && asemat.length > 0 && tulosLuku === asemaSumma + finaaliLuku) {
    return { tulos: String(tulosLuku), karsinta: String(tulosLuku - finaaliLuku), finaali: naytettava };
  }
  return { tulos: String(tulosLuku + finaaliLuku), karsinta: String(tulosLuku), finaali: naytettava };
}

// Ampujan rivin tulos finaali huomioiden, sama kortti- ja taulukkonäkymälle. Asemat ovat sarakkeet, joiden
// normalisoitu otsikko on numero. Ilman FINAALI-saraketta finaali on null ja tulos sheetin TULOS.
export function rivinTulos(rivi, otsikotNormalisoitu, idxTulos, idxFinaali) {
  const tulos = rivi[idxTulos] || '0';
  if (idxFinaali === -1) return { tulos, karsinta: tulos, finaali: null };
  const asemat = (otsikotNormalisoitu || [])
    .map((o, i) => (/^\d+$/.test(String(o || '')) ? rivi[i] : undefined))
    .filter((arvo) => arvo !== undefined);
  return yhdistaFinaali(tulos, rivi[idxFinaali], asemat);
}
