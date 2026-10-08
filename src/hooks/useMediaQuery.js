import { useSyncExternalStore } from 'react';

// Palauttaa, vastaako näkymä annettua media-kyselyä, ja päivittyy kun ikkunan koko muuttuu.
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const media = window.matchMedia(query);
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
      }
      media.addListener(onChange);
      return () => media.removeListener(onChange);
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false),
    () => false
  );
}
