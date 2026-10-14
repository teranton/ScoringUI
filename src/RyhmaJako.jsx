// src/RyhmaJako.jsx
// Järjestäjän ryhmien muokkaus: kahden ampujan paikkojen vaihto ryhmien välillä.
// Raahaus toimii hiirellä ja kosketuksella (kahvasta, pointer-tapahtumat), ja napautus kahteen ampujaan tekee saman.
// Data luetaan ja kirjoitetaan käyttäjän omalla Google-tunnisteella (utils/googleKayttaja.js).
import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Lock, LogOut, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { haeTekstit } from './i18n';
import {
  SheetsVirhe,
  googleClientId,
  haeRivit,
  haeTaulukonMeta,
  kirjaudu,
  kirjauduUlos,
  lataaGoogleKirjautuminen,
  onkoKirjautunut,
  paivitaTaulukko,
  voikoMuokata
} from './utils/googleKayttaja';
import {
  etsiOsallistujaAlue,
  muodostaRyhmat,
  osallistujaAlueA1,
  parsiOsallistujat,
  tarkistaVaihto,
  vaihdaPaikallisesti,
  vaihtoPyynnot
} from './utils/ryhmaMuokkaus';

const tayta = (teksti, arvot) => teksti.replace(/\{(\w+)\}/g, (_, avain) => String(arvot[avain] ?? ''));

// Näin lähellä ikkunan ylä- tai alareunaa raahaus vierittää sivua (mobiilissa pitkät ryhmälistat).
const VIERITYSREUNA = 72;

function kohdeRiviPisteessa(x, y) {
  const elementti = document.elementFromPoint(x, y)?.closest?.('[data-ampuja-rivi]');
  return elementti ? Number(elementti.dataset.ampujaRivi) : null;
}

async function lueOsallistujat(sheetId, alue) {
  const rowData = await haeRivit(sheetId, osallistujaAlueA1(alue));
  return { alue, ...parsiOsallistujat(rowData, alue) };
}

async function haeOsallistujatJaOikeus(sheetId) {
  const alue = etsiOsallistujaAlue(await haeTaulukonMeta(sheetId));
  const [tuore, voi] = await Promise.all([lueOsallistujat(sheetId, alue), voikoMuokata(sheetId)]);
  return { tuore, voi };
}

export default function RyhmaJako({ sheetId, ryhmaKoko, locale = 'fi' }) {
  const tx = haeTekstit('ryhmaJako', locale);
  const kaytossa = Boolean(googleClientId());

  const [kirjautunut, setKirjautunut] = useState(() => onkoKirjautunut());
  const [ladataan, setLadataan] = useState(() => onkoKirjautunut());
  const [latausVirhe, setLatausVirhe] = useState('');
  const [data, setData] = useState(null); // { alue, sarakkeet, ampujat }
  const [muokattava, setMuokattava] = useState(false);
  const [valittuRivi, setValittuRivi] = useState(null);
  const [tallennetaan, setTallennetaan] = useState(false);
  const [viesti, setViesti] = useState(null); // { teksti, virhe?, kumoa?: [a, b] }
  const [raahaus, setRaahaus] = useState(null); // { lahde, x, y, kohdeRivi }
  const raahausRef = useRef(null);
  const vieritysRef = useRef(null);

  useEffect(() => {
    if (kaytossa) lataaGoogleKirjautuminen().catch(() => {});
  }, [kaytossa]);

  const kasitteleVirhe = useCallback((virhe, pohja) => {
    if (virhe instanceof SheetsVirhe && virhe.status === 401) {
      setKirjautunut(false);
      setData(null);
      setMuokattava(false);
      return tx.sessionExpired;
    }
    return tayta(pohja, { virhe: virhe?.message || String(virhe) });
  }, [tx]);

  // Latauksen tulos tilaan (kutsutaan lupauksen then-käsittelijöistä).
  const kaytaLatausta = useCallback(({ tuore, voi }) => {
    setData(tuore);
    setMuokattava(voi);
    setValittuRivi(null);
    setLatausVirhe('');
    setLadataan(false);
  }, []);
  const latausEpaonnistui = useCallback((virhe) => {
    setData(null);
    setLatausVirhe(virhe instanceof SheetsVirhe && (virhe.status === 403 || virhe.status === 404)
      ? tx.noAccess
      : kasitteleVirhe(virhe, tx.loadFailed));
    setLadataan(false);
  }, [tx, kasitteleVirhe]);

  const lataa = () => {
    setLadataan(true);
    haeOsallistujatJaOikeus(sheetId).then(kaytaLatausta, latausEpaonnistui);
  };

  // Kirjautunut käyttäjä (esim. toisesta kisasta palatessa) näkee ryhmät heti.
  useEffect(() => {
    if (!kaytossa || !kirjautunut) return undefined;
    let voimassa = true;
    haeOsallistujatJaOikeus(sheetId).then(
      (tulos) => { if (voimassa) kaytaLatausta(tulos); },
      (virhe) => { if (voimassa) latausEpaonnistui(virhe); }
    );
    return () => { voimassa = false; };
  }, [kaytossa, kirjautunut, sheetId, kaytaLatausta, latausEpaonnistui]);

  const kirjauduSisaan = async () => {
    try {
      await kirjaudu();
      setLadataan(true);
      setKirjautunut(true);
    } catch (virhe) {
      setLatausVirhe(virhe?.message || String(virhe));
    }
  };

  const kirjauduPois = () => {
    kirjauduUlos();
    setKirjautunut(false);
    setData(null);
    setViesti(null);
  };

  const teeVaihto = async (a, b) => {
    if (!data || tallennetaan || !a || !b || a.rivi === b.rivi) return;
    if (a.onTuloksia || b.onTuloksia) {
      setViesti({ teksti: tx.hasResults, virhe: true });
      return;
    }
    const ennen = data;
    setTallennetaan(true);
    setValittuRivi(null);
    setViesti(null);
    setData({ ...data, ampujat: vaihdaPaikallisesti(data.ampujat, a, b) });
    try {
      // Luetaan rivit juuri ennen kirjoitusta: toinen järjestäjä tai taulukko on voinut muuttaa niitä.
      const tuore = await lueOsallistujat(sheetId, data.alue);
      const tarkistus = tarkistaVaihto(tuore.ampujat, a, b, tuore.sarakkeet.leveys);
      if (!tarkistus.ok) {
        setData(tuore);
        setViesti({ teksti: { tuloksia: tx.hasResults, kaavoja: tx.formulas }[tarkistus.syy] || tx.changed, virhe: true });
        return;
      }
      await paivitaTaulukko(sheetId, vaihtoPyynnot(tuore.alue.sheetId, tarkistus.a, tarkistus.b, tuore.sarakkeet.leveys));
      // Tallennus onnistui. Uudelleenluku antaa kaavojen arvot (numerot, ryhmät); jos se epäonnistuu,
      // vaihto näytetään tuoreesta datasta laskettuna eikä virheenä.
      const jalkeen = await lueOsallistujat(sheetId, data.alue)
        .catch(() => ({ ...tuore, ampujat: vaihdaPaikallisesti(tuore.ampujat, tarkistus.a, tarkistus.b) }));
      setData(jalkeen);
      const uusiA = jalkeen.ampujat.find((x) => x.rivi === a.rivi);
      const uusiB = jalkeen.ampujat.find((x) => x.rivi === b.rivi);
      setViesti({ teksti: tayta(tx.swapped, { a: a.nimi, b: b.nimi }), kumoa: uusiA && uusiB ? [uusiA, uusiB] : null });
    } catch (virhe) {
      setData(ennen);
      if (virhe instanceof SheetsVirhe && virhe.status === 403) {
        setMuokattava(false);
        setViesti({ teksti: tx.readOnly, virhe: true });
      } else {
        setViesti({ teksti: kasitteleVirhe(virhe, tx.saveFailed), virhe: true });
      }
    } finally {
      setTallennetaan(false);
    }
  };

  const ampujaRivilla = (rivi) => data?.ampujat.find((x) => x.rivi === rivi) || null;
  const voiSiirtaa = (ampuja) => muokattava && !tallennetaan && !ampuja.onTuloksia;

  // --- Raahaus: kahva kaappaa osoittimen, joten liike ja irrotus tulevat kahvalle myös sormen ollessa muualla.
  const paivitaRaahaus = (muutos) => {
    raahausRef.current = { ...raahausRef.current, ...muutos };
    setRaahaus(raahausRef.current);
  };

  const lopetaVieritys = () => {
    if (vieritysRef.current) cancelAnimationFrame(vieritysRef.current);
    vieritysRef.current = null;
  };

  const vierita = () => {
    const r = raahausRef.current;
    if (!r) return;
    let maara = 0;
    if (r.y < VIERITYSREUNA) maara = -Math.ceil((VIERITYSREUNA - r.y) / 4);
    else if (r.y > window.innerHeight - VIERITYSREUNA) maara = Math.ceil((r.y - (window.innerHeight - VIERITYSREUNA)) / 4);
    if (maara) {
      window.scrollBy(0, maara);
      paivitaRaahaus({ kohdeRivi: kohdeRiviPisteessa(r.x, r.y) });
    }
    vieritysRef.current = requestAnimationFrame(vierita);
  };

  const aloitaRaahaus = (e, ampuja) => {
    if (!voiSiirtaa(ampuja) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    raahausRef.current = { lahde: ampuja, x: e.clientX, y: e.clientY, kohdeRivi: null, pointerId: e.pointerId };
    setRaahaus(raahausRef.current);
    setValittuRivi(null);
    lopetaVieritys();
    vieritysRef.current = requestAnimationFrame(vierita);
  };

  const liikuta = (e) => {
    if (raahausRef.current?.pointerId !== e.pointerId) return;
    paivitaRaahaus({ x: e.clientX, y: e.clientY, kohdeRivi: kohdeRiviPisteessa(e.clientX, e.clientY) });
  };

  const pudota = (e, peru = false) => {
    const r = raahausRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    raahausRef.current = null;
    setRaahaus(null);
    lopetaVieritys();
    if (peru) return;
    const kohde = ampujaRivilla(kohdeRiviPisteessa(e.clientX, e.clientY));
    if (kohde && kohde.rivi !== r.lahde.rivi) teeVaihto(r.lahde, kohde);
  };

  useEffect(() => lopetaVieritys, []);

  // --- Napautus: ensin ampuja, sitten se, jonka kanssa vaihdetaan.
  const napauta = (ampuja) => {
    if (!muokattava || tallennetaan) return;
    if (ampuja.onTuloksia) {
      setViesti({ teksti: tx.hasResults, virhe: true });
      return;
    }
    if (valittuRivi === null) setValittuRivi(ampuja.rivi);
    else if (valittuRivi === ampuja.rivi) setValittuRivi(null);
    else teeVaihto(ampujaRivilla(valittuRivi), ampuja);
  };

  if (!kaytossa) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.notConfigured}</div>;
  }

  const ryhmat = data ? muodostaRyhmat(data.ampujat, ryhmaKoko) : [];
  const valittu = valittuRivi !== null ? ampujaRivilla(valittuRivi) : null;
  const kohdeRivi = raahaus?.kohdeRivi ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3">
      <Card>
        <CardHeader className="gap-2 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-lg">{tx.title}</CardTitle>
            {kirjautunut && (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={lataa} disabled={ladataan || tallennetaan}>
                  <RefreshCw className={`h-4 w-4${ladataan ? ' animate-spin' : ''}`} aria-hidden="true" />
                  {tx.reload}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={kirjauduPois}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {tx.signOut}
                </Button>
              </div>
            )}
          </div>
          {kirjautunut ? (
            muokattava ? (
              <>
                <CardDescription>{tx.description}</CardDescription>
                <CardDescription>{tx.numberNote}</CardDescription>
              </>
            ) : data && <CardDescription className="font-medium text-amber-700">{tx.readOnly}</CardDescription>
          ) : (
            <>
              <CardDescription>{tx.signInInfo}</CardDescription>
              <Button type="button" className="w-fit" onClick={kirjauduSisaan}>{tx.signIn}</Button>
            </>
          )}
          {latausVirhe && <div className="text-sm font-medium text-rose-600">{latausVirhe}</div>}
        </CardHeader>
      </Card>

      {kirjautunut && ladataan && !data && (
        <div className="py-4 text-sm text-[hsl(var(--muted-foreground))]">{tx.loading}</div>
      )}

      {data && ryhmat.length === 0 && (
        <div className="py-4 text-sm text-[hsl(var(--muted-foreground))]">{tx.empty}</div>
      )}

      {(viesti || valittu || tallennetaan) && (
        <div
          role="status"
          className={`sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm ${viesti?.virhe ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}
        >
          <span>{tallennetaan ? tx.saving : valittu ? tayta(tx.selected, { nimi: valittu.nimi }) : viesti?.teksti}</span>
          {!tallennetaan && valittu && (
            <Button type="button" size="sm" variant="outline" onClick={() => setValittuRivi(null)}>{tx.cancel}</Button>
          )}
          {!tallennetaan && !valittu && viesti?.kumoa && muokattava && (
            <Button type="button" size="sm" variant="outline" onClick={() => teeVaihto(...viesti.kumoa)}>{tx.undo}</Button>
          )}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ryhmat.map((ryhma) => (
            <Card key={ryhma.numero} className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2">
                <CardTitle className="text-base">{tx.squad} {ryhma.numero}</CardTitle>
                <Badge variant="outline">{ryhma.ampujat.length}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 p-2">
                {ryhma.ampujat.map((ampuja) => {
                  const siirrettava = voiSiirtaa(ampuja);
                  const onLahde = raahaus?.lahde.rivi === ampuja.rivi;
                  const onKohde = raahaus && kohdeRivi === ampuja.rivi && !onLahde;
                  const onValittu = valittuRivi === ampuja.rivi;
                  const kehys = onKohde
                    ? (ampuja.onTuloksia ? 'border-rose-400 bg-rose-50' : 'border-[hsl(var(--primary))] bg-[hsl(var(--muted))] ring-2 ring-[hsl(var(--primary))]')
                    : onValittu ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]';
                  return (
                    <div
                      key={ampuja.rivi}
                      data-ampuja-rivi={ampuja.rivi}
                      className={`flex select-none items-stretch rounded-md border bg-[hsl(var(--card))] text-sm [-webkit-touch-callout:none] ${kehys}${onLahde ? ' opacity-40' : ''}`}
                    >
                      {siirrettava ? (
                        <button
                          type="button"
                          aria-label={tayta(tx.dragHandle, { nimi: ampuja.nimi })}
                          className="flex w-10 shrink-0 cursor-grab touch-none items-center justify-center text-[hsl(var(--muted-foreground))] active:cursor-grabbing"
                          onPointerDown={(e) => aloitaRaahaus(e, ampuja)}
                          onPointerMove={liikuta}
                          onPointerUp={(e) => pudota(e)}
                          onPointerCancel={(e) => pudota(e, true)}
                          onClick={(e) => e.preventDefault()}
                        >
                          <GripVertical className="h-5 w-5" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="flex w-10 shrink-0 items-center justify-center text-[hsl(var(--muted-foreground))]" title={ampuja.onTuloksia ? tx.locked : undefined}>
                          {ampuja.onTuloksia && <Lock className="h-4 w-4" aria-label={tx.locked} />}
                        </span>
                      )}
                      <button
                        type="button"
                        className="flex min-h-11 flex-1 items-center gap-2 py-1.5 pr-3 text-left disabled:cursor-default"
                        onClick={() => napauta(ampuja)}
                        disabled={!muokattava || tallennetaan}
                        aria-pressed={onValittu}
                      >
                        <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-[hsl(var(--muted-foreground))]" translate="no">{ampuja.nro}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium" translate="no">{ampuja.nimi}</span>
                          <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]" translate="no">
                            {[ampuja.sarja, ampuja.seura].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Raahattava nimi näkyy sormen yläpuolella, ettei sormi peitä sitä. */}
      {raahaus && (
        <div
          className="pointer-events-none fixed z-50 max-w-[70vw] -translate-x-1/2 -translate-y-[160%] truncate rounded-md border border-[hsl(var(--primary))] bg-[hsl(var(--card))] px-3 py-2 text-sm font-medium shadow-lg"
          style={{ left: raahaus.x, top: raahaus.y }}
          translate="no"
        >
          {raahaus.lahde.nro} {raahaus.lahde.nimi}
        </div>
      )}
    </div>
  );
}
