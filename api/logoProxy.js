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
  'googleusercontent.com'
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

function isIpv4Literal(host) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4) return false;
  return parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

function isPrivateIpv4(host) {
  if (!isIpv4Literal(host)) return false;
  const [a, b] = host.split('.').map(Number);

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

function isIpv6Literal(host) {
  return host.includes(':');
}

function isPrivateOrLocalIpv6(host) {
  if (!isIpv6Literal(host)) return false;
  const value = host.toLowerCase();
  return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
}

function isDisallowedPublicModeHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost') return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isPrivateIpv4(host)) return true;
  if (isPrivateOrLocalIpv6(host)) return true;
  return false;
}

function hostAllowedByPolicy(hostname) {
  if (HOST_POLICY === 'strict') {
    return hostAllowed(hostname, getAllowedHosts());
  }
  return !isDisallowedPublicModeHost(hostname);
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
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-ScoringUI-Logo-Cache', 'memory-hit');
    return res.status(200).send(cached.buffer);
  }

  try {
    const upstream = await fetch(parsedUrl.toString(), {
      redirect: 'follow'
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: 'Upstream logo fetch failed',
        status: upstream.status
      });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!isSafeImageContentType(contentType)) {
      return res.status(415).json({ error: 'Upstream content is not an image' });
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image exceeds size limit' });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image exceeds size limit' });
    }

    logoCache.set(cacheKey, {
      cachedAt: now,
      contentType,
      buffer
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-ScoringUI-Logo-Cache', 'origin');
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(502).json({
      error: 'Logo proxy fetch failed',
      message: error?.message || 'Unknown error'
    });
  }
}