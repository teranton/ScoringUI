// Ulkoisten nappien painallukset kirjaukseen (napit.js). Käsittelijä luetaan viitteestä, joten se näkee aina
// tuoreimman tilan ilman, että kuuntelija vaihtuu joka piirrossa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toimintoNappaimesta } from './napit.js';
import { lueNapit, tallennaNapit } from './varasto.js';
import { soita } from './aanet.js';

// onToiminto palauttaa true, jos painallus kirjattiin. Muuten (väärä näkymä, valikko auki, mitään ei peruttavaa,
// liian nopea toisto) kuuluu hylkäysääni ja värinä, koska kirjaaja ei välttämättä katso näyttöä.
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
    const kuuntele = (e) => {
      const toiminto = toimintoNappaimesta(e, napit);
      if (!toiminto) return;
      // Ei sivun vieritystä (PageDown) eikä kohdistetun painikkeen painallusta.
      e.preventDefault();
      if (kasittelija.current(toiminto)) return;
      if (aanetRef.current) soita('hylatty');
      navigator.vibrate?.([80, 60, 80]);
    };
    // Välilyönti ja Enter painavat kohdistettua painiketta myös näppäintä vapautettaessa.
    const vapauta = (e) => {
      if (toimintoNappaimesta(e, napit)) e.preventDefault();
    };
    window.addEventListener('keydown', kuuntele);
    window.addEventListener('keyup', vapauta);
    return () => {
      window.removeEventListener('keydown', kuuntele);
      window.removeEventListener('keyup', vapauta);
    };
  }, [kaytossa, napit]);

  const asetaNapit = useCallback((uudet) => {
    tallennaNapit(uudet);
    setNapit(uudet);
  }, []);
  return [napit, asetaNapit];
}
