import net from 'node:net';
import { EstettyHakuError, onEstettyIp, puhdasHost, turvallinenHaku } from './_lib/safeFetch.js';

const logoCache = new Map();

const MEMORY_TTL_MS = Number.isFinite(Number(process.env.LOGO_PROXY_MEMORY_TTL_MS))
  ? Number(process.env.LOGO_PROXY_MEMORY_TTL_MS)
  : 10 * 60 * 1000;

const MAX_IMAGE_BYTES = Number.isFinite(Number(process.env.LOGO_PROXY_MAX_BYTES))
  ? Number(process.env.LOGO_PROXY_MAX_BYTES)
  : 2 * 1024 * 1024;

const HOST_POLICY = String(process.env.LOGO_PROXY_HOST_POLICY || 'public').trim().toLowerCase();

const DEFAULT_ALLOWED_HOSTS = [
  'drive.google.com',
  'lh3.googleusercontent.com',
  'googleusercontent.com',
  // Drive-linkit (drive.google.com/uc?id=...) ohjautuvat tänne
  'usercontent.google.com'
];

function getAllowedHosts() {
  const fromEnv = String(process.env.LOGO_PROXY_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  return fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_HOSTS;
}

function hostAllowed(hostname, allowedHosts) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function isDisallowedPublicModeHost(hostname) {
  const host = puhdasHost(hostname);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (net.isIP(host) && onEstettyIp(host)) return true;
  return false;
}

function hostAllowedByPolicy(hostname) {
  if (HOST_POLICY === 'strict') {
    return hostAllowed(hostname, getAllowedHosts());
  }
  return !isDisallowedPublicModeHost(hostname);
}

// Kuva tarjoillaan sovelluksen omasta originista. Jos SVG avataan suoraan, sen skriptit eivät saa ajautua.
function setImageSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
}

function isSafeImageContentType(value) {
  const ct = String(value || '').toLowerCase();
  return ct.startsWith('image/');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  }

  if (!hostAllowedByPolicy(parsedUrl.hostname)) {
    return res.status(403).json({
      error: HOST_POLICY === 'strict' ? 'Host is not allowed' : 'Host is not allowed by public policy',
      host: parsedUrl.hostname
    });
  }

  const cacheKey = parsedUrl.toString();
  const now = Date.now();
  const cached = logoCache.get(cacheKey);
  if (cached && (now - cached.cachedAt) < MEMORY_TTL_MS) {
    res.setHeader('Content-Type', cached.contentType);
    setImageSecurityHeaders(res);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-ScoringUI-Logo-Cache', 'memory-hit');
    return res.status(200).send(cached.buffer);
  }

  try {
    // Uudelleenohjaukset seurataan itse, jotta jokainen hyppy ja sen IP-osoite tarkistetaan.
    const upstream = await turvallinenHaku(parsedUrl.toString(), {
      hostSallittu: hostAllowedByPolicy,
      maxBytes: MAX_IMAGE_BYTES
    });

    if (upstream.status < 200 || upstream.status >= 300) {
      return res.status(502).json({
        error: 'Upstream logo fetch failed',
        status: upstream.status
      });
    }

    const contentType = String(upstream.headers['content-type'] || '');
    if (!isSafeImageContentType(contentType)) {
      return res.status(415).json({ error: 'Upstream content is not an image' });
    }

    if (upstream.liianSuuri) {
      return res.status(413).json({ error: 'Image exceeds size limit' });
    }

    const buffer = upstream.body;

    logoCache.set(cacheKey, {
      cachedAt: now,
      contentType,
      buffer
    });

    res.setHeader('Content-Type', contentType);
    setImageSecurityHeaders(res);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-ScoringUI-Logo-Cache', 'origin');
    return res.status(200).send(buffer);
  } catch (error) {
    if (error instanceof EstettyHakuError) {
      return res.status(403).json({ error: 'Host is not allowed', message: error.message });
    }
    return res.status(502).json({
      error: 'Logo proxy fetch failed',
      message: error?.message || 'Unknown error'
    });
  }
}