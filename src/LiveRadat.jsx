// Julkinen ratanäkymä: Compak-radan tilanne mobiilikirjauksen korteista kuten kirjauslaitteen näytöllä (seuraava, linjan
// kortit, ampuneet), ilman nappeja ja ilman asemarivin numeroita ja nimiä: tulosrivit riittävät. Lukee MOBIILI Rata N- ja MOBIILI_LAITTEET-
// välilehdet api/kisa.js:n kautta lukijatilillä, joten CDN:n välimuisti (käynnissä 15 s) pitää Google-haut vähäisinä
// katsojien määrästä riippumatta. Näkymä on noin 15–30 s laitetta jäljessä. Kirjauksen allekirjoitettu linkki ei
// ole koskaan tämä julkinen näkymä.
import { useEffect, useMemo, useState } from 'react';
import AmpujaRivi from './kirjaus/AmpujaRivi.jsx';
import { merkitOf } from './kirjaus/kortit.js';
import { parseCsvRows } from './utils/csv';
import { LAITTEET_VALILEHTI, lueRadanKortit, lueRadanLaitteet, mobiiliValilehti, radanLiveTila } from './utils/mobiiliLive';
import { haeTekstit } from './i18n';

const PAIVITYS_VALI_MS = 15 * 1000;
const VALMIITA_ALUKSI = 5;

function liveUrl(sheetId, sarake) {
  const params = new URLSearchParams();
  params.append('sheetId', sheetId);
  params.append('sheetNames', mobiiliValilehti(sarake));
  params.append('sheetNames', LAITTEET_VALILEHTI);
  return `/api/kisa?${params.toString()}`;
}

// Radan kortit ja linjan tila 15 s välein, kun sivu on näkyvissä. Palauttaa { data, virhe, haettu }.
function useRadanData(sheetId, sarake) {
  const [tila, setTila] = useState({ avain: null, data: null, virhe: false, haettu: null });
  const avain = `${sheetId}|${sarake}`;

  useEffect(() => {
    if (!sheetId || !sarake) return undefined;
    let peruttu = false;
    let ajastin = null;
    // Yksi haku kerrallaan: näkyviin palaaminen kesken haun ei aloita toista päivityskierrosta.
    let kesken = false;
    const hae = async () => {
      clearTimeout(ajastin);
      if (kesken) return;
      kesken = true;
      try {
        const res = await fetch(liveUrl(sheetId, sarake));
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        // Puuttuvaksi kerrottu välilehti pidetään entisellään (palvelimen vanha välilehtilista, ks. sheetsData.js).
        if (!peruttu) {
          setTila((t) => ({
            avain,
            data: { ...(t.avain === avain ? t.data : {}), ...(json.csvByName || {}) },
            virhe: false,
            haettu: new Date()
          }));
        }
      } catch (error) {
        console.error('[LIVE] Radan haku epäonnistui:', error?.message);
        // Toisen radan vanhaa dataa ja hakuaikaa ei näytetä tämän radan tietoina.
        if (!peruttu) setTila((t) => (t.avain === avain ? { ...t, virhe: true } : { avain, data: null, virhe: true, haettu: null }));
      }
      kesken = false;
      clearTimeout(ajastin);
      if (!peruttu && document.visibilityState === 'visible') ajastin = setTimeout(hae, PAIVITYS_VALI_MS);
    };
    const nakyvyys = () => {
      if (document.visibilityState === 'visible') hae();
      else clearTimeout(ajastin);
    };
    hae();
    document.addEventListener('visibilitychange', nakyvyys);
    return () => {
      peruttu = true;
      clearTimeout(ajastin);
      document.removeEventListener('visibilitychange', nakyvyys);
    };
  }, [sheetId, sarake, avain]);

  return tila.avain === avain ? tila : { data: null, virhe: false, haettu: null };
}

const kello = (aika) => aika.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// aikataulut: [{ nimi, raw }] järjestyksessä Aikataulu, Aikataulu La, Aikataulu Su (olemassa olevat välilehdet).
// naytaJono: aikataulu on julkinen (AIKATAULU_NAKYVYYS); muuten seuraavia ampujia ja aikoja ei näytetä.
export default function LiveRadat({ sheetId, speksitRivit, aikataulut, laitteetCsv, naytaJono, locale }) {
  const tx = haeTekstit('liveRadat', locale);
  const aikatauluRivit = useMemo(
    () => aikataulut.map(({ nimi, raw }) => ({ nimi, rivit: parseCsvRows(raw || '') })),
    [aikataulut]
  );
  const radat = useMemo(() => lueRadanLaitteet(laitteetCsv).map((r) => r.sarake), [laitteetCsv]);
  const [valittu, setValittu] = useState(null);
  const sarake = radat.includes(valittu) ? valittu : radat[0] ?? null;
  const [kaikkiValmiit, setKaikkiValmiit] = useState(false);

  const { data, virhe, haettu } = useRadanData(sheetId, sarake);
  const kortitCsv = data?.[mobiiliValilehti(sarake)] || '';
  const laitteetLive = data?.[LAITTEET_VALILEHTI] ?? laitteetCsv;
  const radanKortit = useMemo(() => lueRadanKortit(kortitCsv), [kortitCsv]);
  const linja = useMemo(
    () => lueRadanLaitteet(laitteetLive).find((r) => r.sarake === sarake)?.linja || null,
    [laitteetLive, sarake]
  );
  const tila = useMemo(() => (sarake ? radanLiveTila({
    speksitRivit, aikataulut: aikatauluRivit, sarake, kortit: radanKortit.kortit, korttiNimet: radanKortit.nimet, linja
  }) : null), [speksitRivit, aikatauluRivit, sarake, radanKortit, linja]);
  const rataNimi = (n) => {
    const nimi = n === sarake ? tila?.rataNimi : '';
    return `${tx.lane} ${n}${nimi ? ` · ${nimi}` : ''}`;
  };

  const valitsin = radat.length > 1 && (
    <div className="flex w-full gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {radat.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => { setValittu(n); setKaikkiValmiit(false); }}
          className={`shrink-0 rounded-md border px-3 py-1 text-sm ${n === sarake ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white' : 'border-slate-300 bg-white'}`}
        >
          {tx.lane} {n}
        </button>
      ))}
    </div>
  );

  if (!sarake || !tila) return null;
  const nimi = (nro) => tila.nimet[nro] || '';
  const kohta = tila.tilanne?.kohta || null;
  const seuraava = tila.tulevat[0];
  const naytettavatValmiit = kaikkiValmiit ? tila.valmiit : tila.valmiit.slice(0, VALMIITA_ALUKSI);
  const ladattu = Boolean(data);
  const eiKortteja = ladattu && Object.keys(radanKortit.kortit).length === 0;
  const kortti = (nro, valmis = false) => (
    <AmpujaRivi
      key={nro}
      ampuja={{ nro, nimi: nimi(nro) }}
      merkit={merkitOf(radanKortit.kortit, nro)}
      lahetetty
      kohta={kohta?.nro === nro ? kohta.i : null}
      valmis={valmis}
      keskeyttanyt={tila.keskeyttaneet.includes(nro)}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 text-slate-900">
      {valitsin}
      <section className="overflow-hidden rounded-lg bg-slate-100">
        <header className="flex items-baseline gap-2 bg-[#1e3a5f] px-3 py-2 text-white">
          <h2 className="min-w-0 flex-1 truncate font-bold sm:text-lg">{rataNimi(sarake)}</h2>
          {tila.ohjelma && <span className="shrink-0 text-xs opacity-80">{tx.program} {tila.ohjelma}</span>}
        </header>

        {!ladattu && !virhe && <p className="p-4">{tx.loading}</p>}
        {virhe && <p className="bg-rose-50 px-3 py-2 text-sm text-rose-700">{tx.error}</p>}

        {ladattu && (
          <>
            {naytaJono && seuraava && (
              <div className="mx-2 mt-2 rounded-lg bg-white px-2 py-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{tx.next}</span>
                  <span className="min-w-8 rounded bg-slate-200 px-1 text-center">{seuraava.nro}</span>
                  <span className="min-w-0 flex-1 truncate">{seuraava.nimi || nimi(seuraava.nro)}{seuraava.aika ? ` · ${seuraava.aika}` : ''}</span>
                </div>
                {tila.tulevat.length > 1 && (
                  <div className="truncate text-xs text-slate-500">
                    {tx.then} {tila.tulevat.slice(1, 4).map((a) => `${a.nro} ${(a.nimi || '').split(' ')[0]}`.trim()).join(', ')}{tila.tulevat.length > 4 ? ' …' : ''}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1 px-2 py-2 sm:gap-2">
              {eiKortteja && <p className="rounded bg-white p-3 text-sm">{tx.noScores}</p>}
              {tila.kesken && !eiKortteja && <p className="rounded bg-white p-3 text-sm">{tx.noProgram}</p>}
              {!tila.kesken && !tila.tilanne && tila.jono.length === 0 && !eiKortteja && <p className="rounded bg-white p-3 text-sm">{tx.noQueue}</p>}
              {!tila.kesken && !tila.tilanne && tila.jono.length > 0 && <p className="rounded bg-white p-3 font-semibold text-green-800">{tx.allDone}</p>}
              {tila.linja.map((l) => kortti(l.nro))}
              {(tila.kesken || []).map((nro) => kortti(nro))}

              {tila.valmiit.length > 0 && (
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                    {tx.finished} ({tila.valmiit.length})
                    {tila.valmiit.length > VALMIITA_ALUKSI && (
                      <button type="button" className="rounded border border-slate-400 bg-white px-3 py-1 font-normal" onClick={() => setKaikkiValmiit((v) => !v)}>
                        {kaikkiValmiit ? tx.showLatest : `${tx.showAll} (${tila.valmiit.length})`}
                      </button>
                    )}
                  </div>
                  {naytettavatValmiit.map((nro) => kortti(nro, true))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
      <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
        {[
          tx.delay,
          haettu ? `${tx.fetched} ${kello(haettu)}` : '',
          radanKortit.viimeisin ? `${tx.lastScore} ${radanKortit.viimeisin.kello}` : ''
        ].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}
