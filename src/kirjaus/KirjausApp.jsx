// Mobiilikirjaus: Compak-radan laite kirjaa inline-linjan tulokset sarja kerrallaan (linja.js).
// Ratakoodi tulee QR-koodin linkistä (kirjaus.html#k=<koodi>) ja tallennetaan laitteelle.
// Merkinnät tallennetaan heti laitteelle ja lähetetään taulukkoon taustalla (api/kirjaus.js). Ilman verkkoa
// kirjaus jatkuu: sovellus aukeaa palvelutyöntekijän välimuistista ja kortit lähtevät, kun yhteys palaa.
// Radalla on yksi laite kerrallaan (haltija). Rata siirtyy toiselle laitteelle luovuttamalla (verkossa),
// siirto-QR-koodilla (vanha laite ilman verkkoa) tai kilpailutoimiston vaihto-PIN-koodilla (vanha laite poissa).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASEMAN_KOHTEET, KOHTEITA, kuittaa, lahettamattomat, lueKoodi as lueKoodinSisalto, merkitOf, merkitse,
  osumat, peru, taytetyt, yhdistaPalvelimelta
} from './kortit.js';
import {
  ASEMIA, OHJELMAT, jasennaOhjelma, laskeVuorot, linjanTilanne, ohjelmaTekstiksi, radanLinjajono, tulevatAmpujat
} from './linja.js';
import {
  kirjaaMerkinta, laitteenTunnus, lueKoodi, lueMerkinnat, lueRata, lueRataTietokannasta, otaOdottavaSiirto,
  poistaRataTietokannasta, pyydaPysyvaTallennus, siivoaMerkinnat, tallennaKoodi, tallennaOdottavaSiirto, tallennaRata,
  tallennaRataTietokantaan
} from './varasto.js';
import {
  laitteenNimi, linjaTekstina, linjaTilasta, lueSiirto, otaLinja, otaTaydennykset, siirtoLinkki, yhdistaSiirto
} from './haltija.js';
import { HaltijaNakyma, SiirtoNakyma } from './Haltija.jsx';
import { useHereilla } from './useHereilla.js';
import { useAkku } from './useAkku.js';
import { onIos, pyydaTaustalahetys, useAsennus, useTakaisinVahti } from './sovellus.js';
import Lukitus from './Lukitus.jsx';
import { NOLLA_AANET, OLETUS_NOLLA_AANI, soita } from './aanet.js';

const SYNKRONOINTI_VALI_MS = 15000;
// Ilman lähetettävää haltija tarkistaa radan näin usein: korvattujen laitteiden täydennykset ja oma korvaus.
const TARKISTUS_VALI_MS = 60000;
// Valmis asema (5 kiekkoa) lähetetään heti; kesken olevat merkinnät kootaan, koska kirjuritilillä on
// Googlen kiintiö (60 kirjoitusta minuutissa kaikille radoille yhteensä).
const LAHETYS_VIIVE_MS = 1500;
const KESKEN_VIIVE_MS = 10000;
const NAPAUTUSVALI_MS = 150;
const KUITTAUS_MS = 6000;
const VALAHDYS_MS = 2500;
// Yhteyskatkon kesto otsikossa päivitetään puolen minuutin välein.
const KELLO_MS = 30000;

// Ratakoodi (ja toisen laitteen siirto) linkistä talteen. Palauttaa true, jos koodi kelpaa.
function kaytaLinkki(hash) {
  const { koodi, siirto } = lueSiirto(hash, KOHTEITA);
  if (!koodi || !lueKoodinSisalto(koodi)) return '';
  tallennaKoodi(koodi);
  tallennaOdottavaSiirto(siirto ? { koodi, siirto } : null);
  return koodi;
}

function alkuKoodi() {
  const k = kaytaLinkki(window.location.hash);
  if (k) {
    // Koodi pois osoiteriviltä, ettei se näy kuvakaappauksissa tai jaetuissa linkeissä. Kysely jää (Vercelin
    // esikatselun jakolinkki), jotta siirtolinkki toimii myös uudella laitteella.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
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
    const k = kaytaLinkki(teksti.includes('#') ? teksti.slice(teksti.indexOf('#')) : `k=${teksti}`);
    if (!k) {
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
  const akku = useAkku();

  const [tila, setTila] = useState(() => alkutila(lueRata(info.sheetId, info.sarake)));
  const [lataus, setLataus] = useState({ tila: 'ladataan', viesti: '', pysyva: false });
  // katkesi: ensimmäisen epäonnistuneen lähetyksen aika viimeisen onnistuneen jälkeen (otsikon "ei yhteyttä 12 min").
  const [synk, setSynk] = useState({ virhe: '', viimeksi: null, katkesi: null });
  const [lukittu, setLukittu] = useState(false);
  // Laitteelle tallennus: ok (ainakin toinen kopio onnistui), pysyva = selain lupasi olla poistamatta tietoja.
  const [tallennus, setTallennus] = useState({ ok: true, pysyva: false });
  const asennus = useAsennus();
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
  const [siirto, setSiirto] = useState(false);
  const otetaanRef = useRef(false);

  const tilaRef = useRef(tila);
  const lahettaaRef = useRef(false);
  const tarkistettuRef = useRef(Date.now());
  // Testiversion "Tyhjennä rata laitteelta": ei enää tallenneta eikä lähetetä ennen sivun uudelleenlatausta.
  const tyhjennettyRef = useRef(false);
  // Tallennusten järjestysnumero: kahdesta kopiosta (localStorage, IndexedDB) uudempi on se, jolla numero on suurempi.
  const jarjestysRef = useRef(tila.jarjestys || 0);
  const alkuJarjestys = useRef(tila.jarjestys || 0);
  // IndexedDB-kopioon kirjoitetaan ja radan tiedot haetaan vasta, kun kopio on luettu ja verrattu
  // (muuten tallennus kirjoittaisi uudemman kopion yli tai avaus muuttaisi tilaa ennen vertailua).
  const [kopioLuettu, setKopioLuettu] = useState(false);
  // Taustalähetys pyydetty (yhteys katkesi): piilossa olevan sivun ei tarvitse lähettää samoja kortteja.
  const taustaRef = useRef(false);

  // Jos localStorage-kopio puuttuu tai on vanhempi (tallennus epäonnistui, selain tyhjensi sen), jatketaan
  // IndexedDB:n kopiosta. Kopion lukuun asti tila ei muutu (merkinnät odottavat avausta, avaus kopiota).
  useEffect(() => {
    let peruttu = false;
    lueRataTietokannasta(info.sheetId, info.sarake).then((kopio) => {
      if (peruttu) return;
      if (kopio && (kopio.jarjestys || 0) > alkuJarjestys.current) {
        jarjestysRef.current = Math.max(jarjestysRef.current, kopio.jarjestys);
        setTila(alkutila(kopio));
      }
      // Toiselta laitteelta siirtolinkillä tulleet kortit ja linja; rata otetaan siirtoavaimella, kun yhteys on.
      const siirretty = otaOdottavaSiirto(koodi);
      if (siirretty) setTila((t) => yhdistaSiirto(t, siirretty));
      setKopioLuettu(true);
    });
    siivoaMerkinnat();
    pyydaPysyvaTallennus().then((pysyva) => {
      if (!peruttu) setTallennus((t) => ({ ...t, pysyva }));
    });
    return () => { peruttu = true; };
  }, [info, koodi]);

  useEffect(() => {
    tilaRef.current = tila;
    if (tyhjennettyRef.current) return;
    jarjestysRef.current += 1;
    const tallennettava = { ...tila, jarjestys: jarjestysRef.current };
    const paikallinen = tallennaRata(info.sheetId, info.sarake, tallennettava);
    if (!kopioLuettu) {
      if (!paikallinen) setTallennus((t) => (t.ok ? { ...t, ok: false } : t));
      return;
    }
    // Nimet lähettämättömille korteille, jotta taustalähetys kirjoittaa saman nimen kuin sivu (myös laitteella lisätyt).
    const nimet = Object.fromEntries(lahettamattomat(tila.kortit, Infinity).map((k) => [k.nro, nimiRef.current(k.nro)]));
    tallennaRataTietokantaan(info.sheetId, info.sarake, { tila: tallennettava, koodi, laite, nimet }).then((kopio) => {
      const ok = paikallinen || kopio;
      setTallennus((t) => (t.ok === ok ? t : { ...t, ok }));
    });
  }, [tila, info, koodi, laite, kopioLuettu]);

  // Radan tiedot ja taulukossa jo olevat kortit. Ilman yhteyttä jatketaan laitteelle tallennetuilla tiedoilla
  // ja yritetään uudelleen, kun yhteys palaa.
  useEffect(() => {
    if (!kopioLuettu) return undefined;
    let peruttu = false;
    const headers = { Authorization: `Bearer ${koodi}`, 'X-Kirjaus-Laite': laite };
    if (tilaRef.current.haltija) headers['X-Kirjaus-Haltija'] = tilaRef.current.haltija;
    fetch('/api/kirjaus?toiminto=avaa', { headers, cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (peruttu) return;
        if (!res.ok) {
          setLataus({ tila: 'virhe', viesti: data.error || `Virhe ${res.status}`, pysyva: res.status === 401 });
          return;
        }
        // Tällä laitteella oli rata, mutta se on nyt toisella (vaihdettu PIN-koodilla) tai luovutettu: korvattu.
        // Lähettämättömät kortit lähtevät vielä kerran, jolloin palvelin kirjaa poikkeavat lokiin.
        const korvattu = Boolean(tilaRef.current.haltija) && !data.haltija?.oma && !data.haltija?.tamaLaite;
        setTila((t) => ({
          ...taydennettyna(
            { ...t, avaus: data, kortit: yhdistaPalvelimelta(t.kortit, data.kortit, { kaikki: true }) },
            data.haltija?.oma ? data.taydennykset : null,
            data.kohteita
          ),
          ...(korvattu && lahettamattomat(t.kortit).length === 0 ? { haltija: null, korvattu: korvausTieto(data.haltija, 0) } : {})
        }));
        setLataus({ tila: 'ok', viesti: '', pysyva: false });
      })
      .catch(() => {
        if (!peruttu) setLataus({ tila: 'virhe', viesti: 'Ei yhteyttä', pysyva: false });
      });
    return () => { peruttu = true; };
  }, [koodi, laite, latausKierros, kopioLuettu]);

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

  // Ottaa radan tälle laitteelle: vapaa rata suoraan, siirtolinkin avaimella tai vaihto-PIN-koodilla.
  // Palauttaa { ok } tai { virhe }. Onnistuessa radan tiedot haetaan uudelleen (toinen laite on voinut tallentaa).
  const otaRata = useCallback(async ({ pin } = {}) => {
    if (otetaanRef.current) return { virhe: 'Odota hetki' };
    otetaanRef.current = true;
    const siirtoAvain = tilaRef.current.siirtoAvain;
    try {
      const res = await fetch('/api/kirjaus?toiminto=ota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, nimi: laitteenNimi(laite), ...(pin ? { pin } : {}), ...(siirtoAvain ? { siirto: siirtoAvain } : {}) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Varattu tai siirtoavain vanhentui: näytetään radan haltija ja PIN-kysely.
        if (data.haltija) {
          setTila((t) => ({ ...t, siirtoAvain: null, avaus: t.avaus ? { ...t.avaus, haltija: data.haltija } : t.avaus }));
        }
        return { virhe: data.error || `Virhe ${res.status}`, yrityksia: data.yrityksia };
      }
      setTila((t) => {
        // Taulukon linja käyttöön, paitsi siirrossa (siirtolinkin linja on tuoreempi: vanha laite oli ilman verkkoa)
        // ja kun tällä laitteella on lähettämättömiä linjan muutoksia (esim. sama laite ottaa radan takaisin).
        const omaMuutos = t.lahetettyLinja !== null && t.lahetettyLinja !== undefined && linjaTekstina(t) !== t.lahetettyLinja;
        const otetaan = !siirtoAvain && data.linja && !omaMuutos;
        const linjalla = otetaan ? otaLinja(t, data.linja) : t;
        return {
          ...linjalla,
          haltija: data.haltija,
          siirtoAvain: null,
          korvattu: null,
          luovutettu: false,
          // PIN-vaihdossa vanhan laitteen viimeiset merkinnät voivat puuttua: kirjaaja tarkistaa linjan.
          tarkistaLinja: Boolean(pin),
          lahetettyLinja: otetaan ? linjaTekstina(linjalla) : t.lahetettyLinja,
          avaus: t.avaus ? { ...t.avaus, haltija: data.tila } : t.avaus
        };
      });
      setLatausKierros((n) => n + 1);
      return { ok: true };
    } catch {
      return { virhe: 'Ei yhteyttä' };
    } finally {
      otetaanRef.current = false;
    }
  }, [koodi, laite]);

  const laheta = useCallback(async () => {
    if (lahettaaRef.current || tyhjennettyRef.current) return;
    if (document.visibilityState === 'hidden' && taustaRef.current) return;
    const { avaus: avattu, haltija, siirtoAvain, korvattu, luovutettu } = tilaRef.current;
    // Rata on toisella laitteella tai luovutettu: tämä laite ei enää lähetä.
    if (korvattu || luovutettu || !avattu) return;
    const lahetetyt = lahettamattomat(tilaRef.current.kortit);
    const linja = linjaTekstina(tilaRef.current);
    const linjaMuuttui = linja !== tilaRef.current.lahetettyLinja;
    const tarkistus = lahetetyt.length === 0 && !linjaMuuttui;
    if (tarkistus && (!haltija || Date.now() - tarkistettuRef.current < TARKISTUS_VALI_MS)) return;
    // Ei vielä haltija: vapaa rata tai siirtolinkki otetaan ensin (varatulle radalle tarvitaan PIN näkymästä).
    if (!haltija) {
      if (avattu.haltija?.vapaa || siirtoAvain) await otaRata();
      return;
    }
    lahettaaRef.current = true;
    try {
      const res = await fetch('/api/kirjaus?toiminto=tallenna', {
        method: 'POST',
        // keepalive: lähetys ehtii perille, vaikka sivu suljettaisiin tai laite lukittaisiin heti merkinnän jälkeen.
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({
          laite,
          haltija,
          kortit: lahetetyt.map((k) => ({ ...k, nimi: nimiRef.current(k.nro) })),
          ...(linjaMuuttui ? { linja: linjaTilasta(tilaRef.current) } : {})
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.korvattu) {
        setTila((t) => ({
          ...t,
          haltija: null,
          korvattu: korvausTieto(data.haltija, data.kirjattu, data.taydennetty),
          avaus: t.avaus ? { ...t.avaus, haltija: data.haltija || t.avaus.haltija } : t.avaus
        }));
        setSynk({ virhe: '', viimeksi: null, katkesi: null });
        return;
      }
      if (!res.ok) throw new Error(data.error || `Virhe ${res.status}`);
      tarkistettuRef.current = Date.now();
      setTila((t) => ({
        ...taydennettyna({ ...t, kortit: kuittaa(t.kortit, lahetetyt, data) }, data.taydennykset, t.avaus?.kohteita),
        ...(linjaMuuttui ? { lahetettyLinja: linja } : {})
      }));
      setSynk({ virhe: '', viimeksi: Date.now(), katkesi: null });
      taustaRef.current = false;
      // Taulukossa oli toisen laitteen uudempi kortti: kaksi laitetta kirjaa samaa rataa.
      const muu = (data.uudemmat || []).find((k) => k.muuLaite);
      if (muu) setToinenLaite({ aika: muu.aika, nro: muu.nro });
    } catch (error) {
      const verkko = error instanceof TypeError;
      setSynk((s) => ({ ...s, virhe: verkko ? 'Ei yhteyttä' : error.message, katkesi: s.katkesi || Date.now() }));
      // Selain lähettää taustalla, kun yhteys palaa, vaikka sivu suljettaisiin (Chrome/Android).
      if (verkko) pyydaTaustalahetys().then((pyydetty) => { if (pyydetty) taustaRef.current = true; });
    } finally {
      lahettaaRef.current = false;
    }
  }, [koodi, laite, otaRata]);

  const odottavat = useMemo(() => lahettamattomat(tila.kortit, Infinity), [tila.kortit]);
  const lahettamatta = odottavat.length;
  const asemaValmis = odottavat.some((k) => taytetyt(k.merkit) % ASEMAN_KOHTEET === 0);
  const linjaMuuttui = linjaTekstina(tila) !== tila.lahetettyLinja;

  // Lähetys pian muutoksen jälkeen, varmuuden vuoksi määrävälein, kun yhteys palaa ja kun sivu jää taustalle
  // (laitteen vaihto: viimeisetkin merkinnät taulukkoon ennen kuin toinen laite avaa radan).
  useEffect(() => {
    if (lahettamatta === 0 && !linjaMuuttui) return undefined;
    const ajastin = setTimeout(laheta, asemaValmis || lahettamatta === 0 ? LAHETYS_VIIVE_MS : KESKEN_VIIVE_MS);
    return () => clearTimeout(ajastin);
  }, [tila.kortit, lahettamatta, asemaValmis, linjaMuuttui, laheta]);

  // Avaus kertoi radan vapaaksi (tai siirtolinkki odottaa) eikä tällä laitteella ole vielä rataa: otetaan heti,
  // ettei toinen laite ehdi ensin. Rata on tämän laitteen, mutta avain puuttuu: avain haetaan uudelleen.
  // Luovuttanut tai korvattu laite ei ota rataa takaisin itsestään.
  const avattuHaltija = tila.avaus?.haltija;
  const otaHeti = Boolean(avattuHaltija && !tila.korvattu && !tila.luovutettu
    && ((!tila.haltija && (avattuHaltija.vapaa || tila.siirtoAvain)) || (avattuHaltija.tamaLaite && !avattuHaltija.oma)));
  useEffect(() => {
    if (otaHeti) otaRata();
  }, [otaHeti, latausKierros, otaRata]);

  // Avauksessa havaittu korvaus: lähettämättömät kortit lähtevät kerran (palvelin kirjaa poikkeavat lokiin).
  const korvattuAvauksessa = Boolean(tila.haltija && tila.avaus?.haltija && !tila.avaus.haltija.oma && !tila.avaus.haltija.tamaLaite);
  useEffect(() => {
    if (korvattuAvauksessa) laheta();
  }, [korvattuAvauksessa, laheta]);

  useEffect(() => {
    const vali = setInterval(laheta, SYNKRONOINTI_VALI_MS);
    const nakyvyys = () => {
      // Piiloon jäädessä viimeiset merkinnät; jos lähetys epäonnistuu, se pyytää taustalähetyksen.
      laheta();
    };
    window.addEventListener('online', laheta);
    document.addEventListener('visibilitychange', nakyvyys);
    return () => {
      clearInterval(vali);
      window.removeEventListener('online', laheta);
      document.removeEventListener('visibilitychange', nakyvyys);
    };
  }, [laheta]);

  // Radan tiedot haetaan uudelleen, kun yhteys palaa tai sovellus tulee näkyviin, jos edellinen haku epäonnistui.
  const latausVirhe = lataus.tila === 'virhe' && !lataus.pysyva;
  useEffect(() => {
    if (!latausVirhe) return undefined;
    const uudelleen = () => {
      if (document.visibilityState === 'visible') setLatausKierros((n) => n + 1);
    };
    window.addEventListener('online', uudelleen);
    document.addEventListener('visibilitychange', uudelleen);
    return () => {
      window.removeEventListener('online', uudelleen);
      document.removeEventListener('visibilitychange', uudelleen);
    };
  }, [latausVirhe]);

  // Kello yhteyskatkon kestoa varten, vain katkon aikana.
  const [nyt, setNyt] = useState(() => Date.now());
  useEffect(() => {
    if (!synk.katkesi) return undefined;
    const vali = setInterval(() => setNyt(Date.now()), KELLO_MS);
    return () => clearInterval(vali);
  }, [synk.katkesi]);

  // Selain kysyy ennen sulkemista, jos jotain on lähettämättä (mobiiliselaimet eivät aina kysy;
  // merkinnät ovat silti tallessa laitteella).
  // Takaisin-painike: sulkee ensin valikon, lukittuna ei tee mitään, muuten kysyy ennen poistumista.
  useTakaisinVahti(() => {
    if (lukittu) return true;
    if (valikko) {
      setValikko(false);
      return true;
    }
    const varoitus = lahettamatta > 0
      ? ` ${lahettamatta} ${lahettamatta === 1 ? 'kortti on' : 'korttia on'} vielä lähettämättä; ne lähtevät, kun avaat kirjauksen uudelleen.`
      : '';
    return !window.confirm(`Poistutaanko kirjauksesta? Merkinnät ovat tallessa laitteella.${varoitus}`);
  });

  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const kysy = (e) => {
      if (tyhjennettyRef.current || window.kirjausPoistuu) return;
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

  // Merkintäloki laitteelle (IndexedDB) ennen näytön päivitystä: jokainen napautus jää talteen tarkistusta varten.
  const kirjaa = (tapa, { nro, i }, ennen, jalkeen) => {
    kirjaaMerkinta(info.sheetId, info.sarake, { laite, tapa, nro, kiekko: i + 1, ennen, jalkeen });
  };

  const merkitseKohta = (merkki) => {
    if (korjaustila || valinta || !tilanne || liianPian()) return;
    kirjaa('merkintä', tilanne.kohta, merkitOf(tila.kortit, tilanne.kohta.nro)[tilanne.kohta.i], merkki);
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
    const vanha = merkitOf(tila.kortit, valinta.nro)[valinta.i];
    const uusi = vanha === 'X' ? 'O' : 'X';
    kirjaa('korjaus', valinta, vanha, uusi);
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
    kirjaa('peru', p.kohta, merkitOf(tila.kortit, p.kohta.nro)[p.kohta.i], merkitOf(p.kortit, p.kohta.nro)[p.kohta.i]);
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

  const tyhjennaRata = async () => {
    const varoitus = lahettamatta > 0 ? ` ${lahettamatta} lähettämätöntä korttia häviää.` : '';
    if (!window.confirm(`Tyhjennetäänkö radan ${info.sarake} tiedot tältä laitteelta?${varoitus} Taulukkoon tallennetut tulokset eivät muutu.`)) return;
    tyhjennettyRef.current = true;
    tallennaRata(info.sheetId, info.sarake, null);
    // Merkintäloki jää; radan kopio poistetaan ennen uudelleenlatausta, ettei sitä palauteta.
    await poistaRataTietokannasta(info.sheetId, info.sarake);
    window.location.reload();
  };

  // Laitteen merkintäloki tiedostona (esim. kilpailutoimistolle, jos tulosta joudutaan selvittämään).
  const lataaLoki = async () => {
    const rivit = await lueMerkinnat(info.sheetId, info.sarake);
    const tiedosto = new Blob([JSON.stringify({ kisa: avaus?.kisa, rata: info.sarake, laite, merkinnat: rivit.map((r) => ({
      ...r, aika: new Date(r.aika).toISOString()
    })) }, null, 1)], { type: 'application/json' });
    const linkki = document.createElement('a');
    linkki.href = URL.createObjectURL(tiedosto);
    linkki.download = `kirjaus-rata${info.sarake}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
    linkki.click();
    setTimeout(() => URL.revokeObjectURL(linkki.href), 10000);
  };

  // Asennettu sovellus iPhonessa ei näe Safarin tallennuksia, joten koodi liitetään sinne erikseen.
  // Asennettu sovellus on eri laite kuin Safari: kun rata on tällä, kopioidaan siirtolinkki, jolla sovellus ottaa radan
  // ilman PIN-koodia (lähettämättömät kortit mukana). Safari-välilehti näyttää sen jälkeen "Laite korvattu".
  const kopioiKoodi = async () => {
    const teksti = tila.haltija ? siirtoOsoite() : koodi;
    const ohje = tila.haltija
      ? 'Radan siirtolinkki kopioitu. Liitä se asennetun sovelluksen aloitusnäkymään: sovellus ottaa radan, ja kirjaus jatkuu siellä.'
      : 'Ratakoodi kopioitu. Liitä se asennetun sovelluksen aloitusnäkymään.';
    try {
      await navigator.clipboard.writeText(teksti);
      window.alert(ohje);
    } catch {
      window.prompt(ohje, teksti);
    }
  };

  const vaihdaRata = () => {
    if (lahettamatta > 0 && !window.confirm(`${lahettamatta} korttia on lähettämättä. Ne jäävät laitteelle ja lähtevät, kun avaat radan uudelleen. Vaihdetaanko rata?`)) return;
    onVaihda();
  };

  // Luovutus verkossa: kaikki lähetetään, sitten rata vapautetaan, ja seuraava laite ottaa sen radan QR-koodilla.
  const luovuta = async () => {
    setValikko(false);
    if (!window.confirm('Luovutetaanko rata toiselle laitteelle? Tämä laite lopettaa kirjauksen. Uusi laite skannaa radan QR-koodin ja jatkaa tästä.')) return;
    // Käynnissä oleva lähetys odotetaan, ja vastauksen täydennykset lähetetään vielä (tila päivittyy piirrossa).
    for (let kierros = 0; kierros < 20; kierros++) {
      if (!lahettaaRef.current) await laheta();
      await new Promise((r) => { setTimeout(r, 250); });
      if (!lahettaaRef.current && lahettamattomat(tilaRef.current.kortit).length === 0) break;
    }
    if (lahettamattomat(tilaRef.current.kortit).length > 0) {
      window.alert('Kaikkia kortteja ei saatu lähetettyä. Yritä uudelleen, kun yhteys toimii, tai käytä ☰ › Siirrä toiselle laitteelle QR-koodilla.');
      return;
    }
    try {
      const res = await fetch('/api/kirjaus?toiminto=vapauta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, haltija: tilaRef.current.haltija, linja: linjaTilasta(tilaRef.current) })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setTila((t) => ({ ...t, haltija: null, korvattu: korvausTieto(data.haltija, 0) }));
        return;
      }
      if (!res.ok) throw new Error(data.error || `Virhe ${res.status}`);
      setTila((t) => ({ ...t, haltija: null, luovutettu: true, lahetettyLinja: linjaTekstina(t) }));
    } catch (error) {
      window.alert(`Rataa ei saatu luovutettua (${error instanceof TypeError ? 'ei yhteyttä' : error.message}). Käytä tarvittaessa ☰ › Siirrä toiselle laitteelle QR-koodilla.`);
    }
  };

  // Siirtolinkki QR-koodina: haltija-avain ja lähettämättömät kortit uudelle laitteelle ilman verkkoa.
  const siirtoOsoite = () => siirtoLinkki({
    perus: `${window.location.origin}${window.location.pathname}${window.location.search}`,
    koodi,
    haltija: tila.haltija,
    kortit: lahettamattomat(tila.kortit, Infinity),
    // Linja aina mukana: uusi laite ei tunne taulukon linjaa ennen kuin se on ottanut radan.
    linja: linjaTilasta(tila)
  });

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
      <SynkMerkki lahettamatta={lahettamatta} virhe={synk.virhe} katkesi={synk.katkesi} nyt={nyt} />
      <button type="button" aria-label="Lukitse näyttö" className="rounded px-2 py-1 text-xl sm:py-2" onClick={() => { setValikko(false); setLukittu(true); }}>🔒</button>
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
      laitteenNimi={laitteenNimi(laite)}
      onLuovuta={tila.haltija ? luovuta : null}
      onSiirra={tila.haltija ? () => { setValikko(false); setSiirto(true); } : null}
      hereilla={hereilla}
      lataus={lataus}
      viimeksi={synk.viimeksi}
      tallennus={tallennus}
      asennus={asennus}
      onKopioiKoodi={kopioiKoodi}
      onLataaLoki={lataaLoki}
    />
  );

  // Rata ei ole tällä laitteella: korvattu, luovutettu tai toisen laitteen käytössä.
  const haltijanTila = avaus.haltija;
  const varattu = !tila.haltija && !tila.siirtoAvain && haltijanTila && !haltijanTila.oma && !haltijanTila.vapaa && !haltijanTila.tamaLaite;
  if (tila.korvattu || tila.luovutettu || varattu) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
        {otsikko}
        {valikkoNakyma}
        <HaltijaNakyma
          tyyppi={tila.korvattu ? 'korvattu' : tila.luovutettu ? 'luovutettu' : 'varattu'}
          haltija={haltijanTila}
          korvattu={tila.korvattu}
          lahettamatta={lahettamatta}
          laitteenNimi={laitteenNimi(laite)}
          onOta={otaRata}
          onPaivita={() => setLatausKierros((n) => n + 1)}
          onVaihda={vaihdaRata}
          onLataaLoki={lataaLoki}
        />
      </main>
    );
  }

  if (siirto && tila.haltija) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
        {otsikko}
        <SiirtoNakyma
          linkki={siirtoOsoite()}
          lahettamatta={lahettamatta}
          onValmis={() => {
            setSiirto(false);
            // Avain on nyt uudella laitteella; tämä saa radan takaisin vain otolla (sama laite tai PIN).
            setTila((t) => ({ ...t, haltija: null, luovutettu: true }));
          }}
          onPeru={() => setSiirto(false)}
        />
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
      {lukittu && <Lukitus onAvaa={() => setLukittu(false)} />}
      {!tallennus.ok && (
        <div className="shrink-0 bg-red-700 px-3 py-2 text-sm font-semibold text-white">
          Merkintöjä ei saada tallennettua laitteelle (selaimen tallennustila täynnä tai estetty). Ne lähtevät taulukkoon,
          kun yhteys toimii, mutta sivun sulkeminen hävittää lähettämättömät. Käytä tarvittaessa paperikorttia.
        </div>
      )}
      {tila.taydennysIlmoitus > 0 && (
        <div className="flex shrink-0 items-center gap-2 bg-amber-100 px-3 py-2 text-sm text-amber-900">
          <span className="min-w-0 flex-1">
            Edellisen laitteen merkinnät täydensivät {tila.taydennysIlmoitus} {tila.taydennysIlmoitus === 1 ? 'kortin' : 'korttia'} (vain
            tyhjät kiekot). Tarkista vuorossa oleva ampuja.
          </span>
          <button type="button" className="rounded border border-amber-700 px-2 py-1" onClick={() => setTila((t) => ({ ...t, taydennysIlmoitus: 0 }))}>OK</button>
        </div>
      )}
      {tila.tarkistaLinja && tila.haltija && (
        <div className="flex shrink-0 items-center gap-2 bg-amber-100 px-3 py-2 text-sm text-amber-900">
          <span className="min-w-0 flex-1">
            Rata otettiin PIN-koodilla: edellisen laitteen viimeiset merkinnät voivat puuttua.
            {vuorossa && kohta ? <> Vuorossa näkyy <b>{vuorossa.nro} {nimi(vuorossa.nro)}</b>, asema {vuorossa.asema + 1}, kiekko {kohta.i + 1}.</> : ''}
            {' '}Jos linja on jo pidemmällä, kirjaa ammutut kiekot ensin (tai korjaa ☰ › Korjaa merkintöjä).
          </span>
          <button type="button" className="rounded border border-amber-700 px-2 py-1" onClick={() => setTila((t) => ({ ...t, tarkistaLinja: false }))}>
            Linja tarkistettu
          </button>
        </div>
      )}
      {akku.vahissa && (
        <div className="shrink-0 bg-red-100 px-3 py-2 text-sm text-red-900">
          Akku {akku.taso} %: kytke laturi. Jos laite ei jaksa kisan loppuun, vaihda laite ajoissa: ☰ › <b>Luovuta rata</b>.
        </div>
      )}
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

// Korvattujen laitteiden merkinnät tilan kortteihin (haltija.js otaTaydennykset); täytetyt kortit näkyvät ilmoituksena.
function taydennettyna(t, taydennykset, kohteita) {
  if (!taydennykset) return t;
  const tulos = otaTaydennykset(t.kortit, taydennykset, t.sovelletutTaydennykset || {}, kohteita || 25);
  return {
    ...t,
    kortit: tulos.kortit,
    sovelletutTaydennykset: tulos.sovelletut,
    taydennysIlmoitus: (t.taydennysIlmoitus || 0) + tulos.taytetyt
  };
}

// Korvatun laitteen näkymän tiedot: kuka rataa nyt kirjaa, montako korttia välitettiin täydennyksiksi ja montako
// kirjattiin lokiin ristiriitoina.
const korvausTieto = (haltija, kirjattu, taydennetty) => ({
  nimi: haltija?.nimi || '', otettu: haltija?.otettu || '', vapaa: Boolean(haltija?.vapaa), kirjattu: kirjattu || 0, taydennetty: taydennetty || 0
});

// Laitteelle tallennettu tila; vanhan version lisätyt (pelkät numerot) menevät jonon loppuun.
function alkutila(tallessa) {
  const t = {
    kortit: {}, historia: [], lisatyt: [], ohitetut: [], tauot: [], tauotPois: [], keskeyttaneet: [], ohjelma: null, avaus: null,
    haltija: null, siirtoAvain: null, korvattu: null, luovutettu: false, lahetettyLinja: null, tarkistaLinja: false,
    sovelletutTaydennykset: {}, taydennysIlmoitus: 0,
    ...tallessa
  };
  return { ...t, lisatyt: t.lisatyt.map((l) => (typeof l === 'number' ? { nro: l } : l)) };
}

// Otsikon lähetystila: kaikki lähetetty / N korttia lähettämättä / ei yhteyttä N min (katko alkoi ensimmäisestä
// epäonnistuneesta lähetyksestä).
function SynkMerkki({ lahettamatta, virhe, katkesi, nyt }) {
  if (lahettamatta === 0) return <span className="rounded bg-green-700 px-2 py-1 text-xs font-semibold">✓ Kaikki lähetetty</span>;
  const minuutit = katkesi ? Math.max(0, Math.floor((nyt - katkesi) / 60000)) : 0;
  const syy = virhe === 'Ei yhteyttä' ? `ei yhteyttä${minuutit > 0 ? ` ${minuutit} min` : ''}` : virhe;
  return (
    <span className={`rounded px-2 py-1 text-right text-xs leading-tight font-semibold ${virhe ? 'bg-red-700' : 'bg-amber-600'}`} title={virhe}>
      {lahettamatta} {lahettamatta === 1 ? 'kortti' : 'korttia'} lähettämättä{syy ? <><br className="sm:hidden" /><span className="hidden sm:inline"> · </span>{syy}</> : ''}
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

function Valikko({
  ohjelma, onMuokkaaOhjelmaa, onHaeNumero, onVaihdaRata, onKorjaa, aanet, onAanet, nollaAani, onNollaAani, onTyhjenna,
  hereilla, lataus, viimeksi, tallennus, asennus, onKopioiKoodi, onLataaLoki, laitteenNimi: nimi, onLuovuta, onSiirra
}) {
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
        {' '}Merkinnät tallentuvat laitteelle ja toimivat ilman verkkoa{tallennus.pysyva ? '' : ' (selain voi poistaa ne, jos levytila loppuu)'}.
      </p>
      <Asennus asennus={asennus} onKopioiKoodi={onKopioiKoodi} />
      <div className="flex flex-col gap-2 rounded border border-slate-300 p-2">
        <span><b>Laitteen vaihto</b> · tämä laite: {nimi}</span>
        {onLuovuta ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={onLuovuta}>Luovuta rata</button>
            <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={onSiirra}>Siirrä QR-koodilla</button>
          </div>
        ) : <span className="text-slate-600">Rata otetaan tälle laitteelle, kun yhteys toimii.</span>}
        <span className="text-slate-600">
          Luovuta: kaikki lähetetään ja seuraava laite skannaa radan QR-koodin. Siirrä QR-koodilla: kun tällä laitteella ei
          ole verkkoa, uusi laite skannaa tämän näytön koodin (lähettämättömät kortit siirtyvät sen mukana).
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={onVaihdaRata}>Vaihda ratakoodi</button>
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={onLataaLoki}>Lataa merkintäloki</button>
      </div>
      {onTyhjenna && (
        <button type="button" className="self-start rounded border border-red-700 px-3 py-2 text-red-800" onClick={onTyhjenna}>
          Tyhjennä rata laitteelta (testiversio)
        </button>
      )}
    </div>
  );
}

// Asennus aloitusnäytölle: ei osoiteriviä eikä välilehtiä, joten kirjaus ei sulkeudu vahingossa.
function Asennus({ asennus, onKopioiKoodi }) {
  if (asennus.asennettu) return <p className="text-slate-600">Käytössä asennettuna sovelluksena.</p>;
  return (
    <div className="flex flex-col gap-2 rounded border border-slate-300 p-2">
      <div className="flex items-center justify-between gap-2">
        <span><b>Asenna sovellukseksi</b>: aukeaa koko näytölle ilman osoiteriviä.</span>
        {asennus.asenna && <button type="button" className="shrink-0 rounded bg-blue-800 px-3 py-2 text-white" onClick={asennus.asenna}>Asenna</button>}
      </div>
      {!asennus.asenna && (onIos() ? (
        <>
          <p className="text-slate-600">
            Safarissa: Jaa ⎙ → Lisää Koti-valikkoon. Asennettu sovellus ei näe Safarin tietoja, joten kopioi ratakoodi
            ensin ja liitä se sovellukseen. Lähettämättömät kortit lähtevät Safarista, kun avaat sen uudelleen.
          </p>
          <button type="button" className="self-start rounded border border-slate-400 px-3 py-2" onClick={onKopioiKoodi}>Kopioi ratakoodi</button>
        </>
      ) : (
        <p className="text-slate-600">Selaimen valikosta: Asenna sovellus tai Lisää aloitusnäytölle.</p>
      ))}
    </div>
  );
}
