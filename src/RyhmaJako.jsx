// src/RyhmaJako.jsx
// Järjestäjän ryhmien muokkaus: ampujan siirto vapaalle paikalle, järjestys ryhmän sisällä ja vaihto ryhmien välillä.
// Raahaus toimii hiirellä ja kosketuksella (kahvasta, pointer-tapahtumat), ja napautus ampujaan ja paikkaan tekee saman.
// Ryhmät on väritetty täyttöasteen mukaan, ja otsikossa näkyvät ryhmän lähtöajat aikataulusta.
// Data luetaan ja kirjoitetaan käyttäjän omalla Google-tunnisteella (utils/googleKayttaja.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, GripVertical, Lock, LogOut, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Button } from './components/ui/button';
import { haeTekstit } from './i18n';
import {
  SheetsVirhe,
  googleClientId,
  haeRivit,
  haeTaulukonMeta,
  kirjaudu,
  kirjautunutTili,
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
  kumoaSijoitukset,
  laskeRyhmaKoko,
  nimetTasmaavat,
  odotetutNimet,
  parsiOsallistujat,
  ryhmanTayttoaste,
  siirtoPyynnot,
  sovellaPaikallisesti,
  suunnitteleSiirto
} from './utils/ryhmaMuokkaus';
import { lueLahtoajat, ryhmanLahtoajat } from './utils/ryhmaLahtoajat';

const tayta = (teksti, arvot) => teksti.replace(/\{(\w+)\}/g, (_, avain) => String(arvot[avain] ?? ''));

// Näin lähellä ikkunan ylä- tai alareunaa raahaus vierittää sivua (mobiilissa pitkät ryhmälistat).
const VIERITYSREUNA = 72;

// Ryhmän väri täyttöasteen mukaan: täysi vihreä, yksi vapaa keltainen, useampi vapaa punainen.
const TAYTTOASTE_VARIT = {
  taysi: { kortti: 'border-emerald-400', otsikko: 'bg-emerald-50 text-emerald-900', merkki: 'bg-emerald-600 text-white', piste: 'bg-emerald-500' },
  lahes: { kortti: 'border-amber-400', otsikko: 'bg-amber-50 text-amber-900', merkki: 'bg-amber-500 text-white', piste: 'bg-amber-400' },
  vajaa: { kortti: 'border-rose-400', otsikko: 'bg-rose-50 text-rose-900', merkki: 'bg-rose-600 text-white', piste: 'bg-rose-500' },
  tyhja: { kortti: 'border-[hsl(var(--border))]', otsikko: 'bg-[hsl(var(--muted))]', merkki: 'bg-[hsl(var(--muted-foreground))] text-white', piste: 'bg-[hsl(var(--muted-foreground))]' }
};

const paikoilla = (data, paikat) => ({ ...data, paikat, ampujat: paikat.filter((p) => p.tyyppi === 'ampuja') });

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

export default function RyhmaJako({ sheetId, ryhmaKoko, ryhmittely, aikataulut, eiTuomaroivat, locale = 'fi' }) {
  const tx = haeTekstit('ryhmaJako', locale);
  const txAikataulu = haeTekstit('aikatauluRyhma', locale);
  // KISANSPEKSIT "Ei tuomaroivat:" -sarjat korostetaan, jotta niitä ei kerry liikaa samaan ryhmään.
  // Sarja verrataan sellaisenaan kuten ScoringLibin arvonnassa.
  const eiTuomaroivatSarjat = useMemo(() => new Set(eiTuomaroivat || []), [eiTuomaroivat]);
  const eiTuomaroi = (paikka) => Boolean(paikka.sarja) && eiTuomaroivatSarjat.has(paikka.sarja);
  const lahtoajat = useMemo(() => lueLahtoajat(aikataulut, ryhmittely, txAikataulu), [aikataulut, ryhmittely, txAikataulu]);
  const kaytossa = Boolean(googleClientId());

  const [kirjautunut, setKirjautunut] = useState(() => onkoKirjautunut());
  const [ladataan, setLadataan] = useState(() => onkoKirjautunut());
  const [latausVirhe, setLatausVirhe] = useState('');
  const [data, setData] = useState(null); // { alue, sarakkeet, paikat, ampujat }
  const [muokattava, setMuokattava] = useState(false);
  const [valittuRivi, setValittuRivi] = useState(null);
  const [tallennetaan, setTallennetaan] = useState(false);
  const [viesti, setViesti] = useState(null); // { teksti, virhe?, kumoa?: { ennen, odotetut } }
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

  const paikkaRivilla = (rivi) => data?.paikat.find((x) => x.rivi === rivi) || null;
  const voiSiirtaa = (paikka) => muokattava && !tallennetaan && paikka.tyyppi === 'ampuja' && !paikka.onTuloksia;

  // Ryhmäkoko, jolla paikat jaetaan ryhmiin (asetus tai suurin taulukon ryhmä).
  const ryhmaKokoNyt = (paikat) => laskeRyhmaKoko(paikat, ryhmaKoko).koko;
  const syynTeksti = (syy) => ({ tuloksia: tx.hasResults, kaavoja: tx.formulas, lukittu: tx.formulaName }[syy] || tx.changed);

  // Yhteinen tallennus: näkymä päivittyy heti, rivit luetaan juuri ennen kirjoitusta (toinen järjestäjä tai taulukko
  // on voinut muuttaa niitä), suunnitelma tehdään tuoreesta datasta ja kirjoitetaan yhdellä batchUpdatella.
  // suunnittele(tuore) palauttaa { ok, sijoitukset } tai { ok: false, syy }; valmis(suunnitelma) antaa viestin
  // kirjoitetusta (tuoreesta) suunnitelmasta.
  const tallenna = async (paikallinen, suunnittele, valmis) => {
    const ennen = data;
    setTallennetaan(true);
    setValittuRivi(null);
    setViesti(null);
    if (paikallinen) setData(paikoilla(data, sovellaPaikallisesti(data.paikat, paikallinen)));
    try {
      const tuore = await lueOsallistujat(sheetId, data.alue);
      const suunnitelma = suunnittele(tuore);
      const pyynnot = suunnitelma.ok ? siirtoPyynnot(tuore.alue.sheetId, suunnitelma.sijoitukset, tuore.sarakkeet) : suunnitelma;
      if (!pyynnot.ok) {
        setData(tuore);
        setViesti({ teksti: syynTeksti(pyynnot.syy), virhe: true });
        return;
      }
      if (pyynnot.pyynnot.length) await paivitaTaulukko(sheetId, pyynnot.pyynnot);
      // Tallennus onnistui. Uudelleenluku antaa kaavojen arvot; jos se epäonnistuu, muutos näytetään
      // tuoreesta datasta laskettuna eikä virheenä.
      const jalkeen = await lueOsallistujat(sheetId, data.alue)
        .catch(() => paikoilla(tuore, sovellaPaikallisesti(tuore.paikat, suunnitelma.sijoitukset)));
      setData(jalkeen);
      setViesti(valmis(suunnitelma));
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

  const teeSiirto = (lahde, kohde) => {
    if (!data || tallennetaan || !lahde || !kohde || lahde.rivi === kohde.rivi) return;
    const suunnitelma = suunnitteleSiirto(data.paikat, lahde.rivi, kohde.rivi, ryhmaKokoNyt(data.paikat));
    if (!suunnitelma.ok) {
      setValittuRivi(null);
      setViesti({ teksti: syynTeksti(suunnitelma.syy), virhe: true });
      // Näkymä ei vastaa taulukkoa: ladataan, kuten viesti kertoo.
      if (suunnitelma.syy === 'muuttunut') lataa();
      return;
    }
    const nahdyt = [{ rivi: lahde.rivi, nimi: lahde.nimi }, { rivi: kohde.rivi, nimi: kohde.nimi }];
    tallenna(
      suunnitelma.sijoitukset,
      (tuore) => (nimetTasmaavat(tuore.paikat, nahdyt)
        ? suunnitteleSiirto(tuore.paikat, lahde.rivi, kohde.rivi, ryhmaKokoNyt(tuore.paikat))
        : { ok: false, syy: 'muuttunut' }),
      ({ toiminto, sijoitukset }) => ({
        teksti: toiminto === 'vaihto'
          ? tayta(tx.swapped, { a: lahde.nimi, b: kohde.nimi })
          : tayta(tx.moved, { nimi: lahde.nimi, nro: sijoitukset.find((x) => x.lahde?.rivi === lahde.rivi)?.kohde.nro ?? kohde.nro }),
        kumoa: { ennen: sijoitukset.map((x) => x.kohde), odotetut: odotetutNimet(sijoitukset) }
      })
    );
  };

  // Kumoaminen palauttaa muutetut rivit ennalleen, jos kukaan ei ole muuttanut niitä välissä.
  const kumoa = ({ ennen, odotetut }) => {
    if (!data || tallennetaan) return;
    tallenna(
      null,
      (tuore) => {
        if (!nimetTasmaavat(tuore.paikat, odotetut)) return { ok: false, syy: 'muuttunut' };
        const sijoitukset = kumoaSijoitukset(tuore.paikat, ennen);
        if (sijoitukset.some((s) => s.kohde.onTuloksia)) return { ok: false, syy: 'tuloksia' };
        return { ok: true, sijoitukset };
      },
      () => ({ teksti: tx.undone })
    );
  };

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
    const kohde = paikkaRivilla(kohdeRiviPisteessa(e.clientX, e.clientY));
    if (kohde && kohde.rivi !== r.lahde.rivi) teeSiirto(r.lahde, kohde);
  };

  useEffect(() => lopetaVieritys, []);

  const ryhmat = useMemo(() => (data ? muodostaRyhmat(data.paikat, ryhmaKoko) : []), [data, ryhmaKoko]);

  // --- Napautus: ensin ampuja, sitten paikka (vapaa paikka tai toinen ampuja).
  const napauta = (paikka) => {
    if (!muokattava || tallennetaan) return;
    if (valittuRivi === null) {
      if (voiSiirtaa(paikka)) setValittuRivi(paikka.rivi);
      else if (paikka.onTuloksia) setViesti({ teksti: tx.hasResults, virhe: true });
      else if (paikka.tyyppi === 'lukittu') setViesti({ teksti: tx.formulaName, virhe: true });
    } else if (valittuRivi === paikka.rivi) {
      setValittuRivi(null);
    } else {
      teeSiirto(paikkaRivilla(valittuRivi), paikka);
    }
  };

  if (!kaytossa) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.notConfigured}</div>;
  }

  const valittu = valittuRivi !== null ? paikkaRivilla(valittuRivi) : null;
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
          {kirjautunut && kirjautunutTili() && (
            <CardDescription>{tayta(tx.signedInAs, { tili: kirjautunutTili() })}</CardDescription>
          )}
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
            <Button type="button" size="sm" variant="outline" onClick={() => kumoa(viesti.kumoa)}>{tx.undo}</Button>
          )}
        </div>
      )}

      {data && ryhmat.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-[hsl(var(--muted-foreground))]">
          {[['taysi', tx.legendFull], ['lahes', tx.legendOneFree], ['vajaa', tx.legendFree]].map(([aste, teksti]) => (
            <span key={aste} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${TAYTTOASTE_VARIT[aste].piste}`} aria-hidden="true" />
              {teksti}
            </span>
          ))}
          {eiTuomaroivatSarjat.size > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" aria-hidden="true" />
              {tx.legendNonReferee} ({eiTuomaroivat.join(', ')})
            </span>
          )}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ryhmat.map((ryhma) => {
            const varit = TAYTTOASTE_VARIT[ryhmanTayttoaste(ryhma)];
            const ajat = ryhmanLahtoajat(lahtoajat, ryhma);
            const eiTuomaroivia = ryhma.paikat.filter(eiTuomaroi).length;
            return (
              <Card key={ryhma.numero} className={`overflow-hidden border-2 ${varit.kortti}`}>
                <CardHeader className={`space-y-1 border-b border-[hsl(var(--border))] px-3 py-2 ${varit.otsikko}`}>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{tx.squad} {ryhma.numero}</CardTitle>
                    {eiTuomaroivia > 0 && (
                      <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                        {tayta(tx.nonRefereeCount, { n: eiTuomaroivia })}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${varit.merkki}`}
                      title={tayta(tx.fillLabel, { n: ryhma.ampujia, koko: ryhma.koko })}
                      aria-label={tayta(tx.fillLabel, { n: ryhma.ampujia, koko: ryhma.koko })}
                    >
                      {tayta(tx.fill, { n: ryhma.ampujia, koko: ryhma.koko })}
                    </span>
                  </div>
                  {ajat.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" aria-label={tx.startTimes}>
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {ajat.map(({ paiva, aika }, i) => (
                        <span key={i} className="tabular-nums">
                          {paiva && <span className="font-medium">{paiva} </span>}
                          {aika}
                        </span>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5 p-2">
                  {ryhma.paikat.map((paikka) => {
                    const onAmpuja = paikka.tyyppi === 'ampuja' || paikka.tyyppi === 'lukittu';
                    const siirrettava = voiSiirtaa(paikka);
                    const lukossa = paikka.onTuloksia || paikka.tyyppi === 'lukittu';
                    const lukonSyy = paikka.onTuloksia ? tx.locked : tx.formulaName;
                    const eiTuomaroiva = eiTuomaroi(paikka);
                    const onLahde = raahaus?.lahde.rivi === paikka.rivi;
                    const onKohde = raahaus && kohdeRivi === paikka.rivi && !onLahde;
                    const onValittu = valittuRivi === paikka.rivi;
                    const kehys = onKohde
                      ? (lukossa ? 'border-rose-400 bg-rose-50' : 'border-[hsl(var(--primary))] bg-[hsl(var(--muted))] ring-2 ring-[hsl(var(--primary))]')
                      : onValittu ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]'
                        : eiTuomaroiva ? 'border-violet-300 bg-violet-50'
                          : onAmpuja ? 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'
                          : `border-dashed border-[hsl(var(--border))]${valittu ? ' bg-[hsl(var(--muted))]' : ''}`;
                    return (
                      <div
                        key={paikka.rivi}
                        data-ampuja-rivi={paikka.rivi}
                        className={`flex select-none items-stretch rounded-md border text-sm [-webkit-touch-callout:none] ${kehys}${onLahde ? ' opacity-40' : ''}`}
                      >
                        {siirrettava ? (
                          <button
                            type="button"
                            aria-label={tayta(tx.dragHandle, { nimi: paikka.nimi })}
                            className="flex w-10 shrink-0 cursor-grab touch-none items-center justify-center text-[hsl(var(--muted-foreground))] active:cursor-grabbing"
                            onPointerDown={(e) => aloitaRaahaus(e, paikka)}
                            onPointerMove={liikuta}
                            onPointerUp={(e) => pudota(e)}
                            onPointerCancel={(e) => pudota(e, true)}
                            onClick={(e) => e.preventDefault()}
                          >
                            <GripVertical className="h-5 w-5" aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="flex w-10 shrink-0 items-center justify-center text-[hsl(var(--muted-foreground))]" title={lukossa ? lukonSyy : undefined}>
                            {lukossa && <Lock className="h-4 w-4" aria-label={lukonSyy} />}
                          </span>
                        )}
                        <button
                          type="button"
                          className="flex min-h-11 flex-1 items-center gap-2 py-1.5 pr-3 text-left disabled:cursor-default"
                          onClick={() => napauta(paikka)}
                          disabled={!muokattava || tallennetaan || (!onAmpuja && !valittu)}
                          aria-pressed={onValittu}
                        >
                          <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-[hsl(var(--muted-foreground))]" translate="no">{paikka.nro}</span>
                          {onAmpuja ? (
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium" translate="no">{paikka.nimi}</span>
                              <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]" translate="no">
                                {eiTuomaroiva ? (
                                  <>
                                    <span className="rounded bg-violet-600 px-1 font-semibold text-white" title={tx.nonReferee}>{paikka.sarja}</span>
                                    {paikka.seura && ` · ${paikka.seura}`}
                                  </>
                                ) : [paikka.sarja, paikka.seura].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          ) : (
                            <span className="min-w-0 flex-1 italic text-[hsl(var(--muted-foreground))]">{tx.freeSlot}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
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
