// Ulkoisten nappien painallukset kirjaukseen (napit.js). Käsittelijä luetaan viitteestä, joten se näkee aina
// tuoreimman tilan ilman, että kuuntelija vaihtuu joka piirrossa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toimintoNappaimesta } from './napit.js';
import { lueNapit, tallennaNapit } from './varasto.js';

export function useNapit(kaytossa, onToiminto) {
  const [napit, setNapit] = useState(lueNapit);
  const kasittelija = useRef(onToiminto);
  useEffect(() => {
    kasittelija.current = onToiminto;
  });

  useEffect(() => {
    if (!kaytossa) return undefined;
    const kuuntele = (e) => {
      const toiminto = toimintoNappaimesta(e, napit);
      if (!toiminto) return;
      // Ei sivun vieritystä (PageDown) eikä kohdistetun painikkeen painallusta.
      e.preventDefault();
      kasittelija.current(toiminto);
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
