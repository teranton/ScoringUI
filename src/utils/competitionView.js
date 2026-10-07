// Päättelee, mikä kisanäkymän välilehti näytetään, kun käyttäjän valitsema sivu
// ei ole (enää) sallittu kisan tilan tai saatavilla olevan datan perusteella.

function seuraavaSivuYhdenKierroksen({
  aktiivinenSivu,
  onkoAikatauluSallittu,
  onkoIlmoittautuneita,
  onkoMateriaaleja,
  onkoJoukkueKisa,
  onkoKisaPaattynyt,
  onkoKisaTulossa,
  onkoTaulukkoSallittu,
  onkoTuloksetSallittu
}) {
  if (onkoKisaTulossa && aktiivinenSivu !== 'ilmoittautuneet' && aktiivinenSivu !== 'aikataulu' && aktiivinenSivu !== 'materiaalit') {
    return onkoIlmoittautuneita ? 'ilmoittautuneet' : (onkoAikatauluSallittu ? 'aikataulu' : (onkoMateriaaleja ? 'materiaalit' : 'ilmoittautuneet'));
  }

  if (!onkoIlmoittautuneita && aktiivinenSivu === 'ilmoittautuneet') {
    return onkoTuloksetSallittu ? 'tulokset' : (onkoAikatauluSallittu ? 'aikataulu' : 'ilmoittautuneet');
  }

  if (!onkoAikatauluSallittu && aktiivinenSivu === 'aikataulu') {
    return onkoTuloksetSallittu ? 'tulokset' : 'ilmoittautuneet';
  }

  if (!onkoMateriaaleja && aktiivinenSivu === 'materiaalit') {
    return onkoTuloksetSallittu ? 'tulokset' : (onkoAikatauluSallittu ? 'aikataulu' : 'ilmoittautuneet');
  }

  if (onkoKisaPaattynyt && aktiivinenSivu !== 'tulokset' && !(onkoTaulukkoSallittu && aktiivinenSivu === 'taulukko') && aktiivinenSivu !== 'joukkueet' && !(onkoMateriaaleja && aktiivinenSivu === 'materiaalit')) {
    return 'tulokset';
  }

  if (!onkoTaulukkoSallittu && aktiivinenSivu === 'taulukko') {
    return 'tulokset';
  }

  if (!onkoJoukkueKisa && aktiivinenSivu === 'joukkueet') {
    return onkoTuloksetSallittu ? 'tulokset' : (onkoAikatauluSallittu ? 'aikataulu' : 'ilmoittautuneet');
  }

  return aktiivinenSivu;
}

export function laskeSeuraavaAktiivinenSivu(tila) {
  if (!tila.valittuKisa) return tila.aktiivinenSivu;

  // Toistetaan kunnes sivu ei enää vaihdu (sääntöjen ketjutus, kuten aiemmassa useEffect-toteutuksessa).
  let sivu = tila.aktiivinenSivu;
  for (let i = 0; i < 8; i++) {
    const seuraava = seuraavaSivuYhdenKierroksen({ ...tila, aktiivinenSivu: sivu });
    if (seuraava === sivu) break;
    sivu = seuraava;
  }
  return sivu;
}
