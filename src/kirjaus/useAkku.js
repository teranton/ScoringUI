// Akun varoitus (Battery Status API: Chrome/Android; iPhone ja Firefox eivät kerro akkua, jolloin ei varoitusta).
// Vähissä: enintään 15 % eikä lataudu.
import { useEffect, useState } from 'react';

export const AKKU_RAJA = 0.15;

export function useAkku() {
  const [akku, setAkku] = useState({ vahissa: false, taso: null });

  useEffect(() => {
    if (typeof navigator.getBattery !== 'function') return undefined;
    let tila = null;
    let lopetettu = false;
    const paivita = () => {
      if (lopetettu || !tila) return;
      setAkku({ vahissa: !tila.charging && tila.level <= AKKU_RAJA, taso: Math.round(tila.level * 100) });
    };
    navigator.getBattery().then((b) => {
      tila = b;
      b.addEventListener('levelchange', paivita);
      b.addEventListener('chargingchange', paivita);
      paivita();
    }).catch(() => {});
    return () => {
      lopetettu = true;
      tila?.removeEventListener('levelchange', paivita);
      tila?.removeEventListener('chargingchange', paivita);
    };
  }, []);

  return akku;
}
