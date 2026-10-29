// Välimuistiotsikot API-vastauksille. Vercel käyttää Cache-Controlin s-maxage-arvon omassa CDN:ssään ja poistaa sen
// selaimelle lähtevästä otsikosta, joten Vercelin edessä oleva Cloudflare ei näkisi sitä. Cloudflare-CDN-Cache-Control
// kulkee Vercelin läpi sellaisenaan, ja vain Cloudflare lukee sen: sama tuoreus ja stale-while-revalidate kuin Vercelillä.

// 'public, s-maxage=15, stale-while-revalidate=15' → 'max-age=15, stale-while-revalidate=15'; ilman s-maxagea null.
export function cloudflareOtsikko(cacheControl) {
  const osat = String(cacheControl || '').split(',').map((o) => o.trim());
  const tuore = osat.find((o) => /^s-maxage=\d+$/.test(o));
  if (!tuore) return null;
  const vanha = osat.find((o) => /^stale-while-revalidate=\d+$/.test(o));
  return [tuore.replace('s-maxage', 'max-age'), vanha].filter(Boolean).join(', ');
}

// vainCloudflare: Vercelin CDN ei pidä vastausta (käynnissä olevan kisan 15 s data). Muuten Vercelin ja Cloudflaren
// kopiot kasautuvat: Cloudflare hakee Vercelin jo vanhentuneen kopion ja pitää sitä vielä omat 15 + 15 s. Palvelimen
// välimuisti antaa Cloudflarelle vain jäljellä olevan ajan (cdnOtsikko), joten se ei kasaudu, ja Google-haut pysyvät
// enintään yhdessä per välilehtijoukko ja 15 s per funktioinstanssi.
export function asetaValimuisti(res, cacheControl, { vainCloudflare = false } = {}) {
  res.setHeader('Cache-Control', cacheControl);
  const cloudflare = cloudflareOtsikko(cacheControl);
  if (cloudflare) res.setHeader('Cloudflare-CDN-Cache-Control', cloudflare);
  if (cloudflare && vainCloudflare) res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
}
