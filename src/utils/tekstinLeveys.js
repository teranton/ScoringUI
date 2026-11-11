// Width of a text in px in the given CSS font, measured with one shared canvas.
// Returns undefined when it can't be measured (no DOM or canvas, e.g. in tests).
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
