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

export function asetaValimuisti(res, cacheControl) {
  res.setHeader('Cache-Control', cacheControl);
  const cloudflare = cloudflareOtsikko(cacheControl);
  if (cloudflare) res.setHeader('Cloudflare-CDN-Cache-Control', cloudflare);
}
