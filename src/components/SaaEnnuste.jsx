// Pieni sääennuste kisakorttiin: kisapäivien sää, ylin/alin lämpötila, sateen todennäköisyys ja tuuli.
// Näytetään vain tulevalle tai käynnissä olevalle kisalle, jolla on paikka rekisterissä ja ennuste saatavilla.
import { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react';
import { haeTekstit } from '../i18n';
import { naytetaankoSaa, saaTyyppi, tamaPaivaSuomessa } from '../utils/saaEnnuste';

const IKONIT = {
  selkea: Sun,
  puolipilvinen: CloudSun,
  pilvinen: Cloud,
  sumu: CloudFog,
  tihku: CloudDrizzle,
  sade: CloudRain,
  lumi: CloudSnow,
  ukkonen: CloudLightning
};

// Sama ennuste jaetaan etusivun ja kisanäkymän kesken; uusi haku aikaisintaan puolen tunnin päästä.
const TUORE_MS = 30 * 60 * 1000;
const haut = new Map();

function haeSaa(sheetId) {
  const tallessa = haut.get(sheetId);
  if (tallessa && Date.now() - tallessa.aika < TUORE_MS) return tallessa.lupaus;
  const lupaus = fetch(`/api/saa?${new URLSearchParams({ sheetId })}`)
    .then((vastaus) => (vastaus.ok ? vastaus.json() : null))
    .catch(() => null)
    .then((data) => {
      // Epäonnistunutta hakua ei muisteta: seuraava näkymä yrittää uudelleen.
      if (Array.isArray(data?.paivat)) return data;
      haut.delete(sheetId);
      return null;
    });
  haut.set(sheetId, { lupaus, aika: Date.now() });
  return lupaus;
}

function muotoilePaiva(pvm, locale) {
  const [v, k, p] = pvm.split('-').map(Number);
  const paiva = new Date(v, k - 1, p);
  const viikonpaiva = paiva.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fi-FI', { weekday: 'short' });
  return `${viikonpaiva.charAt(0).toUpperCase()}${viikonpaiva.slice(1)} ${p}.${k}.`;
}

const asteet = (arvo) => `${Math.round(arvo)}°`;

export default function SaaEnnuste({ kisa, status, locale, className = '' }) {
  const tx = haeTekstit('saa', locale);
  const sheetId = kisa?.apiUrl || '';
  const haetaan = Boolean(sheetId) && naytetaankoSaa(kisa, status);
  const [ennuste, setEnnuste] = useState(null);

  useEffect(() => {
    if (!haetaan) return undefined;
    let peruttu = false;
    haeSaa(sheetId).then((data) => {
      if (!peruttu) setEnnuste(data ? { sheetId, ...data } : null);
    });
    return () => { peruttu = true; };
  }, [haetaan, sheetId]);

  // CDN voi palauttaa edellisenä päivänä tehdyn vastauksen; menneet päivät jätetään pois.
  const tanaan = tamaPaivaSuomessa();
  const paivat = haetaan && ennuste?.sheetId === sheetId ? ennuste.paivat.filter((p) => p.pvm >= tanaan) : [];
  if (!paivat.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs print:hidden text-[hsl(var(--muted-foreground))] ${className}`} aria-label={`${tx.title}${ennuste.paikka ? `, ${ennuste.paikka}` : ''}`}>
      {paivat.map((p) => {
        const tyyppi = saaTyyppi(p.koodi);
        const Ikoni = IKONIT[tyyppi];
        const kuvaus = tx[tyyppi];
        return (
          <span key={p.pvm} className="inline-flex items-center gap-1 whitespace-nowrap" title={kuvaus}>
            <span>{muotoilePaiva(p.pvm, locale)}</span>
            <Ikoni className="h-4 w-4 text-[hsl(var(--foreground))]" aria-label={kuvaus} />
            <span className="font-medium text-[hsl(var(--foreground))]">
              {asteet(p.maks)}{p.min !== null && <span className="font-normal text-[hsl(var(--muted-foreground))]"> / {asteet(p.min)}</span>}
            </span>
            {p.sade !== null && p.sade >= 20 && <span title={tx.rainChance}>☂ {Math.round(p.sade)} %</span>}
            {p.tuuli !== null && <span title={tx.wind}>{Math.round(p.tuuli)} m/s</span>}
          </span>
        );
      })}
      <span className="text-[10px] opacity-70">{tx.source}</span>
    </div>
  );
}
