// Mobiilikirjaus: Compak-radan laite kirjaa inline-linjan tulokset sarja kerrallaan (linja.js).
// Ratakoodi tulee QR-koodin linkistä (kirjaus.html#k=<koodi>) ja tallennetaan laitteelle.
// Merkinnät tallennetaan heti laitteelle ja lähetetään taulukkoon taustalla (api/kirjaus.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASEMAN_KOHTEET, KOHTEITA, kuittaa, lahettamattomat, lueKoodi as lueKoodinSisalto, merkitOf, merkitse,
  osumat, peru, taytetyt, yhdistaPalvelimelta
} from './kortit.js';
import {
  ASEMAVAIHTOEHDOT, ASEMIA, asemaTekstiksi, jasennaOhjelma, laskeVuorot, linjanTilanne, ohjelmaTekstiksi,
  radanLinjajono, tulevatAmpujat
} from './linja.js';
import { laitteenTunnus, lueKoodi, lueRata, tallennaKoodi, tallennaRata } from './varasto.js';
import { useHereilla } from './useHereilla.js';

const SYNKRONOINTI_VALI_MS = 15000;
// Valmis asema (5 kiekkoa) lähetetään heti; kesken olevat merkinnät kootaan, koska kirjuritilillä on
// Googlen kiintiö (60 kirjoitusta minuutissa kaikille radoille yhteensä).
const LAHETYS_VIIVE_MS = 1500;
const KESKEN_VIIVE_MS = 10000;

function alkuKoodi() {
  const k = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('k');
  if (k && lueKoodinSisalto(k)) {
    tallennaKoodi(k);
    // Koodi pois osoiteriviltä, ettei se näy kuvakaappauksissa tai jaetuissa linkeissä.
    window.history.replaceState(null, '', window.location.pathname);
    return k;
  }
  const tallessa = lueKoodi();
  return lueKoodinSisalto(tallessa) ? tallessa : '';
}

export default function KirjausApp() {
  const [koodi, setKoodi] = useState(alkuKoodi);

  const vaihdaKoodi = (uusi) => {
    tallennaKoodi(uusi || null);
    setKoodi(uusi || '');
  };

  if (!koodi) return <KoodiNakyma onKoodi={vaihdaKoodi} />;
  return <RataNakyma key={koodi} koodi={koodi} onVaihda={() => vaihdaKoodi('')} />;
}

function KoodiNakyma({ onKoodi }) {
  const [syote, setSyote] = useState('');
  const [virhe, setVirhe] = useState('');

  const kayta = () => {
    const teksti = syote.trim();
    const k = teksti.includes('#k=') ? new URLSearchParams(teksti.split('#')[1]).get('k') : teksti;
    if (!lueKoodinSisalto(k)) {
      setVirhe('Koodi ei kelpaa. Skannaa radan QR-koodi tai liitä koko linkki.');
      return;
    }
    onKoodi(k);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-white p-6 text-slate-900">
      <h1 className="text-2xl font-bold">Mobiilikirjaus</h1>
      <p>Skannaa radan QR-koodi puhelimen kameralla. Koodin saa kilpailutoimistosta.</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tai liitä ratakoodi tai linkki
        <textarea
          className="rounded border border-slate-400 p-2 font-mono text-xs"
          rows={4}
          value={syote}
          onChange={(e) => setSyote(e.target.value)}
        />
      </label>
      {virhe && <p className="text-sm text-red-700">{virhe}</p>}
      <button type="button" className="rounded bg-blue-800 px-4 py-3 text-lg font-semibold text-white" onClick={kayta}>
        Avaa rata
      </button>
    </main>
  );
}

function RataNakyma({ koodi, onVaihda }) {
  const info = useMemo(() => lueKoodinSisalto(koodi), [koodi]);
  const laite = useMemo(() => laitteenTunnus(), []);
  const hereilla = useHereilla();

  const [tila, setTila] = useState(() => alkutila(lueRata(info.sheetId, info.sarake)));
  const [lataus, setLataus] = useState({ tila: 'ladataan', viesti: '', pysyva: false });
  const [synk, setSynk] = useState({ virhe: '', viimeksi: null });
  const [valinta, setValinta] = useState(null);
  const [naytetty, setNaytetty] = useState(null);
  const [valikko, setValikko] = useState(false);
  const [muokkaaOhjelmaa, setMuokkaaOhjelmaa] = useState(false);
  const [latausKierros, setLatausKierros] = useState(0);

  const tilaRef = useRef(tila);
  const lahettaaRef = useRef(false);

  useEffect(() => {
    tilaRef.current = tila;
    tallennaRata(info.sheetId, info.sarake, tila);
  }, [tila, info]);

  // Radan tiedot ja taulukossa jo olevat kortit.
  useEffect(() => {
    let peruttu = false;
    fetch('/api/kirjaus?toiminto=avaa', { headers: { Authorization: `Bearer ${koodi}` }, cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (peruttu) return;
        if (!res.ok) {
          setLataus({ tila: 'virhe', viesti: data.error || `Virhe ${res.status}`, pysyva: res.status === 401 });
          return;
        }
        setTila((t) => ({ ...t, avaus: data, kortit: yhdistaPalvelimelta(t.kortit, data.kortit) }));
        setLataus({ tila: 'ok', viesti: '', pysyva: false });
      })
      .catch(() => {
        if (!peruttu) setLataus({ tila: 'virhe', viesti: 'Ei yhteyttä', pysyva: false });
      });
    return () => { peruttu = true; };
  }, [koodi, latausKierros]);

  const avaus = tila.avaus;
  const jono = useMemo(() => {
    const perus = radanLinjajono(avaus?.jono || [], { lisatyt: tila.lisatyt, ohitetut: tila.ohitetut });
    // Tauot: aikataulun TAUKO-rivit ja laitteella lisätyt, miinus laitteella perutut.
    return perus.map((a) => ({
      ...a,
      nimi: a.nimi || avaus?.nimet?.[a.nro] || '',
      taukoEnnen: tila.tauot.includes(a.nro) || (Boolean(a.taukoEnnen) && !tila.tauotPois.includes(a.nro))
    }));
  }, [avaus, tila.lisatyt, tila.ohitetut, tila.tauot, tila.tauotPois]);
  const nimi = useCallback((nro) => jono.find((a) => a.nro === nro)?.nimi || avaus?.nimet?.[nro] || '', [jono, avaus]);

  const laheta = useCallback(async () => {
    if (lahettaaRef.current) return;
    const { kortit, avaus: avattu, lisatyt } = tilaRef.current;
    const lahetetyt = lahettamattomat(kortit);
    if (lahetetyt.length === 0) return;
    const nimiNrolle = (nro) => avattu?.jono?.find((a) => a.nro === nro)?.nimi || avattu?.nimet?.[nro]
      || lisatyt.find((l) => l.nro === nro)?.nimi || '';
    lahettaaRef.current = true;
    try {
      const res = await fetch('/api/kirjaus?toiminto=tallenna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, kortit: lahetetyt.map((k) => ({ ...k, nimi: nimiNrolle(k.nro) })) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Virhe ${res.status}`);
      setTila((t) => ({ ...t, kortit: kuittaa(t.kortit, lahetetyt, data) }));
      setSynk({ virhe: '', viimeksi: Date.now() });
    } catch (error) {
      setSynk((s) => ({ ...s, virhe: error instanceof TypeError ? 'Ei yhteyttä' : error.message }));
    } finally {
      lahettaaRef.current = false;
    }
  }, [koodi, laite]);

  const odottavat = useMemo(() => lahettamattomat(tila.kortit, Infinity), [tila.kortit]);
  const lahettamatta = odottavat.length;
  const asemaValmis = odottavat.some((k) => taytetyt(k.merkit) % ASEMAN_KOHTEET === 0);

  // Lähetys pian muutoksen jälkeen, varmuuden vuoksi määrävälein ja kun yhteys palaa.
  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const ajastin = setTimeout(laheta, asemaValmis ? LAHETYS_VIIVE_MS : KESKEN_VIIVE_MS);
    return () => clearTimeout(ajastin);
  }, [tila.kortit, lahettamatta, asemaValmis, laheta]);

  useEffect(() => {
    const vali = setInterval(laheta, SYNKRONOINTI_VALI_MS);
    window.addEventListener('online', laheta);
    return () => {
      clearInterval(vali);
      window.removeEventListener('online', laheta);
    };
  }, [laheta]);

  // Selain kysyy ennen sulkemista, jos jotain on lähettämättä (mobiiliselaimet eivät aina kysy;
  // merkinnät ovat silti tallessa laitteella).
  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const kysy = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', kysy);
    return () => window.removeEventListener('beforeunload', kysy);
  }, [lahettamatta]);

  // Ohjelma: laitteella asetettu, muuten kisan asetuksista (KISANSPEKSIT RATAn_OHJELMA).
  const ohjelma = useMemo(() => jasennaOhjelma(tila.ohjelma) || jasennaOhjelma(avaus?.ohjelma), [tila.ohjelma, avaus]);
  const vuorot = useMemo(() => (ohjelma ? laskeVuorot(jono, ohjelma) : []), [jono, ohjelma]);
  const tilanne = useMemo(() => linjanTilanne(vuorot, tila.kortit), [vuorot, tila.kortit]);
  // Seuraavaksi: kierroksen uusi tulija asemalla 1, jos hän ei ole vielä ampunut (voi ohittaa tai pitää tauon), ja jono.
  const tulevat = useMemo(() => {
    if (!tilanne) return [];
    const tulija = tilanne.linja.find((l) => l.asema === 0);
    const alussa = tulija && taytetyt(merkitOf(tila.kortit, tulija.nro)) === 0 ? jono.filter((a) => a.nro === tulija.nro) : [];
    return [...alussa, ...tulevatAmpujat(jono, vuorot, tilanne.vuoro.kierros)];
  }, [jono, vuorot, tilanne, tila.kortit]);
  const kohta = valinta || tilanne?.kohta || null;
  const vuorossa = tilanne && !valinta ? tilanne.vuoro : null;

  const merkitseKohta = (merkki) => {
    if (!kohta) return;
    setTila((t) => ({ ...t, ...merkitse(t, kohta, merkki) }));
    setValinta(null);
    navigator.vibrate?.(merkki === 'O' ? [40, 60, 40] : 30);
  };

  const peruViimeisin = () => {
    const p = peru(tila);
    if (!p) return;
    setTila((t) => ({ ...t, kortit: p.kortit, historia: p.historia }));
    setValinta(null);
  };

  // Seuraavan linjaan tulijan tauko päälle tai pois.
  const vaihdaTauko = (nro) => {
    const paalla = jono.find((a) => a.nro === nro)?.taukoEnnen;
    setTila((t) => {
      const ilman = (lista) => lista.filter((n) => n !== nro);
      if (paalla) return t.tauot.includes(nro) ? { ...t, tauot: ilman(t.tauot) } : { ...t, tauotPois: [...t.tauotPois, nro] };
      return t.tauotPois.includes(nro) ? { ...t, tauotPois: ilman(t.tauotPois) } : { ...t, tauot: [...t.tauot, nro] };
    });
  };

  const ohita = (nro) => setTila((t) => ({ ...t, ohitetut: [...t.ohitetut.filter((n) => n !== nro), nro] }));

  // Numerolla: jonossa oleva näytetään (korjausta varten), muu lisätään linjaan seuraavaksi.
  const haeNumero = (nro) => {
    if (!Number.isInteger(nro) || nro < 1 || nro > 999) return;
    if (jono.some((a) => a.nro === nro)) {
      setNaytetty(nro);
    } else {
      // Linjan uusin (asemalla pienin) on viimeksi tullut; lisätty tulee hänen jälkeensä.
      const jalkeen = tilanne?.linja[0]?.nro;
      setTila((t) => ({
        ...t,
        ohitetut: t.ohitetut.filter((n) => n !== nro),
        lisatyt: [...t.lisatyt.filter((l) => l.nro !== nro), { nro, nimi: avaus?.nimet?.[nro] || '', jalkeen }]
      }));
    }
    setValikko(false);
  };

  const asetaOhjelma = (teksti) => {
    setTila((t) => ({ ...t, ohjelma: teksti }));
    setMuokkaaOhjelmaa(false);
    setValinta(null);
  };

  const vaihdaRata = () => {
    if (lahettamatta > 0 && !window.confirm(`${lahettamatta} korttia on lähettämättä. Ne jäävät laitteelle ja lähtevät, kun avaat radan uudelleen. Vaihdetaanko rata?`)) return;
    onVaihda();
  };

  if (!avaus) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-white p-6 text-slate-900">
        {lataus.tila === 'ladataan' && <p className="text-lg">Ladataan rataa…</p>}
        {lataus.tila === 'virhe' && (
          <>
            <p className="text-lg font-semibold text-red-700">{lataus.viesti}</p>
            {!lataus.pysyva && (
              <button type="button" className="rounded bg-blue-800 px-4 py-3 text-white" onClick={() => setLatausKierros((n) => n + 1)}>
                Yritä uudelleen
              </button>
            )}
            <button type="button" className="rounded border border-slate-400 px-4 py-3" onClick={onVaihda}>Vaihda ratakoodi</button>
          </>
        )}
      </main>
    );
  }

  const otsikko = (
    <header className="flex items-center gap-2 bg-[#1e3a5f] px-3 py-2 text-white">
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-bold">Rata {avaus.sarake}{avaus.rataNimi ? ` · ${avaus.rataNimi}` : ''}</div>
        <div className="truncate text-xs opacity-80">{avaus.kisa}</div>
      </div>
      <SynkMerkki lahettamatta={lahettamatta} virhe={synk.virhe} />
      <button type="button" aria-label="Valikko" className="rounded px-3 py-2 text-xl" onClick={() => setValikko((v) => !v)}>☰</button>
    </header>
  );

  const valikkoNakyma = valikko && (
    <Valikko
      ohjelma={ohjelma}
      onMuokkaaOhjelmaa={() => { setMuokkaaOhjelmaa(true); setValikko(false); }}
      onHaeNumero={haeNumero}
      onVaihdaRata={vaihdaRata}
      hereilla={hereilla}
      lataus={lataus}
      viimeksi={synk.viimeksi}
    />
  );

  if (!ohjelma || muokkaaOhjelmaa) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
        {otsikko}
        {valikkoNakyma}
        <OhjelmaEditori
          alku={ohjelma}
          kisanOhjelma={avaus.ohjelma}
          sarake={avaus.sarake}
          onTallenna={asetaOhjelma}
          onPeru={ohjelma ? () => setMuokkaaOhjelmaa(false) : null}
        />
      </main>
    );
  }

  const kortti = (nro, korostus) => (
    <AmpujaRivi
      key={nro}
      ampuja={{ nro, nimi: nimi(nro) }}
      merkit={merkitOf(tila.kortit, nro)}
      lahetetty={tila.kortit[nro]?.lahetetty !== false}
      kohta={kohta?.nro === nro ? kohta.i : null}
      korostus={korostus}
      onValitse={(i) => setValinta({ nro, i })}
    />
  );
  const linja = tilanne?.linja || [];
  const seuraava = tulevat[0];
  const sarja = vuorossa ? vuorossa.loppu - vuorossa.alku : 0;

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900 select-none">
      {otsikko}
      {valikkoNakyma}

      <section className="grid grid-cols-5 gap-1 px-2 pt-2">
        {Array.from({ length: ASEMIA }, (_, a) => {
          const ampuja = linja.find((l) => l.asema === a);
          const aktiivinen = vuorossa && ampuja?.nro === vuorossa.nro;
          const merkit = ampuja ? merkitOf(tila.kortit, ampuja.nro).slice(a * ASEMAN_KOHTEET, (a + 1) * ASEMAN_KOHTEET) : '';
          return (
            <div key={a} className={`rounded-lg border-2 p-1 text-center ${aktiivinen ? 'border-blue-700 bg-blue-50' : 'border-transparent bg-white'}`}>
              <div className="text-[10px] uppercase text-slate-500">Asema {a + 1}</div>
              <div className="text-xl font-bold leading-tight">{ampuja ? ampuja.nro : '–'}</div>
              <div className="truncate text-[11px]">{ampuja ? nimi(ampuja.nro).split(' ')[0] : ''}</div>
              <div className="text-[10px] tracking-tighter text-slate-500">{asemaTekstiksi(ohjelma[a])}</div>
              {ampuja && <div className="font-mono text-xs">{[...merkit].map((m) => (m === 'X' ? 'X' : m === 'O' ? '0' : '·')).join('')}</div>}
            </div>
          );
        })}
      </section>

      <section className="flex flex-1 flex-col gap-2 px-3 pt-2 pb-48">
        {naytetty !== null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm font-semibold">
              Korjaus
              <button type="button" className="rounded border border-slate-400 bg-white px-2 py-1" onClick={() => { setNaytetty(null); setValinta(null); }}>Sulje</button>
            </div>
            {kortti(naytetty, 'korjaus')}
          </div>
        )}
        {!tilanne && jono.length === 0 && <p className="rounded bg-white p-4">Radan aikataulusta ei löytynyt ampujia. Lisää ampuja numerolla valikosta.</p>}
        {!tilanne && jono.length > 0 && <p className="rounded bg-white p-4 font-semibold text-green-800">Kaikki jonon ampujat ovat ampuneet radan.</p>}
        {[...linja].reverse().filter((l) => l.nro !== naytetty).map((l) => kortti(l.nro))}

        {seuraava && (
          <div className="rounded-lg bg-white p-2 text-sm">
            <div className="mb-1 font-semibold">Seuraavaksi linjaan</div>
            {tulevat.slice(0, 3).map((a, k) => (
              <div key={a.nro} className="flex items-center gap-2 border-t border-slate-100 py-1">
                <span className="min-w-8 rounded bg-slate-200 px-1 text-center">{a.nro}</span>
                <span className="min-w-0 flex-1 truncate">{a.nimi || '(ei nimeä)'}{a.aika ? ` · ${a.aika}` : ''}</span>
                {k === 0 && (
                  <>
                    <button type="button" className={`rounded px-2 py-1 ${a.taukoEnnen ? 'bg-amber-600 text-white' : 'border border-slate-400'}`} onClick={() => vaihdaTauko(a.nro)}>
                      {a.taukoEnnen ? 'Tauko ✓' : 'Tauko'}
                    </button>
                    <button type="button" className="rounded border border-slate-400 px-2 py-1" onClick={() => ohita(a.nro)}>Ohita</button>
                  </>
                )}
              </div>
            ))}
            {seuraava.taukoEnnen && linja.length > 0 && (
              <p className="mt-1 text-amber-800">Tauko: linja tyhjennetään ennen ampujaa {seuraava.nro}.</p>
            )}
          </div>
        )}
      </section>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-white p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.1)]">
        <div className="mb-2 h-6 truncate text-center text-sm">
          {vuorossa && (
            <>
              Vuorossa <b>{vuorossa.nro} {nimi(vuorossa.nro)}</b> · asema {vuorossa.asema + 1} ·{' '}
              {sarja === 2 ? <b>tupla, kiekko {kohta.i - vuorossa.alku + 1}/2</b> : 'yksittäinen'}
            </>
          )}
          {valinta && <>Korjaus: <b>{valinta.nro} {nimi(valinta.nro)}</b> · asema {Math.floor(valinta.i / ASEMAN_KOHTEET) + 1}, kiekko {(valinta.i % ASEMAN_KOHTEET) + 1}</>}
        </div>
        <div className="grid grid-cols-[1fr_2fr_2fr] gap-2">
          <button type="button" className="h-20 rounded-lg border-2 border-slate-400 text-lg font-semibold active:bg-slate-200 disabled:opacity-30" disabled={tila.historia.length === 0} onClick={peruViimeisin}>
            PERU
          </button>
          <button type="button" className="h-20 rounded-lg bg-red-700 text-2xl font-bold text-white active:bg-red-900 disabled:opacity-30" disabled={!kohta} onClick={() => merkitseKohta('O')}>
            NOLLA
          </button>
          <button type="button" className="h-20 rounded-lg bg-green-700 text-2xl font-bold text-white active:bg-green-900 disabled:opacity-30" disabled={!kohta} onClick={() => merkitseKohta('X')}>
            OSUMA
          </button>
        </div>
      </footer>
    </main>
  );
}

// Laitteelle tallennettu tila; vanhan version lisätyt (pelkät numerot) menevät jonon loppuun.
function alkutila(tallessa) {
  const t = { kortit: {}, historia: [], lisatyt: [], ohitetut: [], tauot: [], tauotPois: [], ohjelma: null, avaus: null, ...tallessa };
  return { ...t, lisatyt: t.lisatyt.map((l) => (typeof l === 'number' ? { nro: l } : l)) };
}

function SynkMerkki({ lahettamatta, virhe }) {
  if (lahettamatta === 0) return <span className="rounded bg-green-700 px-2 py-1 text-xs font-semibold">✓ Tallennettu</span>;
  return (
    <span className={`rounded px-2 py-1 text-xs font-semibold ${virhe ? 'bg-red-700' : 'bg-amber-600'}`} title={virhe}>
      {lahettamatta} lähettämättä{virhe ? ` · ${virhe}` : ''}
    </span>
  );
}

function AmpujaRivi({ ampuja, merkit, lahetetty, kohta, korostus, onValitse }) {
  const aktiivinen = kohta !== null;
  const asemat = Array.from({ length: KOHTEITA / ASEMAN_KOHTEET }, (_, a) => a);
  const reuna = korostus === 'korjaus' ? 'border-amber-600' : aktiivinen ? 'border-blue-700' : 'border-transparent';
  return (
    <div className={`rounded-lg border-2 bg-white p-2 ${reuna}`}>
      <div className="flex w-full items-baseline justify-between gap-2 text-left">
        <span className="truncate font-semibold">
          <span className="mr-2 inline-block min-w-8 rounded bg-slate-200 px-1 text-center">{ampuja.nro}</span>
          {ampuja.nimi || '(ei nimeä)'}
        </span>
        <span className="shrink-0 text-xl font-bold">
          {osumat(merkit)}
          <span className="text-sm font-normal text-slate-500"> / {taytetyt(merkit)}{lahetetty ? '' : ' •'}</span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {asemat.map((a) => (
          <div key={a} className="grid grid-cols-5 gap-0.5">
            {Array.from({ length: ASEMAN_KOHTEET }, (_, k) => {
              const i = a * ASEMAN_KOHTEET + k;
              const m = merkit[i];
              const vari = m === 'X' ? 'bg-green-700 text-white' : m === 'O' ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-400';
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Asema ${a + 1}, kiekko ${k + 1}`}
                  className={`flex h-8 items-center justify-center rounded-sm text-xs font-bold ${vari} ${kohta === i ? 'ring-2 ring-blue-700 ring-offset-1' : ''}`}
                  onClick={() => onValitse(i)}
                >
                  {m === 'X' ? 'X' : m === 'O' ? '0' : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const ASEMAN_NIMET = { SSSSS: '5 yksittäistä', SSSD: '3 yksittäistä + tupla', SDD: 'yksittäinen + 2 tuplaa' };

function OhjelmaEditori({ alku, kisanOhjelma, sarake, onTallenna, onPeru }) {
  const [asemat, setAsemat] = useState(() => (alku || Array.from({ length: ASEMIA }, () => ASEMAVAIHTOEHDOT[1])).map(asemaTekstiksi));
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      <h2 className="text-lg font-bold">Radan ammuntaohjelma</h2>
      <p className="text-sm text-slate-700">
        {kisanOhjelma && !jasennaOhjelma(kisanOhjelma)
          ? `Kisan asetuksen RATA${sarake}_OHJELMA arvoa "${kisanOhjelma}" ei voitu lukea. Valitse ohjelma asemittain.`
          : alku
            ? 'Muutos koskee vain tätä laitetta.'
            : `Kisan asetuksissa (KISANSPEKSIT, RATA${sarake}_OHJELMA) ei ole ohjelmaa. Valitse jokaisen aseman sarjat menukortin mukaan.`}
      </p>
      {asemat.map((teksti, a) => (
        <label key={a} className="flex items-center justify-between gap-2">
          <span className="font-semibold">Asema {a + 1}</span>
          <select
            className="rounded border border-slate-400 bg-white p-2"
            value={teksti}
            onChange={(e) => setAsemat((v) => v.map((x, k) => (k === a ? e.target.value : x)))}
          >
            {ASEMAVAIHTOEHDOT.map(asemaTekstiksi).map((t) => <option key={t} value={t}>{t} · {ASEMAN_NIMET[t]}</option>)}
          </select>
        </label>
      ))}
      <button type="button" className="rounded bg-blue-800 px-4 py-3 text-lg font-semibold text-white" onClick={() => onTallenna(asemat.join(' | '))}>
        Käytä tätä ohjelmaa
      </button>
      {onPeru && <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={onPeru}>Peruuta</button>}
    </section>
  );
}

function Valikko({ ohjelma, onMuokkaaOhjelmaa, onHaeNumero, onVaihdaRata, hereilla, lataus, viimeksi }) {
  const [nro, setNro] = useState('');
  return (
    <div className="flex flex-col gap-3 border-b border-slate-300 bg-white p-3 text-sm">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onHaeNumero(Number.parseInt(nro, 10));
          setNro('');
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-slate-400 p-2"
          inputMode="numeric"
          placeholder="Ampujan numero"
          value={nro}
          onChange={(e) => setNro(e.target.value.replace(/\D/g, ''))}
        />
        <button type="submit" className="rounded bg-blue-800 px-3 py-2 text-white">Hae / lisää</button>
      </form>
      <p className="text-slate-600">Jonossa oleva ampuja avataan korjattavaksi; muu numero lisätään linjaan seuraavaksi.</p>
      <div className="flex items-center justify-between gap-2">
        <span>Ohjelma: <b>{ohjelma ? ohjelmaTekstiksi(ohjelma) : '–'}</b></span>
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={onMuokkaaOhjelmaa}>Muuta</button>
      </div>
      <p className="text-slate-600">
        {hereilla ? 'Näyttö pysyy päällä.' : 'Näytön päälläpito ei ole käytössä tällä selaimella.'}
        {lataus.tila === 'virhe' ? ` Radan tietoja ei saatu päivitettyä (${lataus.viesti}).` : ''}
        {viimeksi ? ` Viimeksi lähetetty klo ${new Date(viimeksi).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}.` : ''}
      </p>
      <button type="button" className="self-start rounded border border-slate-400 px-3 py-2" onClick={onVaihdaRata}>Vaihda ratakoodi</button>
    </div>
  );
}
