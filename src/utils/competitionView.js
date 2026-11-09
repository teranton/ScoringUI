// Päättelee, mikä kisanäkymän välilehti näytetään, kun käyttäjän valitsema sivu
// ei ole (enää) sallittu kisan tilan tai saatavilla olevan datan perusteella.
//
// 'oletus' = käyttäjä ei ole valinnut sivua (kisa avattiin kortista tai linkistä ilman välilehteä): tuleva kisa
// avautuu Info-sivulle, käynnissä oleva ja päättynyt tuloksiin. Info on aina sallittu, joten se on viimeinen vara.

// Kisanäkymän sivut, joilla on oma osoite (#kisa-<id>/<sivu>). 'materiaalit' on vanha nimi Info-sivulle.
export const KISAN_SIVUT = ['info', 'tulokset', 'taulukko', 'joukkueet', 'finaali', 'ilmoittautuneet', 'aikataulu', 'live', 'ryhmat'];

// Tulevassa kisassa sallitut sivut (tuloksia ei vielä ole).
const TULEVAN_SIVUT = new Set(['info', 'ilmoittautuneet', 'aikataulu', 'ryhmat']);

function seuraavaSivuYhdenKierroksen({
  aktiivinenSivu,
  onkoAikatauluSallittu,
  onkoIlmoittautuneita,
  onkoJoukkueKisa,
  onkoFinaali = false,
  onkoKisaPaattynyt,
  onkoKisaTulossa,
  onkoTaulukkoSallittu,
  onkoTuloksetSallittu,
  onkoRyhmaMuokkausSallittu,
  onkoLiveSallittu = false
}) {
  // Vara, kun sivu ei ole sallittu: tulokset, jos niitä on, muuten Info.
  const vara = onkoTuloksetSallittu ? 'tulokset' : 'info';

  if (aktiivinenSivu === 'oletus') return onkoKisaTulossa ? 'info' : vara;
  if (aktiivinenSivu === 'materiaalit') return 'info';
  if (aktiivinenSivu === 'info') return 'info';

  // Ryhmien muokkaus avataan erikseen, ja se on auki myös ennen kisaa, vaikka aikataulu olisi vielä piilossa.
  if (aktiivinenSivu === 'ryhmat') return onkoRyhmaMuokkausSallittu ? 'ryhmat' : vara;

  if (onkoKisaTulossa && !TULEVAN_SIVUT.has(aktiivinenSivu)) return 'info';

  // Radat live vain käynnissä olevassa kisassa, jossa on mobiilikirjauksen ratoja.
  if (aktiivinenSivu === 'live' && !onkoLiveSallittu) return vara;
  if (aktiivinenSivu === 'ilmoittautuneet' && !onkoIlmoittautuneita) return vara;
  if (aktiivinenSivu === 'aikataulu' && !onkoAikatauluSallittu) return vara;
  if (aktiivinenSivu === 'taulukko' && !onkoTaulukkoSallittu) return vara;
  if (aktiivinenSivu === 'joukkueet' && !onkoJoukkueKisa) return vara;
  // Finaalikaavio (FINAALI-välilehti) vain, kun siinä on otteluita.
  if (aktiivinenSivu === 'finaali' && !onkoFinaali) return vara;
  if (aktiivinenSivu === 'tulokset' && !onkoTuloksetSallittu) return 'info';

  if (onkoKisaPaattynyt && !['tulokset', 'taulukko', 'joukkueet', 'finaali'].includes(aktiivinenSivu)) return vara;

  if (!KISAN_SIVUT.includes(aktiivinenSivu)) return vara;
  return aktiivinenSivu;
}

export function laskeSeuraavaAktiivinenSivu(tila) {
  if (!tila.valittuKisa) return tila.aktiivinenSivu;

  // Toistetaan kunnes sivu ei enää vaihdu (sääntöjen ketjutus).
  let sivu = tila.aktiivinenSivu;
  for (let i = 0; i < 8; i++) {
    const seuraava = seuraavaSivuYhdenKierroksen({ ...tila, aktiivinenSivu: sivu });
    if (seuraava === sivu) break;
    sivu = seuraava;
  }
  return sivu;
}

// Kisan osoite: #kisa-<id> tai #kisa-<id>/<sivu>. Palauttaa { id, sivu } (sivu null ilman tunnettua välilehteä) tai null.
export function parsiKisaHash(hash) {
  const teksti = String(hash || '');
  if (!teksti.startsWith('#kisa-')) return null;
  let runko = teksti.slice('#kisa-'.length);
  try {
    runko = decodeURIComponent(runko);
  } catch {
    // Rikkinäinen prosenttikoodaus: käytetään sellaisenaan.
  }
  const vinoviiva = runko.lastIndexOf('/');
  if (vinoviiva > 0) {
    const sivu = runko.slice(vinoviiva + 1);
    if (KISAN_SIVUT.includes(sivu) || sivu === 'materiaalit') {
      return { id: runko.slice(0, vinoviiva), sivu: sivu === 'materiaalit' ? 'info' : sivu };
    }
  }
  return runko ? { id: runko, sivu: null } : null;
}

export function kisaHash(id, sivu) {
  return `#kisa-${id}${sivu && KISAN_SIVUT.includes(sivu) ? `/${sivu}` : ''}`;
}
