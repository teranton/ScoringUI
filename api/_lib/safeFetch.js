// Haku, joka ei päästä sisäverkkoon: jokainen uudelleenohjaus tarkistetaan erikseen,
// ja yhteys avataan vain osoitteeseen, jonka DNS-tarkistus hyväksyi (ei DNS rebinding -aukkoa).
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10000;

function ipv4Osat(ip) {
  return ip.split('.').map(Number);
}

function onEstettyIpv4(ip) {
  const [a, b, c] = ipv4Osat(ip);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local, pilvien metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // multicast ja varatut
  return false;
}

function ipv6Ryhmat(ip) {
  let osoite = ip.toLowerCase();
  const zone = osoite.indexOf('%');
  if (zone >= 0) osoite = osoite.slice(0, zone);

  // Upotettu IPv4 (esim. ::ffff:127.0.0.1) muutetaan kahdeksi heksaryhmäksi.
  const v4 = osoite.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = ipv4Osat(v4[1]);
    osoite = osoite.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [alku, loppu] = osoite.split('::');
  const alkuRyhmat = alku ? alku.split(':') : [];
  const loppuRyhmat = loppu ? loppu.split(':') : [];
  const taytto = osoite.includes('::') ? 8 - alkuRyhmat.length - loppuRyhmat.length : 0;
  return [...alkuRyhmat, ...Array(taytto).fill('0'), ...loppuRyhmat].map((r) => parseInt(r, 16) || 0);
}

function onEstettyIpv6(ip) {
  const g = ipv6Ryhmat(ip);
  const ylaNollat = g.slice(0, 5).every((x) => x === 0);

  // IPv4-mapped (::ffff:a.b.c.d) ja vanha IPv4-compatible (::a.b.c.d)
  if (ylaNollat && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true; // :: ja ::1
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return onEstettyIpv4(v4);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return onEstettyIpv4(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local (vanhentunut)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // dokumentaatio
  return false;
}

// True, jos IP-osoite on yksityinen, paikallinen tai muuten ei julkinen.
export function onEstettyIp(ip) {
  const versio = net.isIP(ip);
  if (versio === 4) return onEstettyIpv4(ip);
  if (versio === 6) return onEstettyIpv6(ip);
  return true;
}

// URL:n hostname ilman IPv6-hakasulkeita.
export function puhdasHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
}

const luoTurvallinenLookup = (onEstetty) => (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, osoitteet) => {
    if (err) return callback(err);
    const estetty = osoitteet.find((o) => onEstetty(o.address));
    if (estetty) {
      const virhe = new Error(`Osoite ${estetty.address} ei ole sallittu`);
      virhe.code = 'ESTETTY_OSOITE';
      return callback(virhe);
    }
    if (options?.all) return callback(null, osoitteet);
    return callback(null, osoitteet[0].address, osoitteet[0].family);
  });
};

export class EstettyHakuError extends Error {}

function pyynto(url, { maxBytes, lookup }) {
  return new Promise((resolve, reject) => {
    const moduuli = url.protocol === 'https:' ? https : http;
    const req = moduuli.get(url, { lookup, timeout: TIMEOUT_MS }, (res) => {
      const status = res.statusCode || 0;
      const headers = res.headers;

      if (status >= 300 && status < 400 && headers.location) {
        res.resume();
        return resolve({ status, headers, redirect: headers.location });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return resolve({ status, headers });
      }

      const pituus = Number(headers['content-length'] || 0);
      if (pituus > maxBytes) {
        res.destroy();
        return resolve({ status, headers, liianSuuri: true });
      }

      const palat = [];
      let koko = 0;
      res.on('data', (pala) => {
        koko += pala.length;
        if (koko > maxBytes) {
          res.destroy();
          resolve({ status, headers, liianSuuri: true });
          return;
        }
        palat.push(pala);
      });
      res.on('end', () => resolve({ status, headers, body: Buffer.concat(palat) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Aikakatkaisu')));
    req.on('error', (err) => {
      if (err.code === 'ESTETTY_OSOITE') reject(new EstettyHakuError(err.message));
      else reject(err);
    });
  });
}

// Hakee URL:n ja seuraa uudelleenohjauksia itse. hostSallittu(hostname) ja IP-tarkistus tehdään jokaisella hypyllä.
// onEstetty vaihdetaan vain testeissä.
export async function turvallinenHaku(alkuUrl, { hostSallittu, maxBytes, onEstetty = onEstettyIp }) {
  let url = new URL(alkuUrl);
  const lookup = luoTurvallinenLookup(onEstetty);

  for (let hyppy = 0; hyppy <= MAX_REDIRECTS; hyppy++) {
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new EstettyHakuError('Vain http/https-osoitteet ovat sallittuja');
    }
    const host = puhdasHost(url.hostname);
    if (net.isIP(host) && onEstetty(host)) {
      throw new EstettyHakuError(`Osoite ${host} ei ole sallittu`);
    }
    if (!hostSallittu(host)) {
      throw new EstettyHakuError(`Host ${host} ei ole sallittu`);
    }

    const vastaus = await pyynto(url, { maxBytes, lookup });
    if (!vastaus.redirect) return { ...vastaus, url };
    url = new URL(vastaus.redirect, url);
  }

  throw new EstettyHakuError('Liikaa uudelleenohjauksia');
}
