// Ulkoisten nappien painallukset kirjaukseen (napit.js). Käsittelijä luetaan viitteestä, joten se näkee aina
// tuoreimman tilan ilman, että kuuntelija vaihtuu joka piirrossa.
import { useEffect, useRef, useState } from 'react';
import { lueNapit, tallennaNapit, toimintoNappaimesta } from './napit.js';

export function useNapit(kaytossa, onToiminto) {
  const [napit, setNapit] = useState(() => lueNapit());
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
    window.addEventListener('keydown', kuuntele);
    return () => window.removeEventListener('keydown', kuuntele);
  }, [kaytossa, napit]);

  const asetaNapit = (uudet) => {
    tallennaNapit(uudet);
    setNapit(uudet);
  };
  return [napit, asetaNapit];
}
