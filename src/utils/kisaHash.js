// Avatun kisan tunniste osoitteen hashista (#kisa-<id>). Virheellinen prosenttikoodaus ei kaada sovellusta.
export function lueHashinKisaId(hash) {
  const arvo = String(hash || '');
  if (!arvo.startsWith('#kisa-')) return '';
  try {
    return decodeURIComponent(arvo.slice('#kisa-'.length));
  } catch {
    return '';
  }
}
