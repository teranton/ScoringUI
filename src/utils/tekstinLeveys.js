// Tekstin leveys (px) annetulla CSS-fontilla canvasilla mitattuna. Yksi jaettu canvas.
// Palauttaa undefined, jos mittaus ei onnistu (ei DOMia tai canvasia: testit, SSR).
let konteksti = null;

export function mittaaTeksti(teksti, fontti) {
  if (typeof document === 'undefined') return undefined;
  try {
    konteksti = konteksti || document.createElement('canvas').getContext('2d');
  } catch {
    return undefined;
  }
  if (!konteksti) return undefined;
  konteksti.font = fontti;
  return konteksti.measureText(String(teksti ?? '')).width;
}
