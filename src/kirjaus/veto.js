// Pyyhkäisy ylös tai alas (kirjausnäkymän tilarivi, TapahtumaVeto.jsx).
import { useRef } from 'react';

const KYNNYS = 24; // px

// Pyyhkäisyn tunnistus osoitintapahtumista: ylös → onYlos, alas → onAlas. Palauttaa elementin käsittelijät.
export function useVeto(onYlos, onAlas) {
  const alku = useRef(null);
  return {
    onPointerDown: (e) => { alku.current = e.clientY; },
    onPointerUp: (e) => {
      if (alku.current === null) return;
      const dy = e.clientY - alku.current;
      alku.current = null;
      if (dy <= -KYNNYS) onYlos();
      else if (dy >= KYNNYS) onAlas();
    },
    onPointerCancel: () => { alku.current = null; }
  };
}
