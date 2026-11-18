// Ulkoisten nappien painallukset kirjaukseen (napit.js). Käsittelijä luetaan viitteestä, joten se näkee aina
// tuoreimman tilan ilman, että kuuntelija vaihtuu joka piirrossa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { luoPainallukset, toimintoNappaimesta } from './napit.js';
import { lueNapit, tallennaNapit } from './varasto.js';
import { soita } from './aanet.js';

// onToiminto saa 'X', 'O', 'PERU' painettaessa. Se palauttaa true, jos painallus teki jotain, null, jos se odottaa
// mahdollista pitkää painallusta, ja false, jos mitään ei tehty (väärä näkymä, valikko auki, mitään ei peruttavaa,
// liian nopea toisto): silloin kuuluu hylkäysääni ja värinä, koska kirjaaja ei välttämättä katso näyttöä.
// 'HYVAKSY' tulee, kun OSUMA vapautetaan vähintään PITKA_PAINALLUS_MS pohjassa pidettynä, mutta vain jos saman
// painalluksen 'X' palautti null. Painallus, joka merkitsi kiekon, ei siis koskaan hyväksy. Pohjassa pidetty
// näppäin on yksi painallus, vaikka laite toistaisi keydownia ilman repeat-merkintää (luoPainallukset).
export function useNapit(kaytossa, onToiminto, aanet = true) {
  const [napit, setNapit] = useState(lueNapit);
  const kasittelija = useRef(onToiminto);
  const aanetRef = useRef(aanet);
  useEffect(() => {
    kasittelija.current = onToiminto;
    aanetRef.current = aanet;
  });

  useEffect(() => {
    if (!kaytossa) return undefined;
    const painallukset = luoPainallukset();
    const tee = (toiminto) => {
      const tulos = kasittelija.current(toiminto);
      if (tulos === false) {
        if (aanetRef.current) soita('hylatty');
        navigator.vibrate?.([80, 60, 80]);
      }
      return tulos;
    };
    const kuuntele = (e) => {
      const toiminto = toimintoNappaimesta(e, napit);
      if (!toiminto) return;
      // Ei sivun vieritystä (PageDown) eikä kohdistetun painikkeen painallusta.
      e.preventDefault();
      if (!painallukset.alas(e.code, Date.now())) return;
      if (tee(toiminto) === null) painallukset.odota(e.code);
    };
    // Välilyönti ja Enter painavat kohdistettua painiketta myös näppäintä vapautettaessa.
    const vapauta = (e) => {
      const toiminto = toimintoNappaimesta(e, napit);
      if (!toiminto) return;
      e.preventDefault();
      const pitka = painallukset.ylos(e.code, Date.now());
      if (toiminto === 'X' && pitka) tee('HYVAKSY');
    };
    // Kadonnut keyup (sovelluksen vaihto, näytön lukitus) ei saa jättää näppäintä pohjaan.
    const unohda = () => painallukset.tyhjenna();
    window.addEventListener('keydown', kuuntele);
    window.addEventListener('keyup', vapauta);
    window.addEventListener('blur', unohda);
    document.addEventListener('visibilitychange', unohda);
    return () => {
      window.removeEventListener('keydown', kuuntele);
      window.removeEventListener('keyup', vapauta);
      window.removeEventListener('blur', unohda);
      document.removeEventListener('visibilitychange', unohda);
    };
  }, [kaytossa, napit]);

  const asetaNapit = useCallback((uudet) => {
    tallennaNapit(uudet);
    setNapit(uudet);
  }, []);
  return [napit, asetaNapit];
}
