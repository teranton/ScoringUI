import { useCallback, useSyncExternalStore } from 'react';

function onMatchMedia() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

// Palauttaa, vastaako näkymä annettua media-kyselyä, ja päivittyy kun ikkunan koko muuttuu.
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    if (!onMatchMedia()) return () => {};
    const media = window.matchMedia(query);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [query]);

  const getSnapshot = useCallback(() => (onMatchMedia() ? window.matchMedia(query).matches : false), [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
