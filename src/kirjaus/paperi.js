// Rata tai ryhmä jatkuu paperikorteilla: Compak-laitteen (KirjausApp.jsx) ja ryhmäpuhelimen (RyhmaKirjaus.jsx) yhteinen
// toiminta. Tila on taulukossa (MOBIILI_LAITTEET / MOBIILI_RYHMAT PAPERILLA, api/kirjaus.js toiminto=paperi) ja laitteen
// tilassa (paperilla = aika tai '', paperiPaikallinen = siirto tehty ilman yhteyttä, lähtee kun yhteys palaa,
// paperiPalattu = milloin rata palasi mobiiliin: sen jälkeen avaus hakee paperitulokset ja päivittyy välillä).
import { useCallback, useEffect } from 'react';
import { lueAika } from '../utils/mobiiliLive.js';

// Laitteen aika samassa muodossa kuin taulukon aikaleima (api/_lib/kirjausData.js aikaleima).
export const aikaNyt = () => new Date().toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki' });

// "9.11.2026 klo 10.05.07" → "10.05" (sama jäsennys kuin Radat livessä), muuten sellaisenaan.
export const paperinKello = (aika) => lueAika(aika)?.kello || String(aika || '');

// Mobiiliin palaamisen jälkeen avaus haetaan näin usein näin kauan: toimisto kirjoittaa paperikortteja myöhemmin, ja
// linja ohittaa niiden ampujat vasta, kun avaus kertoo tulokset.
export const PAPERI_PAIVITYS_MS = 3 * 60 * 1000;
export const PAPERI_SEURANTA_MS = 2 * 60 * 60 * 1000;

// Pyytääkö avaus paperitulokset (otsake X-Kirjaus-Paperi): rata on paperilla, palasi äskettäin tai otettiin PIN-koodilla.
export const kysyPaperitulokset = (t, nyt = Date.now()) => Boolean(t.paperilla || t.tarkistaLinja
  || (t.paperiPalattu && nyt - t.paperiPalattu < PAPERI_SEURANTA_MS));

// Tallennuksen vastauksen paperitila tilaan. Vastaus, jonka pyyntö lähti ennen laitteen omaa paperimuutosta (versio
// muuttui), ei kumoa sitä. Palattu mobiiliin: paperiPalattu.
export function paperiVastauksesta(t, paperilla, vanhentunut) {
  if (typeof paperilla !== 'string' || vanhentunut || t.paperiPaikallinen || paperilla === (t.paperilla || '')) return {};
  return { paperilla, ...(t.paperilla && !paperilla ? { paperiPalattu: Date.now() } : {}) };
}

// tila, tilaRef / setTila: laitteen tila. laheta, lahettaaRef, odottavat (tila → lähettämättömät kortit): lähetys.
// linja (tila → linjan tila tai undefined): lähetetään radan linja samalla. versioRef: laitteen omien paperimuutosten
// laskuri, jolla vanhentuneet tallennusvastaukset tunnistetaan. onKorvattu(haltija): rata on toisella laitteella.
// onJatkettu: rata palasi mobiiliin tältä laitteelta (avaus haetaan).
export function usePaperi({ koodi, laite, tila, tilaRef, setTila, laheta, lahettaaRef, odottavat, linja, versioRef, synkViimeksi, onKorvattu, onJatkettu }) {
  // Rata paperille (paalle) tai takaisin mobiiliin. Ilman yhteyttä paperille siirto jää laitteelle ja lähtee, kun
  // yhteys palaa; muu virhe (esim. suojattu taulukko) kerrotaan. Palauttaa true, kun taulukko päivittyi.
  const asetaPaperi = useCallback(async (paalle) => {
    const { haltija } = tilaRef.current;
    if (!haltija) return false;
    versioRef.current += 1;
    try {
      const res = await fetch('/api/kirjaus?toiminto=paperi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, haltija, paalle, ...(linja ? { linja: linja(tilaRef.current) } : {}) })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.korvattu) {
        onKorvattu(data.haltija);
        return false;
      }
      if (!res.ok) {
        window.alert(`Taulukkoon ei saatu tietoa (${data.error || `virhe ${res.status}`}). Kerro kilpailutoimistolle.`);
        setTila((t) => ({ ...t, paperiPaikallinen: false }));
        return false;
      }
      versioRef.current += 1;
      setTila((t) => ({
        ...t, paperilla: data.paperilla || '', paperiPaikallinen: false,
        ...(!paalle ? { paperiPalattu: Date.now() } : {}),
        ...(linja ? { lahetettyLinja: JSON.stringify(linja(t)) } : {})
      }));
      return true;
    } catch {
      if (paalle) setTila((t) => ({ ...t, paperilla: t.paperilla || aikaNyt(), paperiPaikallinen: true }));
      else window.alert('Kirjausta ei saatu jatkumaan (ei yhteyttä). Yritä uudelleen.');
      return false;
    }
  }, [koodi, laite, tilaRef, setTila, linja, versioRef, onKorvattu]);

  // Laitteella odottava siirto paperille lähtee jokaisen onnistuneen lähetyksen jälkeen, kunnes taulukko päivittyy.
  const odottaa = Boolean(tila.paperiPaikallinen && tila.haltija);
  useEffect(() => {
    if (odottaa && synkViimeksi) asetaPaperi(true);
  }, [odottaa, synkViimeksi, asetaPaperi]);

  // Valikosta: viimeiset merkinnät lähetetään (jos yhteys toimii), sitten paperille. Kirjaus pysähtyy heti.
  const siirryPaperille = useCallback(async (kysymys) => {
    if (!window.confirm(kysymys)) return;
    for (let kierros = 0; kierros < 12; kierros++) {
      if (!lahettaaRef.current) await laheta();
      await new Promise((r) => { setTimeout(r, 250); });
      if (!lahettaaRef.current && odottavat(tilaRef.current).length === 0) break;
    }
    if (!tilaRef.current.haltija) {
      setTila((t) => ({ ...t, paperilla: t.paperilla || aikaNyt(), paperiPaikallinen: true }));
      return;
    }
    await asetaPaperi(true);
  }, [laheta, lahettaaRef, odottavat, tilaRef, setTila, asetaPaperi]);

  const jatkaMobiilina = useCallback(async () => {
    if (await asetaPaperi(false)) onJatkettu();
  }, [asetaPaperi, onJatkettu]);

  return { siirryPaperille, jatkaMobiilina };
}

// Mobiiliin palaamisen jälkeen avaus haetaan välillä uudelleen (paperitulokset), PAPERI_SEURANTA_MS ajan.
export function usePaperiSeuranta(paperiPalattu, paivita) {
  useEffect(() => {
    if (!paperiPalattu || Date.now() - paperiPalattu >= PAPERI_SEURANTA_MS) return undefined;
    const vali = setInterval(() => {
      if (Date.now() - paperiPalattu >= PAPERI_SEURANTA_MS) clearInterval(vali);
      else if (document.visibilityState === 'visible') paivita();
    }, PAPERI_PAIVITYS_MS);
    return () => clearInterval(vali);
  }, [paperiPalattu, paivita]);
}
