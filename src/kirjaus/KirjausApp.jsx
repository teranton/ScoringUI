// Mobiilikirjaus: Compak-radan laite kirjaa inline-linjan tulokset sarja kerrallaan (linja.js).
// Ratakoodi tulee QR-koodin linkistä (kirjaus.html#k=<koodi>) ja tallennetaan laitteelle.
// Merkinnät tallennetaan heti laitteelle ja lähetetään taulukkoon taustalla (api/kirjaus.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASEMAN_KOHTEET, KOHTEITA, kuittaa, lahettamattomat, lueKoodi as lueKoodinSisalto, merkitOf, merkitse,
  osumat, peru, taytetyt, yhdistaPalvelimelta
} from './kortit.js';
import {
  ASEMIA, OHJELMAT, jasennaOhjelma, laskeVuorot, linjanTilanne, ohjelmaTekstiksi, radanLinjajono, tulevatAmpujat
} from './linja.js';
import { laitteenTunnus, lueKoodi, lueRata, tallennaKoodi, tallennaRata } from './varasto.js';
import { useHereilla } from './useHereilla.js';
import { NOLLA_AANET, OLETUS_NOLLA_AANI, soita } from './aanet.js';

const SYNKRONOINTI_VALI_MS = 15000;
// Valmis asema (5 kiekkoa) lähetetään heti; kesken olevat merkinnät kootaan, koska kirjuritilillä on
// Googlen kiintiö (60 kirjoitusta minuutissa kaikille radoille yhteensä).
const LAHETYS_VIIVE_MS = 1500;
const KESKEN_VIIVE_MS = 10000;
const NAPAUTUSVALI_MS = 150;
const KUITTAUS_MS = 6000;
const VALAHDYS_MS = 2500;

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

// Testityökalut vain esikatselussa ja kehityksessä, ei tuotannossa (vite.config.js asettaa Vercelin ympäristöstä).
const TESTIVERSIO = __KIRJAUS_TESTIVERSIO__;

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
  // Korjauksen tai perumisen kuittaus hetken näytöllä: mitä muutettiin ja mistä jatketaan.
  const [kuittaus, setKuittaus] = useState(null);
  // Korjaustila valikosta: vasta silloin kortin kiekkoja ja keskeytystä voi napauttaa.
  const [korjaustila, setKorjaustila] = useState(false);
  const lopetaKorjaus = () => {
    setKorjaustila(false);
    setValinta(null);
    setNaytetty(null);
  };
  const viimeNapautusRef = useRef(0);
  // Juuri ammuttu sarja näkyy hetken isona asemaruudussa (yksi ruutu yksittäiselle, kaksi tuplalle).
  const [valahdys, setValahdys] = useState(null);
  useEffect(() => {
    if (!valahdys) return undefined;
    const ajastin = setTimeout(() => setValahdys(null), VALAHDYS_MS);
    return () => clearTimeout(ajastin);
  }, [valahdys]);
  const [valikko, setValikko] = useState(false);
  const [muokkaaOhjelmaa, setMuokkaaOhjelmaa] = useState(false);
  const [latausKierros, setLatausKierros] = useState(0);
  const [kaikkiValmiit, setKaikkiValmiit] = useState(false);
  const [toinenLaite, setToinenLaite] = useState(null);

  const tilaRef = useRef(tila);
  const lahettaaRef = useRef(false);
  // Testiversion "Tyhjennä rata laitteelta": ei enää tallenneta eikä lähetetä ennen sivun uudelleenlatausta.
  const tyhjennettyRef = useRef(false);

  useEffect(() => {
    tilaRef.current = tila;
    if (tyhjennettyRef.current) return;
    tallennaRata(info.sheetId, info.sarake, tila);
  }, [tila, info]);

  // Radan tiedot ja taulukossa jo olevat kortit.
  useEffect(() => {
    let peruttu = false;
    fetch('/api/kirjaus?toiminto=avaa', { headers: { Authorization: `Bearer ${koodi}`, 'X-Kirjaus-Laite': laite }, cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (peruttu) return;
        if (!res.ok) {
          setLataus({ tila: 'virhe', viesti: data.error || `Virhe ${res.status}`, pysyva: res.status === 401 });
          return;
        }
        setTila((t) => ({ ...t, avaus: data, kortit: yhdistaPalvelimelta(t.kortit, data.kortit, { kaikki: true }) }));
        setLataus({ tila: 'ok', viesti: '', pysyva: false });
      })
      .catch(() => {
        if (!peruttu) setLataus({ tila: 'virhe', viesti: 'Ei yhteyttä', pysyva: false });
      });
    return () => { peruttu = true; };
  }, [koodi, laite, latausKierros]);

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
  const nimiRef = useRef(nimi);
  useEffect(() => { nimiRef.current = nimi; }, [nimi]);

  const laheta = useCallback(async () => {
    if (lahettaaRef.current || tyhjennettyRef.current) return;
    // Toisen laitteen varoitus kuittaamatta: ei kirjoiteta toisen laitteen tulosten päälle.
    const { avaus: avattu, hyvaksyttyMuu } = tilaRef.current;
    if (avattu?.muuLaite && hyvaksyttyMuu !== muuLaiteAvain(avattu.muuLaite)) return;
    const lahetetyt = lahettamattomat(tilaRef.current.kortit);
    if (lahetetyt.length === 0) return;
    lahettaaRef.current = true;
    try {
      const res = await fetch('/api/kirjaus?toiminto=tallenna', {
        method: 'POST',
        // keepalive: lähetys ehtii perille, vaikka sivu suljettaisiin tai laite lukittaisiin heti merkinnän jälkeen.
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, kortit: lahetetyt.map((k) => ({ ...k, nimi: nimiRef.current(k.nro) })) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Virhe ${res.status}`);
      setTila((t) => ({ ...t, kortit: kuittaa(t.kortit, lahetetyt, data) }));
      setSynk({ virhe: '', viimeksi: Date.now() });
      // Taulukossa oli toisen laitteen uudempi kortti: kaksi laitetta kirjaa samaa rataa.
      const muu = (data.uudemmat || []).find((k) => k.laite && k.laite !== laite);
      if (muu) setToinenLaite({ aika: muu.aika, nro: muu.nro });
    } catch (error) {
      setSynk((s) => ({ ...s, virhe: error instanceof TypeError ? 'Ei yhteyttä' : error.message }));
    } finally {
      lahettaaRef.current = false;
    }
  }, [koodi, laite]);

  const odottavat = useMemo(() => lahettamattomat(tila.kortit, Infinity), [tila.kortit]);
  const lahettamatta = odottavat.length;
  const asemaValmis = odottavat.some((k) => taytetyt(k.merkit) % ASEMAN_KOHTEET === 0);

  // Lähetys pian muutoksen jälkeen, varmuuden vuoksi määrävälein, kun yhteys palaa ja kun sivu jää taustalle
  // (laitteen vaihto: viimeisetkin merkinnät taulukkoon ennen kuin toinen laite avaa radan).
  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const ajastin = setTimeout(laheta, asemaValmis ? LAHETYS_VIIVE_MS : KESKEN_VIIVE_MS);
    return () => clearTimeout(ajastin);
  }, [tila.kortit, lahettamatta, asemaValmis, laheta]);

  useEffect(() => {
    const vali = setInterval(laheta, SYNKRONOINTI_VALI_MS);
    const piilossa = () => {
      if (document.visibilityState === 'hidden') laheta();
    };
    window.addEventListener('online', laheta);
    document.addEventListener('visibilitychange', piilossa);
    return () => {
      clearInterval(vali);
      window.removeEventListener('online', laheta);
      document.removeEventListener('visibilitychange', piilossa);
    };
  }, [laheta]);

  // Selain kysyy ennen sulkemista, jos jotain on lähettämättä (mobiiliselaimet eivät aina kysy;
  // merkinnät ovat silti tallessa laitteella).
  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const kysy = (e) => {
      if (tyhjennettyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', kysy);
    return () => window.removeEventListener('beforeunload', kysy);
  }, [lahettamatta]);

  // Ohjelma: laitteella asetettu, muuten kisan asetuksista (KISANSPEKSIT RATAn_OHJELMA).
  // jasennaOhjelma palauttaa OHJELMAT-taulukon jäsenen, joten viite pysyy samana renderöinnistä toiseen.
  const kisanOhjelma = jasennaOhjelma(avaus?.ohjelma);
  const ohjelma = jasennaOhjelma(tila.ohjelma) || kisanOhjelma;
  const ohjelmaTeksti = ohjelma ? ohjelmaTekstiksi(ohjelma) : '';
  const vuorot = useMemo(() => (ohjelma ? laskeVuorot(jono, ohjelma) : []), [jono, ohjelma]);
  const tilanne = useMemo(() => linjanTilanne(vuorot, tila.kortit, tila.keskeyttaneet), [vuorot, tila.kortit, tila.keskeyttaneet]);
  // Seuraavaksi: kierroksen uusi tulija asemalla 1, jos hän ei ole vielä ampunut (voi ohittaa tai pitää tauon), ja jono.
  const tulevat = useMemo(() => {
    if (!tilanne) return [];
    const tulija = tilanne.linja.find((l) => l.asema === 0);
    const odottaa = tulija && taytetyt(merkitOf(tila.kortit, tulija.nro)) === 0 && !tila.keskeyttaneet.includes(tulija.nro);
    const alussa = odottaa ? jono.filter((a) => a.nro === tulija.nro) : [];
    return [...alussa, ...tulevatAmpujat(jono, vuorot, tilanne.vuoro.kierros)];
  }, [jono, vuorot, tilanne, tila.kortit, tila.keskeyttaneet]);
  // Radan ampuneet (tai keskeyttäneet), uusin ensin: ampuja voi tarkistaa tuloksensa näytöltä.
  const valmiit = useMemo(() => {
    const linjalla = new Set((tilanne?.linja || []).map((l) => l.nro));
    // Järjestys linjaan tulon mukaan (ensimmäinen vuoro), viimeksi tullut ensin.
    const tulo = new Map();
    vuorot.forEach((v, i) => {
      if (!tulo.has(v.nro)) tulo.set(v.nro, i);
    });
    return [...tulo.entries()]
      .filter(([nro]) => !linjalla.has(nro)
        && (taytetyt(merkitOf(tila.kortit, nro)) === KOHTEITA || tila.keskeyttaneet.includes(nro)))
      .sort((a, b) => b[1] - a[1])
      .map(([nro]) => nro);
  }, [vuorot, tilanne, tila.kortit, tila.keskeyttaneet]);
  const kohta = valinta || tilanne?.kohta || null;
  const vuorossa = tilanne && !valinta ? tilanne.vuoro : null;

  // Vuorossa olevan kortti pidetään näkyvissä joka merkinnän jälkeen, kun lista on pidempi kuin näyttö.
  // Ei vieritetä korjauksen aikana eikä heti korjausmerkinnän jälkeen, ettei korjattava kortti katoa.
  const [lista, setLista] = useState(null);
  const korjattiinRef = useRef(false);
  const vuorossaNro = vuorossa?.nro ?? null;
  const vuorossaKohde = vuorossa ? kohta.i : null;
  useEffect(() => {
    if (korjattiinRef.current) {
      korjattiinRef.current = false;
      return;
    }
    if (!lista || vuorossaNro === null || naytetty !== null) return;
    const kortti = lista.querySelector(`[data-nro="${vuorossaNro}"]`);
    if (!kortti) return;
    const k = kortti.getBoundingClientRect();
    const l = lista.getBoundingClientRect();
    if (k.bottom > l.bottom) lista.scrollTop += k.bottom - l.bottom + 8;
    else if (k.top < l.top) lista.scrollTop -= l.top - k.top + 8;
  }, [lista, vuorossaNro, vuorossaKohde, naytetty]);

  // Vahingossa tullut tuplanapautus ei merkitse kahta kiekkoa.
  const liianPian = () => {
    const nyt = Date.now();
    if (nyt - viimeNapautusRef.current < NAPAUTUSVALI_MS) return true;
    viimeNapautusRef.current = nyt;
    return false;
  };
  const kohdeTeksti = ({ nro, i }) => `${nro} ${nimi(nro)}, asema ${Math.floor(i / ASEMAN_KOHTEET) + 1}, kiekko ${(i % ASEMAN_KOHTEET) + 1}`;

  const merkitseKohta = (merkki) => {
    if (korjaustila || valinta || !tilanne || liianPian()) return;
    setTila((t) => ({ ...t, ...merkitse(t, tilanne.kohta, merkki) }));
    const { nro, asema, alku, loppu } = tilanne.vuoro;
    setValahdys({ nro, asema, alku, loppu, aika: Date.now() });
    setKuittaus(null);
    // Tuplan toinen nolla, kun ensimmäinenkin meni ohi, kuulostaa eri tavalla (nouseva).
    const molemmatOhi = merkki === 'O' && tilanne.kohta.i > alku && merkitOf(tila.kortit, nro)[alku] === 'O';
    if (tila.aanet !== false) soita(merkki === 'X' ? 'osuma' : molemmatOhi ? 'nolla2' : 'nolla', tila.nollaAani);
    navigator.vibrate?.(merkki === 'O' ? [40, 60, 40] : 30);
  };

  // Korjaus vaihtaa jo merkityn kiekon osumasta nollaksi tai päinvastoin; ampumattomaan ei voi merkitä.
  const korjaa = () => {
    if (!valinta || liianPian()) return;
    const uusi = merkitOf(tila.kortit, valinta.nro)[valinta.i] === 'X' ? 'O' : 'X';
    korjattiinRef.current = true;
    setTila((t) => ({ ...t, ...merkitse(t, valinta, uusi) }));
    setKuittaus(`Korjattu: ${kohdeTeksti(valinta)} → ${uusi === 'X' ? 'OSUMA' : 'NOLLA'}.`);
    if (tila.aanet !== false) soita('korjaus');
    setValinta(null);
    navigator.vibrate?.(30);
  };

  const peruViimeisin = () => {
    if (liianPian()) return;
    const p = peru(tila);
    if (!p) return;
    // Peru lasketaan uudelleen tuoreimmasta tilasta, ettei välissä tullut kuittaus tai avaus katoa.
    setTila((t) => {
      const tuore = peru(t);
      return tuore ? { ...t, kortit: tuore.kortit, historia: tuore.historia } : t;
    });
    setKuittaus(`Peruttu: ${kohdeTeksti(p.kohta)}.`);
    if (tila.aanet !== false) soita('peru');
    setValinta(null);
  };

  useEffect(() => {
    if (!kuittaus) return undefined;
    const ajastin = setTimeout(() => setKuittaus(null), KUITTAUS_MS);
    return () => clearTimeout(ajastin);
  }, [kuittaus]);

  // Seuraavan linjaan tulijan tauko päälle tai pois.
  const vaihdaTauko = (nro) => {
    const paalla = jono.find((a) => a.nro === nro)?.taukoEnnen;
    setTila((t) => {
      const ilman = (lista) => lista.filter((n) => n !== nro);
      if (paalla) return t.tauot.includes(nro) ? { ...t, tauot: ilman(t.tauot) } : { ...t, tauotPois: [...t.tauotPois, nro] };
      return t.tauotPois.includes(nro) ? { ...t, tauotPois: ilman(t.tauotPois) } : { ...t, tauot: [...t.tauot, nro] };
    });
  };

  const ohita = (nro) => {
    if (!window.confirm(`Ohitetaanko ${nro} ${nimi(nro)}? Hän ei tule nyt linjaan (lisää myöhemmin numerolla valikosta).`)) return;
    setTila((t) => ({ ...t, ohitetut: [...t.ohitetut.filter((n) => n !== nro), nro] }));
  };

  // Linjalla oleva lopettaa kesken: hänen loput vuoronsa ohitetaan, muiden paikat linjalla eivät muutu.
  const vaihdaKeskeytys = (nro) => {
    const keskeytetty = tila.keskeyttaneet.includes(nro);
    if (!keskeytetty && !window.confirm(`Keskeyttääkö ${nro} ${nimi(nro)}? Hänen loput vuoronsa ohitetaan.`)) return;
    setTila((t) => ({
      ...t,
      keskeyttaneet: keskeytetty ? t.keskeyttaneet.filter((n) => n !== nro) : [...t.keskeyttaneet, nro]
    }));
    setValinta(null);
  };

  // Numerolla: jonossa oleva näytetään (korjausta varten), muu lisätään linjaan seuraavaksi.
  const haeNumero = (nro) => {
    if (!Number.isInteger(nro) || nro < 1 || nro > 999) return;
    if (jono.some((a) => a.nro === nro)) {
      setNaytetty(nro);
      setKorjaustila(true);
    } else {
      // Lisätty tulee viimeksi linjaan tulleen perään, aikaisintaan seuraavalla kierroksella (ammuttu ei muutu).
      const tulleet = new Set(tilanne ? vuorot.filter((v) => v.kierros <= tilanne.vuoro.kierros).map((v) => v.nro) : []);
      const viimeisin = [...jono].reverse().find((a) => tulleet.has(a.nro));
      const lisatty = tilanne
        ? { nro, nimi: avaus?.nimet?.[nro] || '', jalkeen: viimeisin ? viimeisin.nro : null, kierroksesta: tilanne.vuoro.kierros + 1 }
        : { nro, nimi: avaus?.nimet?.[nro] || '' };
      setTila((t) => ({
        ...t,
        ohitetut: t.ohitetut.filter((n) => n !== nro),
        lisatyt: [...t.lisatyt.filter((l) => l.nro !== nro), lisatty]
      }));
    }
    setValikko(false);
  };

  // Kisan asetuksen mukainen ohjelma ei jää laitteelle, joten taulukon korjaus tulee voimaan.
  const asetaOhjelma = (teksti) => {
    const kisan = kisanOhjelma && ohjelmaTekstiksi(kisanOhjelma) === teksti;
    setTila((t) => ({ ...t, ohjelma: teksti && !kisan ? teksti : null }));
    setMuokkaaOhjelmaa(false);
    setValinta(null);
  };

  const tyhjennaRata = () => {
    const varoitus = lahettamatta > 0 ? ` ${lahettamatta} lähettämätöntä korttia häviää.` : '';
    if (!window.confirm(`Tyhjennetäänkö radan ${info.sarake} tiedot tältä laitteelta?${varoitus} Taulukkoon tallennetut tulokset eivät muutu.`)) return;
    tyhjennettyRef.current = true;
    tallennaRata(info.sheetId, info.sarake, null);
    window.location.reload();
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
    <header className="flex shrink-0 items-center gap-2 bg-[#1e3a5f] px-3 py-1 text-white sm:py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold sm:text-lg">
          Rata {avaus.sarake}{avaus.rataNimi ? ` · ${avaus.rataNimi}` : ''}
          {ohjelmaTeksti && <span className="font-normal opacity-80 sm:hidden"> · {ohjelmaTeksti}</span>}
        </div>
        <div className="hidden truncate text-xs opacity-80 sm:block">{avaus.kisa}{ohjelmaTeksti ? ` · ohjelma ${ohjelmaTeksti}` : ''}</div>
      </div>
      <SynkMerkki lahettamatta={lahettamatta} virhe={synk.virhe} />
      <button type="button" aria-label="Valikko" className="rounded px-3 py-1 text-xl sm:py-2" onClick={() => setValikko((v) => !v)}>☰</button>
    </header>
  );

  const valikkoNakyma = valikko && (
    <Valikko
      ohjelma={ohjelmaTeksti}
      onMuokkaaOhjelmaa={() => { setMuokkaaOhjelmaa(true); setValikko(false); }}
      onHaeNumero={haeNumero}
      onVaihdaRata={vaihdaRata}
      onKorjaa={() => { setKorjaustila(true); setValikko(false); }}
      aanet={tila.aanet !== false}
      nollaAani={tila.nollaAani || OLETUS_NOLLA_AANI}
      onNollaAani={(avain) => {
        soita('nolla', avain);
        setTimeout(() => soita('nolla2', avain), 600);
        setTila((t) => ({ ...t, nollaAani: avain }));
      }}
      onAanet={() => {
        const paalle = tila.aanet === false;
        if (paalle) soita('osuma');
        setTila((t) => ({ ...t, aanet: paalle }));
      }}
      onTyhjenna={TESTIVERSIO ? tyhjennaRata : null}
      hereilla={hereilla}
      lataus={lataus}
      viimeksi={synk.viimeksi}
    />
  );

  // Toinen laite on tallentanut radalle viimeksi: kysytään ennen kuin tämä laite otetaan käyttöön.
  const muuLaite = avaus.muuLaite;
  if (muuLaite && tila.hyvaksyttyMuu !== muuLaiteAvain(muuLaite)) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
        {otsikko}
        <section className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
          <h2 className="text-lg font-bold text-amber-800">Rata on käytössä toisella laitteella</h2>
          <p>
            Toinen laite on tallentanut tämän radan tuloksia{muuLaite.aika ? ` viimeksi ${muuLaite.aika}` : ''}.
            Kirjaa rataa vain yhdellä laitteella kerrallaan: lopeta kirjaus toisella laitteella ennen kuin jatkat tällä.
          </p>
          <p className="text-sm text-slate-600">Tämä laite jatkaa taulukkoon jo tallennetuista tuloksista.</p>
          <button type="button" className="rounded bg-blue-800 px-4 py-3 text-lg font-semibold text-white" onClick={() => setTila((t) => ({ ...t, hyvaksyttyMuu: muuLaiteAvain(muuLaite) }))}>
            Ota tämä laite käyttöön
          </button>
          <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={vaihdaRata}>Vaihda ratakoodi</button>
        </section>
      </main>
    );
  }

  if (!ohjelma || muokkaaOhjelmaa) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
        {otsikko}
        {valikkoNakyma}
        <OhjelmaEditori
          alku={ohjelmaTeksti}
          kisanArvo={avaus.ohjelma}
          kisanOhjelma={kisanOhjelma ? ohjelmaTekstiksi(kisanOhjelma) : ''}
          sarake={avaus.sarake}
          onTallenna={asetaOhjelma}
          onPeru={ohjelma ? () => setMuokkaaOhjelmaa(false) : null}
        />
      </main>
    );
  }

  const kortti = (nro, korostus, valmis = false) => (
    <AmpujaRivi
      key={nro}
      ampuja={{ nro, nimi: nimi(nro) }}
      merkit={merkitOf(tila.kortit, nro)}
      lahetetty={tila.kortit[nro]?.lahetetty !== false}
      kohta={kohta?.nro === nro ? kohta.i : null}
      korostus={korostus}
      valmis={valmis}
      keskeyttanyt={tila.keskeyttaneet.includes(nro)}
      onKeskeyta={korjaustila ? () => vaihdaKeskeytys(nro) : null}
      onValitse={korjaustila ? (i) => setValinta({ nro, i }) : null}
    />
  );
  const linja = tilanne?.linja || [];
  const naytettavatValmiit = kaikkiValmiit ? valmiit : valmiit.slice(0, 3);
  const viimeisinValmis = valmiit[0] ?? null;
  // Viimeisin merkintä PERU-napissa: näkee heti, mitä peruminen koskee.
  const viimeHistoria = tila.historia[tila.historia.length - 1];
  const edellinen = viimeHistoria ? { nro: viimeHistoria.nro, merkki: merkitOf(tila.kortit, viimeHistoria.nro)[viimeHistoria.i] } : null;
  const seuraava = tulevat[0];
  const sarja = vuorossa ? vuorossa.loppu - vuorossa.alku : 0;

  return (
    <main className="flex h-screen supports-[height:100dvh]:h-[100dvh] flex-col overflow-hidden bg-slate-100 text-slate-900 select-none">
      {otsikko}
      {toinenLaite && (
        <div className="flex shrink-0 items-center gap-2 bg-amber-100 px-3 py-2 text-sm text-amber-900">
          <span className="min-w-0 flex-1">
            Toinen laite kirjaa tälle radalle{toinenLaite.aika ? ` (${toinenLaite.aika})` : ''}: ampujan {toinenLaite.nro} kortti
            korvattiin toisen laitteen tuloksilla. Käytä yhtä laitetta per rata.
          </span>
          <button type="button" className="rounded border border-amber-700 px-2 py-1" onClick={() => setToinenLaite(null)}>OK</button>
        </div>
      )}
      <div className="max-h-[50dvh] shrink-0 overflow-y-auto">{valikkoNakyma}</div>

      {/* Asemat 1–5 ja viimeksi valmistunut, jotta ampuja näkee tuloksensa heti. */}
      <section className="grid shrink-0 grid-cols-6 gap-1 px-2 pt-2">
        {Array.from({ length: ASEMIA }, (_, a) => {
          const ampuja = linja.find((l) => l.asema === a);
          const aktiivinen = vuorossa && ampuja?.nro === vuorossa.nro;
          const merkit = ampuja ? merkitOf(tila.kortit, ampuja.nro).slice(a * ASEMAN_KOHTEET, (a + 1) * ASEMAN_KOHTEET) : '';
          return (
            <div key={a} className={`relative min-w-0 rounded-lg border-2 p-0.5 text-center sm:p-1 ${aktiivinen ? 'border-blue-700 bg-blue-50' : 'border-transparent bg-white'}`}>
              <div className="whitespace-nowrap text-[10px] uppercase text-slate-500"><span className="sm:hidden">As.</span><span className="hidden sm:inline">Asema</span> {a + 1}</div>
              <div className="text-lg font-bold leading-tight sm:text-xl">{ampuja ? ampuja.nro : '–'}</div>
              <div className="truncate text-[11px]">{ampuja ? nimi(ampuja.nro).split(' ')[0] : ''}</div>
              {ampuja && <div className="hidden font-mono text-xs sm:block">{[...merkit].map((m) => (m === 'X' ? 'X' : m === 'O' ? '0' : '·')).join('')}</div>}
              {valahdys?.asema === a && (
                <div className="absolute inset-0 flex gap-0.5 rounded-md bg-white p-0.5" aria-live="polite">
                  {[...merkitOf(tila.kortit, valahdys.nro).slice(valahdys.alku, valahdys.loppu)].map((m, k) => (
                    <div key={k} className={`flex flex-1 items-center justify-center rounded text-2xl font-bold text-white ${m === 'X' ? 'bg-green-600' : m === 'O' ? 'bg-red-600' : 'bg-slate-200'}`}>
                      {m === 'X' ? 'X' : m === 'O' ? '0' : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="min-w-0 rounded-lg border-2 border-transparent bg-slate-700 p-0.5 text-center text-white sm:p-1">
          <div className="whitespace-nowrap text-[10px] uppercase opacity-80">Valmis</div>
          <div className="whitespace-nowrap text-base leading-7 font-bold sm:text-xl">
            {viimeisinValmis === null ? '–' : tila.keskeyttaneet.includes(viimeisinValmis) ? 'kesk.' : `${osumat(merkitOf(tila.kortit, viimeisinValmis))}/${KOHTEITA}`}
          </div>
          <div className="truncate text-[11px]">{viimeisinValmis ? `${viimeisinValmis} ${nimi(viimeisinValmis).split(' ')[0]}` : ''}</div>
        </div>
      </section>

      {/* Seuraava pysyy paikallaan listan yllä, ettei se vierity pois näkyvistä. */}
      {seuraava && (
        <div className="mx-2 mt-1.5 shrink-0 rounded-lg bg-white px-2 py-1 text-sm sm:mx-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-slate-500">Seuraava</span>
            <span className="min-w-8 rounded bg-slate-200 px-1 text-center">{seuraava.nro}</span>
            <span className="min-w-0 flex-1 truncate">{seuraava.nimi || '(ei nimeä)'}{seuraava.aika ? ` · ${seuraava.aika}` : ''}</span>
            <button type="button" className={`rounded px-2 py-0.5 sm:py-1 ${seuraava.taukoEnnen ? 'bg-amber-600 text-white' : 'border border-slate-400'}`} onClick={() => vaihdaTauko(seuraava.nro)}>
              {seuraava.taukoEnnen ? 'Tauko ✓' : 'Tauko'}
            </button>
            <button type="button" className="rounded border border-slate-400 px-2 py-0.5 sm:py-1" onClick={() => ohita(seuraava.nro)}>Ohita</button>
          </div>
          {tulevat.length > 1 && (
            <div className="hidden truncate text-xs text-slate-500 sm:block">
              Sitten {tulevat.slice(1, 4).map((a) => `${a.nro} ${(a.nimi || '').split(' ')[0]}`.trim()).join(', ')}{tulevat.length > 4 ? ' …' : ''}
            </div>
          )}
          {seuraava.taukoEnnen && linja.length > 0 && (
            <p className="text-xs text-amber-800">Tauko: linja tyhjennetään ennen ampujaa {seuraava.nro}.</p>
          )}
        </div>
      )}

      <section ref={setLista} className={`${korjaustila ? 'bg-amber-50' : ''} flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2`}>
        {naytetty !== null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm font-semibold">
              Korjaus
              <button type="button" className="rounded border border-slate-400 bg-white px-2 py-1" onClick={lopetaKorjaus}>Sulje</button>
            </div>
            {kortti(naytetty, 'korjaus')}
          </div>
        )}
        {!tilanne && jono.length === 0 && <p className="rounded bg-white p-4">Radan aikataulusta ei löytynyt ampujia. Lisää ampuja numerolla valikosta.</p>}
        {!tilanne && jono.length > 0 && <p className="rounded bg-white p-4 font-semibold text-green-800">Kaikki jonon ampujat ovat ampuneet radan.</p>}
        {/* Uusin ylimpänä: asemalla 1 oleva ensin, asemalla 5 oleva alimpana. */}
        {linja.filter((l) => l.nro !== naytetty).map((l) => kortti(l.nro))}

        {valmiit.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold">
              Ampuneet ({valmiit.length})
              {valmiit.length > 3 && (
                <button type="button" className="rounded border border-slate-400 bg-white px-3 py-1 font-normal" onClick={() => setKaikkiValmiit((v) => !v)}>
                  {kaikkiValmiit ? 'Näytä vain viimeisimmät' : `Näytä kaikki (${valmiit.length})`}
                </button>
              )}
            </div>
            {naytettavatValmiit.filter((nro) => nro !== naytetty).map((nro) => kortti(nro, undefined, true))}
          </div>
        )}
      </section>

      <footer className="shrink-0 border-t border-slate-300 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pt-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.1)]">
        {valinta ? (
          <>
            <div className="mb-1 text-center text-sm leading-tight">
              <div className="truncate font-bold text-amber-800">
                Korjaus: {kohdeTeksti(valinta)} · nyt {merkitOf(tila.kortit, valinta.nro)[valinta.i] === 'X' ? 'OSUMA' : 'NOLLA'}
              </div>
              <div className="truncate text-xs text-slate-600">
                {tilanne ? `Sen jälkeen jatketaan: vuorossa ${tilanne.vuoro.nro} ${nimi(tilanne.vuoro.nro)}, asema ${tilanne.vuoro.asema + 1}` : 'Kaikki on ammuttu.'}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <button type="button" className="h-14 rounded-lg border-2 border-slate-400 text-lg font-semibold active:bg-slate-200 sm:h-20" onClick={() => setValinta(null)}>
                Peruuta
              </button>
              {merkitOf(tila.kortit, valinta.nro)[valinta.i] === 'X' ? (
                <button type="button" className="h-14 rounded-lg bg-red-700 text-xl font-bold text-white active:bg-red-900 sm:h-20" onClick={korjaa}>Muuta NOLLAKSI</button>
              ) : (
                <button type="button" className="h-14 rounded-lg bg-green-700 text-xl font-bold text-white active:bg-green-900 sm:h-20" onClick={korjaa}>Muuta OSUMAKSI</button>
              )}
            </div>
          </>
        ) : korjaustila ? (
          <>
            <div className="mb-1 text-center text-sm leading-tight">
              <div className="truncate font-bold text-amber-800">Korjaustila: napauta korjattavaa kiekkoa kortilla</div>
              <div className="truncate text-xs text-slate-600">{kuittaus || 'Merkittyjä kiekkoja ja keskeytystä voi nyt muuttaa.'}</div>
            </div>
            <button type="button" className="flex h-14 w-full flex-col items-center justify-center rounded-lg bg-blue-800 text-white active:bg-blue-950 sm:h-20" onClick={lopetaKorjaus}>
              <span className="text-lg font-bold leading-tight">Lopeta korjaus</span>
              {tilanne && <span className="max-w-full truncate px-2 text-xs leading-tight">jatketaan: vuorossa {tilanne.vuoro.nro} {nimi(tilanne.vuoro.nro)}, asema {tilanne.vuoro.asema + 1}</span>}
            </button>
          </>
        ) : (
          <>
            <div className={`mb-1 h-5 truncate text-center text-sm sm:mb-2 sm:h-6 ${kuittaus ? 'rounded bg-amber-100 text-amber-900' : ''}`}>
              {kuittaus ? (
                <>{kuittaus} {vuorossa ? <>Jatka: <b>{vuorossa.nro} {nimi(vuorossa.nro)}</b>, asema {vuorossa.asema + 1}</> : ''}</>
              ) : vuorossa && (
                <>
                  Vuorossa <b>{vuorossa.nro} {nimi(vuorossa.nro)}</b> · asema {vuorossa.asema + 1} ·{' '}
                  {sarja === 2 ? <b>tupla, kiekko {kohta.i - vuorossa.alku + 1}/2</b> : 'yksittäinen'}
                </>
              )}
            </div>
            <div className="grid grid-cols-[1fr_2fr_2fr] gap-2">
              <button type="button" className="flex h-14 flex-col items-center justify-center rounded-lg border-2 border-slate-400 font-semibold active:bg-slate-200 disabled:opacity-30 sm:h-20" disabled={!edellinen} onClick={peruViimeisin}>
                <span className="text-lg leading-tight">PERU</span>
                {edellinen && <span className="text-[11px] font-normal leading-tight text-slate-600">{edellinen.nro}: {edellinen.merkki === 'X' ? 'osuma' : edellinen.merkki === 'O' ? 'nolla' : 'tyhjä'}</span>}
              </button>
              <button type="button" className="h-14 rounded-lg bg-red-700 text-2xl font-bold text-white active:bg-red-900 disabled:opacity-30 sm:h-20" disabled={!tilanne} onClick={() => merkitseKohta('O')}>
                NOLLA
              </button>
              <button type="button" className="h-14 rounded-lg bg-green-700 text-2xl font-bold text-white active:bg-green-900 disabled:opacity-30 sm:h-20" disabled={!tilanne} onClick={() => merkitseKohta('X')}>
                OSUMA
              </button>
            </div>
          </>
        )}
      </footer>
    </main>
  );
}

const muuLaiteAvain = (muu) => `${muu.laite}|${muu.aika}`;

// Laitteelle tallennettu tila; vanhan version lisätyt (pelkät numerot) menevät jonon loppuun.
function alkutila(tallessa) {
  const t = {
    kortit: {}, historia: [], lisatyt: [], ohitetut: [], tauot: [], tauotPois: [], keskeyttaneet: [], ohjelma: null, avaus: null,
    ...tallessa
  };
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

function AmpujaRivi({ ampuja, merkit, lahetetty, kohta, korostus, valmis, keskeyttanyt, onKeskeyta, onValitse }) {
  const aktiivinen = kohta !== null;
  const asemat = Array.from({ length: KOHTEITA / ASEMAN_KOHTEET }, (_, a) => a);
  const reuna = korostus === 'korjaus' ? 'border-amber-600' : aktiivinen ? 'border-blue-700' : 'border-transparent';
  return (
    <div data-nro={ampuja.nro} className={`shrink-0 rounded-lg border-2 px-1.5 py-0.5 sm:p-2 ${valmis ? 'bg-slate-300' : 'bg-white'} ${reuna}`}>
      <div className="flex w-full items-center justify-between gap-2 text-left">
        <span className="min-w-0 truncate text-sm font-semibold sm:text-base">
          <span className="mr-2 inline-block min-w-8 rounded bg-slate-200 px-1 text-center">{ampuja.nro}</span>
          {ampuja.nimi || '(ei nimeä)'}
        </span>
        {/* Keskeytys vain korjaustilassa, ettei sitä paineta vahingossa kesken kirjauksen. */}
        {onKeskeyta ? (
          <button type="button" className={`shrink-0 rounded px-2 text-[11px] leading-5 sm:py-0.5 sm:text-xs ${keskeyttanyt ? 'bg-slate-700 text-white' : 'border border-slate-300 text-slate-600'}`} onClick={onKeskeyta}>
            {keskeyttanyt ? 'Keskeytti · peru' : 'Keskeytti'}
          </button>
        ) : keskeyttanyt && (
          <span className="shrink-0 rounded bg-slate-700 px-2 text-[11px] leading-5 text-white sm:text-xs">Keskeytti</span>
        )}
        <span className="shrink-0 text-lg leading-tight font-bold sm:text-xl">
          {osumat(merkit)}
          <span className="text-sm font-normal text-slate-500"> / {taytetyt(merkit)}{lahetetty ? '' : ' •'}</span>
        </span>
      </div>
      <div className="mt-1 grid grid-cols-5 gap-1.5 sm:mt-2 sm:gap-2">
        {asemat.map((a) => (
          <div key={a} className="grid grid-cols-5 gap-0.5">
            {Array.from({ length: ASEMAN_KOHTEET }, (_, k) => {
              const i = a * ASEMAN_KOHTEET + k;
              const m = merkit[i];
              const vari = m === 'X' ? 'bg-green-700 text-white' : m === 'O' ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-400';
              const luokat = `flex h-5 items-center justify-center rounded-sm text-xs font-bold sm:h-8 ${vari} ${kohta === i ? 'ring-2 ring-blue-700 ring-offset-1' : ''}`;
              const teksti = m === 'X' ? 'X' : m === 'O' ? '0' : '';
              // Kiekkoa voi napauttaa vain korjaustilassa ja vain, jos se on jo merkitty.
              return onValitse && m !== '-' ? (
                <button key={i} type="button" aria-label={`Korjaa asema ${a + 1}, kiekko ${k + 1}`} className={`${luokat} ring-1 ring-amber-500`} onClick={() => onValitse(i)}>
                  {teksti}
                </button>
              ) : (
                <div key={i} className={luokat}>{teksti}</div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const OHJELMAN_NIMET = { SSSD: '3 yksittäistä + tupla', SDD: 'yksittäinen + 2 tuplaa', SSSSS: '5 yksittäistä' };

function OhjelmaEditori({ alku, kisanArvo, kisanOhjelma, sarake, onTallenna, onPeru }) {
  const [valittu, setValittu] = useState(alku || ohjelmaTekstiksi(OHJELMAT[0]));
  const selitys = kisanArvo && !kisanOhjelma
    ? `Kisan asetuksen RATA${sarake}_OHJELMA arvoa "${kisanArvo}" ei voitu lukea (käy SSSD, SDD tai SSSSS).`
    : kisanOhjelma
      ? `Kisan asetuksissa ohjelma on ${kisanOhjelma}. Muu valinta koskee vain tätä laitetta.`
      : `Kisan asetuksissa (KISANSPEKSIT, RATA${sarake}_OHJELMA) ei ole ohjelmaa. Valitse radan ohjelma menukortin mukaan.`;
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      <h2 className="text-lg font-bold">Radan ammuntaohjelma</h2>
      <p className="text-sm text-slate-700">{selitys} Ohjelma on sama kaikilla asemilla.</p>
      {OHJELMAT.map(ohjelmaTekstiksi).map((t) => (
        <label key={t} className={`flex items-center gap-3 rounded-lg border-2 bg-white p-3 ${valittu === t ? 'border-blue-700' : 'border-transparent'}`}>
          <input type="radio" name="ohjelma" checked={valittu === t} onChange={() => setValittu(t)} />
          <span className="font-mono text-lg font-bold">{t}</span>
          <span className="text-sm text-slate-600">{OHJELMAN_NIMET[t]}</span>
        </label>
      ))}
      <button type="button" className="rounded bg-blue-800 px-4 py-3 text-lg font-semibold text-white" onClick={() => onTallenna(valittu)}>
        Käytä tätä ohjelmaa
      </button>
      {kisanOhjelma && kisanOhjelma !== alku && (
        <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={() => onTallenna(null)}>Käytä kisan asetusta ({kisanOhjelma})</button>
      )}
      {onPeru && <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={onPeru}>Peruuta</button>}
    </section>
  );
}

function Valikko({ ohjelma, onMuokkaaOhjelmaa, onHaeNumero, onVaihdaRata, onKorjaa, aanet, onAanet, nollaAani, onNollaAani, onTyhjenna, hereilla, lataus, viimeksi }) {
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
      <button type="button" className="rounded border border-amber-600 bg-amber-50 px-3 py-2 text-left" onClick={onKorjaa}>
        <b>Korjaa merkintöjä</b> · muuta kiekko osumaksi tai nollaksi tai merkitse keskeytys
      </button>
      <div className="flex items-center justify-between gap-2">
        <span>Äänet osumalle ja nollalle: <b>{aanet ? 'päällä' : 'pois'}</b></span>
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={onAanet}>{aanet ? 'Pois' : 'Päälle'}</button>
      </div>
      {aanet && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Nollan ääni:</span>
          {Object.entries(NOLLA_AANET).map(([avain, v]) => (
            <button key={avain} type="button" className={`rounded border px-3 py-2 ${nollaAani === avain ? 'border-blue-800 bg-blue-800 text-white' : 'border-slate-400'}`} onClick={() => onNollaAani(avain)}>
              {v.nimi}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span>Ohjelma: <b>{ohjelma || '–'}</b></span>
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={onMuokkaaOhjelmaa}>Muuta</button>
      </div>
      <p className="text-slate-600">
        {hereilla ? 'Näyttö pysyy päällä.' : 'Näytön päälläpito ei ole käytössä tällä selaimella.'}
        {lataus.tila === 'virhe' ? ` Radan tietoja ei saatu päivitettyä (${lataus.viesti}).` : ''}
        {viimeksi ? ` Viimeksi lähetetty klo ${new Date(viimeksi).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}.` : ''}
      </p>
      <button type="button" className="self-start rounded border border-slate-400 px-3 py-2" onClick={onVaihdaRata}>Vaihda ratakoodi</button>
      {onTyhjenna && (
        <button type="button" className="self-start rounded border border-red-700 px-3 py-2 text-red-800" onClick={onTyhjenna}>
          Tyhjennä rata laitteelta (testiversio)
        </button>
      )}
    </div>
  );
}
