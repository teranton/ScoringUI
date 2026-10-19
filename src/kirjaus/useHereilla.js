// Pitää näytön päällä (Screen Wake Lock API). Selain vapauttaa lukon, kun sivu piilotetaan,
// joten se pyydetään uudelleen aina sivun tullessa näkyviin.
import { useEffect, useState } from 'react';

export function useHereilla() {
  const [paalla, setPaalla] = useState(false);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined;
    let lukko = null;
    let lopetettu = false;

    const pyyda = async () => {
      if (document.visibilityState !== 'visible' || lukko) return;
      try {
        lukko = await navigator.wakeLock.request('screen');
        if (lopetettu) {
          lukko.release();
          return;
        }
        setPaalla(true);
        lukko.addEventListener('release', () => {
          lukko = null;
          setPaalla(false);
        });
      } catch {
        setPaalla(false);
      }
    };

    pyyda();
    document.addEventListener('visibilitychange', pyyda);
    return () => {
      lopetettu = true;
      document.removeEventListener('visibilitychange', pyyda);
      lukko?.release();
    };
  }, []);

  return paalla;
}
