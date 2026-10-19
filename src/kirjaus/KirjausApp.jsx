// Mobiilikirjaus: Compak-radan laite kirjaa ryhmän tulokset kiekko kerrallaan.
// Ratakoodi tulee QR-koodin linkistä (kirjaus.html#k=<koodi>) ja tallennetaan laitteelle.
// Merkinnät tallennetaan heti laitteelle ja lähetetään taulukkoon taustalla (api/kirjaus.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASEMAN_KOHTEET, KOHTEITA, jaaRyhmiin, kuittaa, lahettamattomat, lueKoodi as lueKoodinSisalto, merkitOf, merkitse,
  osumat, peru, seuraavaKohta, taytetyt, yhdistaPalvelimelta
} from './kortit.js';
import { laitteenTunnus, lueKoodi, lueRata, tallennaKoodi, tallennaRata } from './varasto.js';
import { useHereilla } from './useHereilla.js';

const RYHMAKOOT = [1, 2, 3, 4, 5, 6];
const SYNKRONOINTI_VALI_MS = 15000;
const LAHETYS_VIIVE_MS = 1500;

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

  const [tila, setTila] = useState(() => ({
    kortit: {}, historia: [], ryhmaKoko: 5, ryhmaIndeksi: null, lisatyt: [], avaus: null,
    ...lueRata(info.sheetId, info.sarake)
  }));
  const [lataus, setLataus] = useState({ tila: 'ladataan', viesti: '', pysyva: false });
  const [synk, setSynk] = useState({ virhe: '', viimeksi: null });
  const [valinta, setValinta] = useState(null);
  const [valikko, setValikko] = useState(false);
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
          setLataus({ tila: 'virhe', viesti: data.error || `Virhe ${res.status}`, pysyva: res.status === 401 || res.status === 403 });
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

  const laheta = useCallback(async () => {
    if (lahettaaRef.current) return;
    const lahetetyt = lahettamattomat(tilaRef.current.kortit);
    if (lahetetyt.length === 0) return;
    lahettaaRef.current = true;
    try {
      const res = await fetch('/api/kirjaus?toiminto=tallenna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, kortit: lahetetyt })
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

  const lahettamatta = useMemo(() => lahettamattomat(tila.kortit, Infinity).length, [tila.kortit]);

  // Lähetys pian muutoksen jälkeen, varmuuden vuoksi määrävälein ja kun yhteys palaa.
  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const ajastin = setTimeout(laheta, LAHETYS_VIIVE_MS);
    return () => clearTimeout(ajastin);
  }, [tila.kortit, lahettamatta, laheta]);

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

  const avaus = tila.avaus;
  const jono = useMemo(() => {
    const omat = avaus?.jono || [];
    const mukana = new Set(omat.map((a) => a.nro));
    const lisatyt = tila.lisatyt.filter((nro) => !mukana.has(nro)).map((nro) => ({ nro, nimi: avaus?.nimet?.[nro] || '', aika: '' }));
    return [...omat, ...lisatyt];
  }, [avaus, tila.lisatyt]);
  const ryhmat = useMemo(() => jaaRyhmiin(jono, tila.ryhmaKoko), [jono, tila.ryhmaKoko]);
  const oletusIndeksi = Math.max(0, ryhmat.findIndex((r) => seuraavaKohta(r, tila.kortit)));
  const ryhmaIndeksi = Math.min(tila.ryhmaIndeksi ?? oletusIndeksi, Math.max(0, ryhmat.length - 1));
  const ryhma = ryhmat[ryhmaIndeksi] || [];
  const kohta = valinta && ryhma.some((a) => a.nro === valinta.nro) ? valinta : seuraavaKohta(ryhma, tila.kortit);
  const vuorossa = kohta ? ryhma.find((a) => a.nro === kohta.nro) : null;

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
    setValinta(p.kohta);
  };

  const siirryRyhmaan = (indeksi) => {
    setValinta(null);
    setTila((t) => ({ ...t, ryhmaIndeksi: Math.max(0, Math.min(indeksi, ryhmat.length - 1)) }));
  };

  const vaihdaRyhmaKoko = (koko) => {
    const eka = ryhma[0]?.nro;
    const uusiIndeksi = Math.max(0, Math.floor(jono.findIndex((a) => a.nro === eka) / koko));
    setValinta(null);
    setTila((t) => ({ ...t, ryhmaKoko: koko, ryhmaIndeksi: uusiIndeksi }));
  };

  const haeNumero = (nro) => {
    if (!Number.isInteger(nro) || nro < 1 || nro > 999) return;
    const paikka = jono.findIndex((a) => a.nro === nro);
    if (paikka !== -1) {
      siirryRyhmaan(Math.floor(paikka / tila.ryhmaKoko));
    } else {
      setTila((t) => ({ ...t, lisatyt: [...t.lisatyt, nro], ryhmaIndeksi: Math.floor(jono.length / t.ryhmaKoko) }));
      setValinta(null);
    }
    setValikko(false);
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

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900 select-none">
      <header className="flex items-center gap-2 bg-[#1e3a5f] px-3 py-2 text-white">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">Rata {avaus.sarake}{avaus.rataNimi ? ` · ${avaus.rataNimi}` : ''}</div>
          <div className="truncate text-xs opacity-80">{avaus.kisa}</div>
        </div>
        <SynkMerkki lahettamatta={lahettamatta} virhe={synk.virhe} />
        <button type="button" aria-label="Valikko" className="rounded px-3 py-2 text-xl" onClick={() => setValikko((v) => !v)}>☰</button>
      </header>

      {valikko && (
        <Valikko
          ryhmaKoko={tila.ryhmaKoko}
          onRyhmaKoko={vaihdaRyhmaKoko}
          onHaeNumero={haeNumero}
          onVaihdaRata={vaihdaRata}
          hereilla={hereilla}
          lataus={lataus}
          viimeksi={synk.viimeksi}
        />
      )}

      <nav className="flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="rounded bg-white px-4 py-2 text-xl shadow disabled:opacity-30" disabled={ryhmaIndeksi === 0} onClick={() => siirryRyhmaan(ryhmaIndeksi - 1)}>◀</button>
        <div className="text-center">
          <div className="font-semibold">Ryhmä {ryhmat.length ? ryhmaIndeksi + 1 : 0} / {ryhmat.length}</div>
          {ryhma[0]?.aika && <div className="text-xs text-slate-600">klo {ryhma[0].aika}</div>}
        </div>
        <button type="button" className="rounded bg-white px-4 py-2 text-xl shadow disabled:opacity-30" disabled={ryhmaIndeksi >= ryhmat.length - 1} onClick={() => siirryRyhmaan(ryhmaIndeksi + 1)}>▶</button>
      </nav>

      <section className="flex flex-1 flex-col gap-2 px-3 pb-44">
        {ryhma.length === 0 && <p className="rounded bg-white p-4">Radan aikataulusta ei löytynyt ampujia. Lisää ampuja numerolla valikosta.</p>}
        {ryhma.map((ampuja) => (
          <AmpujaRivi
            key={ampuja.nro}
            ampuja={ampuja}
            merkit={merkitOf(tila.kortit, ampuja.nro)}
            lahetetty={tila.kortit[ampuja.nro]?.lahetetty !== false}
            kohta={kohta?.nro === ampuja.nro ? kohta.i : null}
            onValitse={(i) => setValinta({ nro: ampuja.nro, i })}
          />
        ))}
      </section>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-white p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.1)]">
        <div className="mb-2 h-6 truncate text-center text-sm">
          {vuorossa
            ? <>Vuorossa <b>{vuorossa.nro} {vuorossa.nimi}</b> · asema {Math.floor(kohta.i / ASEMAN_KOHTEET) + 1}, kiekko {(kohta.i % ASEMAN_KOHTEET) + 1}</>
            : ryhma.length > 0 && (
              <span className="font-semibold text-green-800">
                Ryhmä valmis.{' '}
                {ryhmaIndeksi < ryhmat.length - 1 && (
                  <button type="button" className="underline" onClick={() => siirryRyhmaan(ryhmaIndeksi + 1)}>Seuraava ryhmä →</button>
                )}
              </span>
            )}
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

function SynkMerkki({ lahettamatta, virhe }) {
  if (lahettamatta === 0) return <span className="rounded bg-green-700 px-2 py-1 text-xs font-semibold">✓ Tallennettu</span>;
  return (
    <span className={`rounded px-2 py-1 text-xs font-semibold ${virhe ? 'bg-red-700' : 'bg-amber-600'}`} title={virhe}>
      {lahettamatta} lähettämättä{virhe ? ` · ${virhe}` : ''}
    </span>
  );
}

function AmpujaRivi({ ampuja, merkit, lahetetty, kohta, onValitse }) {
  const aktiivinen = kohta !== null;
  const asemat = Array.from({ length: KOHTEITA / ASEMAN_KOHTEET }, (_, a) => a);
  return (
    <div className={`rounded-lg border-2 bg-white p-2 ${aktiivinen ? 'border-blue-700' : 'border-transparent'}`}>
      <button type="button" className="flex w-full items-baseline justify-between gap-2 text-left" onClick={() => onValitse(merkit.indexOf('-'))}>
        <span className="truncate font-semibold">
          <span className="mr-2 inline-block min-w-8 rounded bg-slate-200 px-1 text-center">{ampuja.nro}</span>
          {ampuja.nimi || '(ei nimeä)'}
        </span>
        <span className="shrink-0 text-xl font-bold">
          {osumat(merkit)}
          <span className="text-sm font-normal text-slate-500"> / {taytetyt(merkit)}{lahetetty ? '' : ' •'}</span>
        </span>
      </button>
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

function Valikko({ ryhmaKoko, onRyhmaKoko, onHaeNumero, onVaihdaRata, hereilla, lataus, viimeksi }) {
  const [nro, setNro] = useState('');
  return (
    <div className="flex flex-col gap-3 border-b border-slate-300 bg-white p-3 text-sm">
      <label className="flex items-center justify-between gap-2">
        Ampujia ryhmässä
        <select className="rounded border border-slate-400 p-2" value={ryhmaKoko} onChange={(e) => onRyhmaKoko(Number(e.target.value))}>
          {RYHMAKOOT.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
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
      <p className="text-slate-600">
        {hereilla ? 'Näyttö pysyy päällä.' : 'Näytön päälläpito ei ole käytössä tällä selaimella.'}
        {lataus.tila === 'virhe' ? ` Radan tietoja ei saatu päivitettyä (${lataus.viesti}).` : ''}
        {viimeksi ? ` Viimeksi lähetetty klo ${new Date(viimeksi).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}.` : ''}
      </p>
      <button type="button" className="self-start rounded border border-slate-400 px-3 py-2" onClick={onVaihdaRata}>Vaihda ratakoodi</button>
    </div>
  );
}
