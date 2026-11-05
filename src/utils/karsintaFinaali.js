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

// { tulos, karsinta, finaali }: tulos = karsinta + finaali, kun finaalin solussa on luku. Jos sheetin TULOS on jo
// asemien summa + finaali (kaava laskee finaalin mukaan), sitä ei lisätä toiseen kertaan. asemat: asemien tulokset.
export function yhdistaFinaali(tulos, finaali, asemat = []) {
  const finaaliTeksti = String(finaali ?? '').trim();
  const finaaliLuku = kokonaisluku(finaaliTeksti);
  const tulosLuku = kokonaisluku(tulos);
  if (finaaliLuku === null || tulosLuku === null) return { tulos, karsinta: tulos, finaali: finaaliTeksti };

  const asemaLuvut = asemat.map(kokonaisluku).filter((l) => l !== null);
  const asemaSumma = asemaLuvut.length ? asemaLuvut.reduce((s, l) => s + l, 0) : null;
  if (finaaliLuku !== 0 && asemaSumma !== null && tulosLuku === asemaSumma + finaaliLuku) {
    return { tulos: String(tulosLuku), karsinta: String(asemaSumma), finaali: finaaliTeksti };
  }
  return { tulos: String(tulosLuku + finaaliLuku), karsinta: String(tulosLuku), finaali: finaaliTeksti };
}
