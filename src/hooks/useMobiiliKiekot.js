// Mobiilikirjauksen kortit tulosten kiekkonäkymään (ryhmäpuhelimen MOBIILI Layout N, Compak-radan MOBIILI Rata N):
// haetaan vasta, kun asemaa napautetaan, ja uudelleen aikaisintaan minuutin päästä. Sama osoite kaikille katsojille,
// joten CDN palvelee toistot.
import { useCallback, useRef, useState } from 'react';
import { lueMobiiliKortit } from '../utils/mobiiliKiekot';

const UUDELLEENHAKU_MS = 60 * 1000;
// api/kisa.js antaa enintään 12 välilehteä pyyntöä kohden.
const PYYNNOSSA_MAKS = 12;

function kortitUrl(sheetId, valilehdet) {
  const params = new URLSearchParams();
  params.append('sheetId', sheetId);
  valilehdet.forEach((nimi) => params.append('sheetNames', nimi));
  return `/api/kisa?${params.toString()}`;
}

async function haeValilehdet(sheetId, valilehdet) {
  const erat = [];
  for (let i = 0; i < valilehdet.length; i += PYYNNOSSA_MAKS) erat.push(valilehdet.slice(i, i + PYYNNOSSA_MAKS));
  const vastaukset = await Promise.all(erat.map(async (era) => {
    const res = await fetch(kortitUrl(sheetId, era));
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return (await res.json()).csvByName || {};
  }));
  return Object.assign({}, ...vastaukset);
}

// valilehdet: haettavat korttivälilehdet. Palauttaa { kortit, tila: 'ei' | 'ladataan' | 'ok' | 'virhe', lataa }.
export function useMobiiliKiekot(sheetId, valilehdet) {
  const [tila, setTila] = useState({ sheetId: null, kortit: null, tila: 'ei' });
  // Haut kisoittain: { [sheetId]: { aika, kesken } }, ettei toisen kisan kesken oleva haku estä tämän hakua.
  const haetutRef = useRef({});
  const avain = valilehdet.join('|');

  const lataa = useCallback(async () => {
    const haettu = haetutRef.current[sheetId] || { aika: 0, kesken: false };
    if (!sheetId || !avain || haettu.kesken || Date.now() - haettu.aika < UUDELLEENHAKU_MS) return;
    haetutRef.current[sheetId] = { aika: haettu.aika, kesken: true };
    setTila((t) => (t.sheetId === sheetId && t.kortit ? t : { sheetId, kortit: null, tila: 'ladataan' }));
    try {
      const csvByName = await haeValilehdet(sheetId, avain.split('|'));
      setTila({ sheetId, kortit: lueMobiiliKortit(csvByName), tila: 'ok' });
      haetutRef.current[sheetId] = { aika: Date.now(), kesken: false };
    } catch (error) {
      console.error('[KIEKOT] Mobiilikorttien haku epäonnistui:', error?.message);
      setTila((t) => (t.sheetId === sheetId && t.kortit ? t : { sheetId, kortit: null, tila: 'virhe' }));
      haetutRef.current[sheetId] = { aika: 0, kesken: false };
    }
  }, [sheetId, avain]);

  const oma = tila.sheetId === sheetId ? tila : { kortit: null, tila: 'ei' };
  return { kortit: oma.kortit, tila: oma.tila, lataa };
}
