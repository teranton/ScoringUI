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

// vercelEnintaan (s): Vercelin CDN pitää vastauksen enintään näin kauan (käynnissä olevan kisan data). Muuten Vercelin
// ja Cloudflaren kopiot kasautuvat: Cloudflare hakee Vercelin jo 15 s vanhan kopion ja pitää sitä vielä omat 15 + 15 s.
// Lyhyt aika pitää silti Vercelin CDN:n yhdistämässä pyynnöt (Google-haut eivät riipu funktioinstanssien määrästä),
// ja Cloudflaren ohittava pyyntö (esikatselu, vercel.app) saa yhä välimuistin.
export function asetaValimuisti(res, cacheControl, { vercelEnintaan } = {}) {
  res.setHeader('Cache-Control', cacheControl);
  const cloudflare = cloudflareOtsikko(cacheControl);
  if (cloudflare) res.setHeader('Cloudflare-CDN-Cache-Control', cloudflare);
  if (cloudflare && Number.isInteger(vercelEnintaan)) res.setHeader('Vercel-CDN-Cache-Control', `max-age=${vercelEnintaan}`);
}
