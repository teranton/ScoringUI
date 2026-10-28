// Ryhmäpuhelimen kortit tulosten kiekkonäkymään: haetaan vasta, kun asemaa napautetaan, ja uudelleen
// aikaisintaan minuutin päästä. Sama osoite kaikille katsojille, joten CDN palvelee toistot.
import { useCallback, useRef, useState } from 'react';
import { RYHMAKORTTI_VALILEHDET, lueRyhmaKortit } from '../utils/mobiiliKiekot';

const UUDELLEENHAKU_MS = 60 * 1000;

function kortitUrl(sheetId) {
  const params = new URLSearchParams();
  params.append('sheetId', sheetId);
  RYHMAKORTTI_VALILEHDET.forEach((nimi) => params.append('sheetNames', nimi));
  return `/api/kisa?${params.toString()}`;
}

// Palauttaa { kortit, tila: 'ei' | 'ladataan' | 'ok' | 'virhe', lataa }.
export function useRyhmaKiekot(sheetId) {
  const [tila, setTila] = useState({ sheetId: null, kortit: null, tila: 'ei' });
  const haettuRef = useRef({ sheetId: null, aika: 0, kesken: false });

  const lataa = useCallback(async () => {
    const haettu = haettuRef.current;
    if (!sheetId || haettu.kesken) return;
    if (haettu.sheetId === sheetId && Date.now() - haettu.aika < UUDELLEENHAKU_MS) return;
    haettuRef.current = { sheetId, aika: haettu.aika, kesken: true };
    setTila((t) => (t.sheetId === sheetId && t.kortit ? t : { sheetId, kortit: null, tila: 'ladataan' }));
    try {
      const res = await fetch(kortitUrl(sheetId));
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json();
      setTila({ sheetId, kortit: lueRyhmaKortit(json.csvByName || {}), tila: 'ok' });
      haettuRef.current = { sheetId, aika: Date.now(), kesken: false };
    } catch (error) {
      console.error('[KIEKOT] Ryhmäkorttien haku epäonnistui:', error?.message);
      setTila((t) => (t.sheetId === sheetId && t.kortit ? t : { sheetId, kortit: null, tila: 'virhe' }));
      haettuRef.current = { sheetId, aika: 0, kesken: false };
    }
  }, [sheetId]);

  const oma = tila.sheetId === sheetId ? tila : { kortit: null, tila: 'ei' };
  return { kortit: oma.kortit, tila: oma.tila, lataa };
}
