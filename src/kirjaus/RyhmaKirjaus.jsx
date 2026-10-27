// Ryhmäpuhelin (Sporting / FITASC / ESP): ryhmän kirjaaja merkitsee ryhmän ampujien kiekot asema kerrallaan omalla
// puhelimellaan, ja kun layout on ammuttu, jokainen ampuja hyväksyy korttinsa (kuten paperikortin allekirjoitus).
// Ryhmäkoodi tulee ryhmän kortin QR-koodista. Merkinnät tallennetaan heti laitteelle ja lähetetään taulukon
// MOBIILI Layout N -välilehdille taustalla (api/kirjaus.js), samoin kuin Compak-radan laitteessa.
// Ryhmää kirjaa yksi puhelin kerrallaan; toinen puhelin ottaa ryhmän vahvistuksella (esim. akku loppui), jolloin
// edellisen puhelimen lähettämättömät merkinnät täydentävät uuden puhelimen tyhjiä kiekkoja.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aloitusAsema, aloitusLayout, asemaJarjestys, asemanSiirto, hyvaksy, kierrata, kohdanOsa, pisteet, pisteKiekolle, seuraavaAsema, korttiAvain, kuittaa, lahettamattomat,
  layoutHyvaksytty, layoutJarjestys, layoutinTila, merkitOf, merkitse, osumat, otaTaydennykset, peru, seuraavaAmpuja, seuraavaKohta, sovitaPituudet, taytetyt,
  yhdistaPalvelimelta
} from './ryhma.js';
import { lueKoodi as lueKoodinSisalto } from './kortit.js';
import {
  kirjaaMerkinta, laitteenTunnus, lueMerkinnat, lueRata, lueRataTietokannasta, pyydaPysyvaTallennus, siivoaMerkinnat,
  tallennaRata, tallennaRataTietokantaan
} from './varasto.js';
import { laitteenNimi } from './haltija.js';
import { useHereilla } from './useHereilla.js';
import { useAkku } from './useAkku.js';
import { pyydaTaustalahetys, useAsennus, useTakaisinVahti } from './sovellus.js';
import Lukitus from './Lukitus.jsx';
import { soita } from './aanet.js';
import { Asennus, SynkMerkki } from './Yhteiset.jsx';

const SYNKRONOINTI_VALI_MS = 15000;
const TARKISTUS_VALI_MS = 60000;
// Valmis asema lähetetään heti; kesken olevat merkinnät kootaan (kirjuritilin kiintiö 60 kirjoitusta minuutissa).
const LAHETYS_VIIVE_MS = 1500;
const KESKEN_VIIVE_MS = 10000;
const NAPAUTUSVALI_MS = 150;
const KUITTAUS_MS = 6000;
const KELLO_MS = 30000;

const alkutila = (tallessa) => ({
  kortit: {}, historia: [], keskeyttaneet: [], avaus: null, haltija: null, korvattu: null, luovutettu: false,
  layout: null, asema: null, valittu: null, aanet: true, sovelletutTaydennykset: {}, taydennysIlmoitus: 0, hylattyIlmoitus: 0,
  ...tallessa
});

export default function RyhmaNakyma({ koodi, onVaihda }) {
  const info = useMemo(() => lueKoodinSisalto(koodi), [koodi]);
  // Tallennuksen avain: ryhmät erotetaan radoista r-etuliitteellä (varasto.js, palvelutyöntekijä).
  const tunnus = `r${info.ryhma}`;
  const laite = useMemo(() => laitteenTunnus(), []);
  const hereilla = useHereilla();
  const akku = useAkku();
  const asennus = useAsennus();

  const [tila, setTila] = useState(() => alkutila(lueRata(info.sheetId, tunnus)));
  const [lataus, setLataus] = useState({ tila: 'ladataan', viesti: '', pysyva: false });
  const [synk, setSynk] = useState({ virhe: '', viimeksi: null, katkesi: null });
  const [latausKierros, setLatausKierros] = useState(0);
  const [kopioLuettu, setKopioLuettu] = useState(false);
  const [tallennus, setTallennus] = useState({ ok: true, pysyva: false });
  const [valikko, setValikko] = useState(false);
  const [lukittu, setLukittu] = useState(false);
  const [korjaustila, setKorjaustila] = useState(false);
  const [kuittaus, setKuittaus] = useState(null);
  const [toinenLaite, setToinenLaite] = useState(null);

  const tilaRef = useRef(tila);
  const lahettaaRef = useRef(false);
  const otetaanRef = useRef(false);
  const taustaRef = useRef(false);
  const tarkistettuRef = useRef(Date.now());
  const viimeNapautusRef = useRef(0);
  const jarjestysRef = useRef(tila.jarjestys || 0);
  const alkuJarjestys = useRef(tila.jarjestys || 0);

  // IndexedDB-kopio voittaa, jos se on uudempi kuin localStorage (sama kuin radan laitteessa).
  useEffect(() => {
    let peruttu = false;
    lueRataTietokannasta(info.sheetId, tunnus).then((kopio) => {
      if (peruttu) return;
      if (kopio && (kopio.jarjestys || 0) > alkuJarjestys.current) {
        jarjestysRef.current = Math.max(jarjestysRef.current, kopio.jarjestys);
        setTila(alkutila(kopio));
      }
      setKopioLuettu(true);
    });
    siivoaMerkinnat();
    pyydaPysyvaTallennus().then((pysyva) => {
      if (!peruttu) setTallennus((t) => ({ ...t, pysyva }));
    });
    return () => { peruttu = true; };
  }, [info, tunnus]);

  useEffect(() => {
    tilaRef.current = tila;
    jarjestysRef.current += 1;
    const tallennettava = { ...tila, jarjestys: jarjestysRef.current };
    const paikallinen = tallennaRata(info.sheetId, tunnus, tallennettava);
    if (!kopioLuettu) {
      if (!paikallinen) setTallennus((t) => (t.ok ? { ...t, ok: false } : t));
      return;
    }
    tallennaRataTietokantaan(info.sheetId, tunnus, { tila: tallennettava, koodi, laite, nimet: {} }).then((kopio) => {
      const ok = paikallinen || kopio;
      setTallennus((t) => (t.ok === ok ? t : { ...t, ok }));
    });
  }, [tila, info, tunnus, koodi, laite, kopioLuettu]);

  // Korvattujen puhelinten merkinnät omiin tyhjiin kiekkoihin.
  const taydennettyna = (t, taydennykset, layoutit) => {
    if (!taydennykset || !layoutit) return t;
    const tulos = otaTaydennykset(t.kortit, taydennykset, layoutit, t.sovelletutTaydennykset || {});
    return { ...t, kortit: tulos.kortit, sovelletutTaydennykset: tulos.sovelletut, taydennysIlmoitus: (t.taydennysIlmoitus || 0) + tulos.taytetyt };
  };

  // Ryhmän tiedot ja taulukon kortit; ilman yhteyttä jatketaan laitteelle tallennetuilla.
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
        const korvattu = Boolean(tilaRef.current.haltija) && !data.haltija?.oma && !data.haltija?.tamaLaite;
        setTila((t) => {
          const kortit = sovitaPituudet(yhdistaPalvelimelta(t.kortit, data.kortit, { kaikki: true }), data.layoutit || [], t.avaus?.layoutit || []);
          return {
            ...taydennettyna({ ...t, avaus: data, kortit }, data.haltija?.oma ? data.taydennykset : null, data.layoutit),
            ...(korvattu && lahettamattomat(t.kortit).length === 0 ? { haltija: null, korvattu: korvausTieto(data.haltija, 0) } : {})
          };
        });
        setLataus({ tila: 'ok', viesti: '', pysyva: false });
      })
      .catch(() => {
        if (!peruttu) setLataus({ tila: 'virhe', viesti: 'Ei yhteyttä', pysyva: false });
      });
    return () => { peruttu = true; };
  }, [koodi, laite, latausKierros, kopioLuettu]);

  // Ottaa ryhmän tälle puhelimelle: vapaa suoraan, varattu vahvistuksella (vahvista: true).
  const otaRyhma = useCallback(async ({ vahvista = false } = {}) => {
    if (otetaanRef.current) return { virhe: 'Odota hetki' };
    otetaanRef.current = true;
    try {
      const res = await fetch('/api/kirjaus?toiminto=ota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, nimi: laitteenNimi(laite), ...(vahvista ? { vahvista: true } : {}) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.haltija) setTila((t) => ({ ...t, avaus: t.avaus ? { ...t.avaus, haltija: data.haltija } : t.avaus }));
        return { virhe: data.error || `Virhe ${res.status}` };
      }
      setTila((t) => ({ ...t, haltija: data.haltija, korvattu: null, luovutettu: false, avaus: t.avaus ? { ...t.avaus, haltija: data.tila } : t.avaus }));
      setLatausKierros((n) => n + 1);
      return { ok: true };
    } catch {
      return { virhe: 'Ei yhteyttä' };
    } finally {
      otetaanRef.current = false;
    }
  }, [koodi, laite]);

  const laheta = useCallback(async () => {
    if (lahettaaRef.current) return;
    if (document.visibilityState === 'hidden' && taustaRef.current) return;
    const { avaus: avattu, haltija, korvattu, luovutettu } = tilaRef.current;
    if (korvattu || luovutettu || !avattu) return;
    const lahetetyt = lahettamattomat(tilaRef.current.kortit, 60, avattu.layoutit);
    if (lahetetyt.length === 0 && (!haltija || Date.now() - tarkistettuRef.current < TARKISTUS_VALI_MS)) return;
    if (!haltija) {
      if (avattu.haltija?.vapaa) await otaRyhma();
      return;
    }
    lahettaaRef.current = true;
    try {
      const res = await fetch('/api/kirjaus?toiminto=tallenna', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, haltija, kortit: lahetetyt })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.korvattu) {
        setTila((t) => ({
          ...t, haltija: null, korvattu: korvausTieto(data.haltija, data.kirjattu, data.taydennetty),
          avaus: t.avaus ? { ...t.avaus, haltija: data.haltija || t.avaus.haltija } : t.avaus
        }));
        setSynk({ virhe: '', viimeksi: null, katkesi: null });
        return;
      }
      if (!res.ok) throw new Error(data.error || `Virhe ${res.status}`);
      tarkistettuRef.current = Date.now();
      const hylatyt = (data.hylatyt || []).filter((h) => h.syy === 'ryhma' || h.syy === 'layout').length;
      setTila((t) => ({
        ...taydennettyna({ ...t, kortit: kuittaa(t.kortit, lahetetyt, data) }, data.taydennykset, t.avaus?.layoutit),
        hylattyIlmoitus: (t.hylattyIlmoitus || 0) + hylatyt
      }));
      // Layoutin asemajako muuttui taulukossa: ryhmän tiedot haetaan uudelleen ja kortit sovitetaan.
      if ((data.hylatyt || []).some((h) => h.syy === 'kohteet')) setLatausKierros((n) => n + 1);
      setSynk({ virhe: '', viimeksi: Date.now(), katkesi: null });
      taustaRef.current = false;
      const muu = (data.uudemmat || []).find((k) => k.muuLaite);
      if (muu) setToinenLaite({ aika: muu.aika, nro: muu.nro });
    } catch (error) {
      const verkko = error instanceof TypeError;
      setSynk((s) => ({ ...s, virhe: verkko ? 'Ei yhteyttä' : error.message, katkesi: s.katkesi || Date.now() }));
      if (verkko) pyydaTaustalahetys().then((pyydetty) => { if (pyydetty) taustaRef.current = true; });
    } finally {
      lahettaaRef.current = false;
    }
  }, [koodi, laite, otaRyhma]);

  const avaus = tila.avaus;
  const ampujat = useMemo(() => avaus?.ampujat || [], [avaus]);
  const jarjestys = useMemo(() => layoutJarjestys(avaus?.layoutit), [avaus]);
  const layout = jarjestys.find((l) => l.nro === tila.layout) || aloitusLayout(jarjestys, ampujat, tila.kortit, tila.keskeyttaneet);
  // Puhelimen asemat: taulukon asemat, FITASCissa ohjelman pisteet (ryhma.js pisteet).
  const asemat = useMemo(() => (layout ? pisteet(layout) : []), [layout]);
  const asema = layout ? Math.min(tila.asema ?? aloitusAsema(layout, ampujat, tila.kortit, tila.keskeyttaneet), asemat.length - 1) : 0;
  // Aseman ampumajärjestys: aloittaja siirtyy yhdellä per layoutin kierros (kuten paperikortissa) ja per asema
  // lähtöasemalta lukien. FITASCin tuplissa järjestys siirtyy vielä yhdellä (seuraavaKohta).
  const siirto = layout ? asemanSiirto(layout, asema) : 0;
  const vuoro = useMemo(() => kierrata(ampujat, siirto), [ampujat, siirto]);
  const kohta = layout ? seuraavaKohta(layout, asema, vuoro, tila.kortit, tila.valittu, tila.keskeyttaneet) : null;
  const nimi = useCallback((nro) => ampujat.find((a) => a.nro === nro)?.nimi || '', [ampujat]);

  const odottavat = useMemo(() => lahettamattomat(tila.kortit, Infinity), [tila.kortit]);
  const lahettamatta = odottavat.length;
  const asemaValmis = layout ? !kohta : false;

  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const ajastin = setTimeout(laheta, asemaValmis ? LAHETYS_VIIVE_MS : KESKEN_VIIVE_MS);
    return () => clearTimeout(ajastin);
  }, [tila.kortit, lahettamatta, asemaValmis, laheta]);

  const avattuHaltija = avaus?.haltija;
  const otaHeti = Boolean(avattuHaltija && !tila.korvattu && !tila.luovutettu
    && ((!tila.haltija && avattuHaltija.vapaa) || (avattuHaltija.tamaLaite && !avattuHaltija.oma)));
  useEffect(() => {
    if (otaHeti) otaRyhma();
  }, [otaHeti, latausKierros, otaRyhma]);

  const korvattuAvauksessa = Boolean(tila.haltija && avattuHaltija && !avattuHaltija.oma && !avattuHaltija.tamaLaite);
  useEffect(() => {
    if (korvattuAvauksessa) laheta();
  }, [korvattuAvauksessa, laheta]);

  useEffect(() => {
    const vali = setInterval(laheta, SYNKRONOINTI_VALI_MS);
    window.addEventListener('online', laheta);
    document.addEventListener('visibilitychange', laheta);
    return () => {
      clearInterval(vali);
      window.removeEventListener('online', laheta);
      document.removeEventListener('visibilitychange', laheta);
    };
  }, [laheta]);

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

  const [nyt, setNyt] = useState(() => Date.now());
  useEffect(() => {
    if (!synk.katkesi) return undefined;
    const vali = setInterval(() => setNyt(Date.now()), KELLO_MS);
    return () => clearInterval(vali);
  }, [synk.katkesi]);

  useEffect(() => {
    if (!kuittaus) return undefined;
    const ajastin = setTimeout(() => setKuittaus(null), KUITTAUS_MS);
    return () => clearTimeout(ajastin);
  }, [kuittaus]);

  useTakaisinVahti(() => {
    if (lukittu) return true;
    if (valikko) {
      setValikko(false);
      return true;
    }
    const varoitus = lahettamatta > 0 ? ` ${lahettamatta} korttia on vielä lähettämättä; ne lähtevät, kun avaat kirjauksen uudelleen.` : '';
    return !window.confirm(`Poistutaanko kirjauksesta? Merkinnät ovat tallessa puhelimessa.${varoitus}`);
  });

  useEffect(() => {
    if (lahettamatta === 0) return undefined;
    const kysy = (e) => {
      if (window.kirjausPoistuu) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', kysy);
    return () => window.removeEventListener('beforeunload', kysy);
  }, [lahettamatta]);

  const liianPian = () => {
    const aika = Date.now();
    if (aika - viimeNapautusRef.current < NAPAUTUSVALI_MS) return true;
    viimeNapautusRef.current = aika;
    return false;
  };
  const kiekkoTeksti = (l, nro, i) => {
    const p = pisteet(l)[pisteKiekolle(l, i)];
    return `${nro} ${nimi(nro)}, asema ${p?.id ?? ''}, kiekko ${i - (p?.alku ?? 0) + 1}`;
  };
  const kirjaa = (tapa, l, nro, i, ennen, jalkeen) => {
    kirjaaMerkinta(info.sheetId, tunnus, { laite, tapa, layout: l.nro, nro, kiekko: i + 1, ennen, jalkeen });
  };

  const merkitseKohta = (merkki) => {
    if (!layout || !kohta || korjaustila || liianPian()) return;
    kirjaa('merkintä', layout, kohta.nro, kohta.i, merkitOf(tila.kortit, layout, kohta.nro)[kohta.i], merkki);
    setTila((t) => {
      const uusi = merkitse(t, layout, kohta, merkki);
      // Ampujan osuus asemalla (FITASC: sinkut tai tuplat) valmis: valinta pois, jotta seuraava tyhjä ampuja tulee vuoroon.
      const v = kohdanOsa(layout, asema, kohta.i);
      const valmis = !merkitOf(uusi.kortit, layout, kohta.nro).slice(v.alku, v.loppu).includes('-');
      return { ...t, ...uusi, valittu: valmis ? null : kohta.nro };
    });
    setKuittaus(null);
    if (tila.aanet !== false) soita(merkki === 'X' ? 'osuma' : 'nolla');
    navigator.vibrate?.(merkki === 'O' ? [40, 60, 40] : 30);
  };

  const peruViimeisin = () => {
    if (!avaus || liianPian()) return;
    const p = peru(tila, avaus.layoutit);
    if (!p) return;
    const l = avaus.layoutit.find((x) => x.nro === p.kohta.layout);
    kirjaa('peru', l, p.kohta.nro, p.kohta.i, merkitOf(tila.kortit, l, p.kohta.nro)[p.kohta.i], p.kohta.ennen);
    setTila((t) => {
      const tuore = peru(t, avaus.layoutit);
      if (!tuore) return t;
      const tl = avaus.layoutit.find((x) => x.nro === tuore.kohta.layout);
      return {
        ...t, kortit: tuore.kortit, historia: tuore.historia, layout: tuore.kohta.layout,
        asema: tl ? pisteKiekolle(tl, tuore.kohta.i) : t.asema, valittu: tuore.kohta.nro
      };
    });
    setKuittaus(`Peruttu: ${kiekkoTeksti(l, p.kohta.nro, p.kohta.i)}.`);
    if (tila.aanet !== false) soita('peru');
  };

  // Korjaustilassa merkitty kiekko vaihtuu osumasta nollaksi tai päinvastoin (hyväksyntä poistuu).
  const korjaa = (nro, i) => {
    if (!layout || liianPian()) return;
    const vanha = merkitOf(tila.kortit, layout, nro)[i];
    if (vanha === '-') return;
    const uusi = vanha === 'X' ? 'O' : 'X';
    kirjaa('korjaus', layout, nro, i, vanha, uusi);
    setTila((t) => ({ ...t, ...merkitse(t, layout, { nro, i }, uusi) }));
    setKuittaus(`Korjattu: ${kiekkoTeksti(layout, nro, i)} → ${uusi === 'X' ? 'OSUMA' : 'NOLLA'}.`);
    if (tila.aanet !== false) soita('korjaus');
  };

  const hyvaksyAmpuja = (nro) => {
    if (!layout) return;
    const merkit = merkitOf(tila.kortit, layout, nro);
    if (!window.confirm(`${nro} ${nimi(nro)}: ${layout.nimi} ${osumat(merkit)}/${layout.kohteita}. Hyväksytkö tuloksesi?`)) return;
    setTila((t) => ({ ...t, kortit: hyvaksy(t.kortit, layout, nro) }));
    if (tila.aanet !== false) soita('osuma');
  };

  const vaihdaKeskeytys = (nro) => {
    const keskeytetty = tila.keskeyttaneet.includes(nro);
    if (!keskeytetty && !window.confirm(`Keskeyttääkö ${nro} ${nimi(nro)}? Hänet ohitetaan kirjauksessa.`)) return;
    setTila((t) => ({ ...t, keskeyttaneet: keskeytetty ? t.keskeyttaneet.filter((n) => n !== nro) : [...t.keskeyttaneet, nro], valittu: null }));
  };

  const valitseLayout = (nro) => {
    const l = jarjestys.find((x) => x.nro === nro);
    setTila((t) => ({ ...t, layout: nro, asema: l ? aloitusAsema(l, ampujat, t.kortit, t.keskeyttaneet) : 0, valittu: null }));
    setValikko(false);
  };
  const valitseAsema = (a) => setTila((t) => ({ ...t, layout: layout?.nro ?? null, asema: a, valittu: null }));
  const valitseAmpuja = (nro) => setTila((t) => ({ ...t, layout: layout?.nro ?? null, asema, valittu: nro }));
  const seuraava = () => {
    if (!layout || !kohta) return;
    const nro = seuraavaAmpuja(layout, asema, vuoro, tila.kortit, kohta.nro, tila.keskeyttaneet);
    if (nro !== null) valitseAmpuja(nro);
  };

  const lataaLoki = async () => {
    const rivit = await lueMerkinnat(info.sheetId, tunnus);
    const tiedosto = new Blob([JSON.stringify({ kisa: avaus?.kisa, ryhma: info.ryhma, laite, merkinnat: rivit.map((r) => ({
      ...r, aika: new Date(r.aika).toISOString()
    })) }, null, 1)], { type: 'application/json' });
    const linkki = document.createElement('a');
    linkki.href = URL.createObjectURL(tiedosto);
    linkki.download = `kirjaus-ryhma${info.ryhma}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
    linkki.click();
    setTimeout(() => URL.revokeObjectURL(linkki.href), 10000);
  };

  const kopioiKoodi = async () => {
    const ohje = 'Ryhmäkoodi kopioitu. Liitä se asennetun sovelluksen aloitusnäkymään.';
    try {
      await navigator.clipboard.writeText(koodi);
      window.alert(ohje);
    } catch {
      window.prompt(ohje, koodi);
    }
  };

  const vaihdaKoodi = () => {
    if (lahettamatta > 0 && !window.confirm(`${lahettamatta} korttia on lähettämättä. Ne jäävät puhelimeen ja lähtevät, kun avaat ryhmän uudelleen. Vaihdetaanko koodi?`)) return;
    onVaihda();
  };

  // Luovutus verkossa: kaikki lähetetään, sitten ryhmä vapautetaan toiselle puhelimelle.
  const luovuta = async () => {
    setValikko(false);
    if (!window.confirm('Luovutetaanko ryhmän kirjaus toiselle puhelimelle? Tämä puhelin lopettaa kirjauksen. Toinen puhelin skannaa ryhmän QR-koodin ja jatkaa tästä.')) return;
    for (let kierros = 0; kierros < 20; kierros++) {
      if (!lahettaaRef.current) await laheta();
      await new Promise((r) => { setTimeout(r, 250); });
      if (!lahettaaRef.current && lahettamattomat(tilaRef.current.kortit).length === 0) break;
    }
    if (lahettamattomat(tilaRef.current.kortit).length > 0) {
      window.alert('Kaikkia kortteja ei saatu lähetettyä. Yritä uudelleen, kun yhteys toimii.');
      return;
    }
    try {
      const res = await fetch('/api/kirjaus?toiminto=vapauta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${koodi}` },
        body: JSON.stringify({ laite, haltija: tilaRef.current.haltija })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setTila((t) => ({ ...t, haltija: null, korvattu: korvausTieto(data.haltija, 0) }));
        return;
      }
      if (!res.ok) throw new Error(data.error || `Virhe ${res.status}`);
      setTila((t) => ({ ...t, haltija: null, luovutettu: true }));
    } catch (error) {
      window.alert(`Ryhmää ei saatu luovutettua (${error instanceof TypeError ? 'ei yhteyttä' : error.message}).`);
    }
  };

  if (!avaus) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-white p-6 text-slate-900">
        {lataus.tila === 'ladataan' && <p className="text-lg">Ladataan ryhmää…</p>}
        {lataus.tila === 'virhe' && (
          <>
            <p className="text-lg font-semibold text-red-700">{lataus.viesti}</p>
            {!lataus.pysyva && (
              <button type="button" className="rounded bg-blue-800 px-4 py-3 text-white" onClick={() => setLatausKierros((n) => n + 1)}>Yritä uudelleen</button>
            )}
            <button type="button" className="rounded border border-slate-400 px-4 py-3" onClick={onVaihda}>Vaihda koodi</button>
          </>
        )}
      </main>
    );
  }

  const otsikko = (
    <header className="flex shrink-0 items-center gap-2 bg-[#1e3a5f] px-3 py-1 text-white sm:py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold sm:text-lg">Ryhmä {avaus.ryhma}</div>
        <div className="truncate text-xs opacity-80">{layout ? `${layout.nimi} · ` : ''}{avaus.kisa}</div>
      </div>
      <SynkMerkki lahettamatta={lahettamatta} virhe={synk.virhe} katkesi={synk.katkesi} nyt={nyt} />
      <button type="button" aria-label="Lukitse näyttö" className="rounded px-2 py-1 text-xl" onClick={() => { setValikko(false); setLukittu(true); }}>🔒</button>
      <button type="button" aria-label="Valikko" className="rounded px-3 py-1 text-xl" onClick={() => setValikko((v) => !v)}>☰</button>
    </header>
  );

  const valikkoNakyma = valikko && (
    <div className="flex flex-col gap-3 border-b border-slate-300 bg-white p-3 text-sm">
      <div className="flex flex-col gap-1">
        <b>Layout</b>
        {jarjestys.map((l) => {
          const t = layoutinTila(l, ampujat, tila.kortit, tila.keskeyttaneet);
          return (
            <button key={l.nro} type="button" className={`flex justify-between rounded border px-3 py-2 text-left ${l.nro === layout?.nro ? 'border-blue-800 bg-blue-50' : 'border-slate-300'}`} onClick={() => valitseLayout(l.nro)}>
              <span>{l.nimi}{l.aika ? ` · ${l.aika}` : ''}{l.paiva && jarjestys.some((x) => x.paiva && x.paiva !== l.paiva) ? ` (${l.paiva})` : ''}</span>
              <span className="text-slate-600">{layoutHyvaksytty(l, ampujat, tila.kortit, tila.keskeyttaneet) ? 'hyväksytty ✓' : `${t.valmiit}/${t.ampujia} valmis`}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="rounded border border-amber-600 bg-amber-50 px-3 py-2 text-left" onClick={() => { setKorjaustila(true); setValikko(false); }}>
        <b>Korjaa merkintöjä</b> · muuta kiekko osumaksi tai nollaksi tai merkitse keskeytys
      </button>
      <div className="flex items-center justify-between gap-2">
        <span>Äänet: <b>{tila.aanet !== false ? 'päällä' : 'pois'}</b></span>
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={() => setTila((t) => ({ ...t, aanet: t.aanet === false }))}>{tila.aanet !== false ? 'Pois' : 'Päälle'}</button>
      </div>
      <p className="text-slate-600">
        {hereilla ? 'Näyttö pysyy päällä.' : 'Näytön päälläpito ei ole käytössä tällä selaimella.'}
        {lataus.tila === 'virhe' ? ` Ryhmän tietoja ei saatu päivitettyä (${lataus.viesti}).` : ''}
        {synk.viimeksi ? ` Viimeksi lähetetty klo ${new Date(synk.viimeksi).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}.` : ''}
        {' '}Merkinnät tallentuvat puhelimeen ja toimivat ilman verkkoa{tallennus.pysyva ? '' : ' (selain voi poistaa ne, jos levytila loppuu)'}.
      </p>
      <Asennus asennus={asennus} onKopioiKoodi={kopioiKoodi} koodiTeksti="Kopioi ryhmäkoodi" />
      <div className="flex flex-col gap-2 rounded border border-slate-300 p-2">
        <span><b>Puhelimen vaihto</b> · tämä puhelin: {laitteenNimi(laite)}</span>
        {tila.haltija
          ? <button type="button" className="self-start rounded border border-slate-400 px-3 py-2" onClick={luovuta}>Luovuta ryhmä</button>
          : <span className="text-slate-600">Ryhmä otetaan tälle puhelimelle, kun yhteys toimii.</span>}
        <span className="text-slate-600">Toinen puhelin voi myös ottaa ryhmän skannaamalla ryhmän QR-koodin (esim. jos akku loppuu).</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={vaihdaKoodi}>Vaihda koodi</button>
        <button type="button" className="rounded border border-slate-400 px-3 py-2" onClick={lataaLoki}>Lataa merkintäloki</button>
      </div>
    </div>
  );

  // Ryhmä ei ole tällä puhelimella: korvattu, luovutettu tai toisen puhelimen käytössä.
  const varattu = !tila.haltija && avattuHaltija && !avattuHaltija.oma && !avattuHaltija.vapaa && !avattuHaltija.tamaLaite;
  if (tila.korvattu || tila.luovutettu || varattu) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
        {otsikko}
        {valikkoNakyma}
        <RyhmanHaltija
          tyyppi={tila.korvattu ? 'korvattu' : tila.luovutettu ? 'luovutettu' : 'varattu'}
          haltija={avattuHaltija}
          korvattu={tila.korvattu}
          lahettamatta={lahettamatta}
          onOta={() => otaRyhma({ vahvista: true })}
          onPaivita={() => setLatausKierros((n) => n + 1)}
        />
      </main>
    );
  }

  if (!layout) {
    return (
      <main className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
        {otsikko}
        {valikkoNakyma}
        <p className="m-4 rounded bg-white p-4">Kisan asetuksista ei löytynyt layouteja.</p>
      </main>
    );
  }

  const { alku, loppu } = asemat[asema];
  const seuraavaKesken = seuraavaAsema(layout, asema, ampujat.filter((a) => !tila.keskeyttaneet.includes(a.nro)), tila.kortit);
  const osa = kohta && asemat[asema].osat.length > 1 ? kohdanOsa(layout, asema, kohta.i) : null;
  const layoutValmis = ampujat.every((a) => tila.keskeyttaneet.includes(a.nro) || taytetyt(merkitOf(tila.kortit, layout, a.nro)) === layout.kohteita);
  const viimeHistoria = tila.historia[tila.historia.length - 1];

  return (
    <main className="flex h-screen supports-[height:100dvh]:h-[100dvh] flex-col overflow-hidden bg-slate-100 text-slate-900 select-none">
      {otsikko}
      {lukittu && <Lukitus onAvaa={() => setLukittu(false)} />}
      {!tallennus.ok && (
        <div className="shrink-0 bg-red-700 px-3 py-2 text-sm font-semibold text-white">
          Merkintöjä ei saada tallennettua puhelimeen. Ne lähtevät taulukkoon, kun yhteys toimii, mutta sivun sulkeminen hävittää
          lähettämättömät. Käytä tarvittaessa paperikorttia.
        </div>
      )}
      {tila.taydennysIlmoitus > 0 && (
        <Ilmoitus onOk={() => setTila((t) => ({ ...t, taydennysIlmoitus: 0 }))}>
          Edellisen puhelimen merkinnät täydensivät {tila.taydennysIlmoitus} {tila.taydennysIlmoitus === 1 ? 'kortin' : 'korttia'} (vain tyhjät kiekot). Tarkista kortit.
        </Ilmoitus>
      )}
      {tila.hylattyIlmoitus > 0 && (
        <Ilmoitus onOk={() => setTila((t) => ({ ...t, hylattyIlmoitus: 0 }))}>
          {tila.hylattyIlmoitus} korttia ei tallennettu: ampuja ei ole enää tässä ryhmässä tai layout on poistettu kisan asetuksista. Merkinnät ovat kilpailutoimiston lokissa.
        </Ilmoitus>
      )}
      {toinenLaite && (
        <Ilmoitus onOk={() => setToinenLaite(null)}>
          Toinen puhelin kirjaa tätä ryhmää{toinenLaite.aika ? ` (${toinenLaite.aika})` : ''}: ampujan {toinenLaite.nro} kortti korvattiin sen tuloksilla.
        </Ilmoitus>
      )}
      {akku.vahissa && (
        <div className="shrink-0 bg-red-100 px-3 py-2 text-sm text-red-900">
          Akku {akku.taso} %: kytke laturi tai siirrä kirjaus toiselle puhelimelle (☰ › <b>Luovuta ryhmä</b>).
        </div>
      )}
      <div className="max-h-[60dvh] shrink-0 overflow-y-auto">{valikkoNakyma}</div>

      {/* Asemat: valmiit vihreällä, valittu sinisellä. */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto px-2 pt-2">
        {asemaJarjestys(layout).map((k) => {
          const a = asemat[k];
          const valmis = ampujat.every((amp) => tila.keskeyttaneet.includes(amp.nro) || !merkitOf(tila.kortit, layout, amp.nro).slice(a.alku, a.loppu).includes('-'));
          return (
            <button key={k} type="button" onClick={() => valitseAsema(k)}
              className={`min-w-11 shrink-0 rounded-lg border-2 px-2 py-1 text-center ${k === asema ? 'border-blue-700 bg-blue-50' : valmis ? 'border-transparent bg-green-100' : 'border-transparent bg-white'}`}>
              <div className="text-[10px] uppercase text-slate-500">Asema</div>
              <div className="font-bold leading-tight">{a.id}</div>
            </button>
          );
        })}
      </nav>
      <div className="shrink-0 px-3 pt-1 text-sm text-slate-600">Asema {asemat[asema].id} · {asemat[asema].kohteita} kiekkoa · {layout.nimi} {layout.kohteita} kiekkoa</div>

      <section className={`${korjaustila ? 'bg-amber-50' : ''} flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2 py-1.5`}>
        {ampujat.length === 0 && <p className="rounded bg-white p-4">Ryhmässä ei ole ampujia.</p>}
        {vuoro.map((a) => {
          const merkit = merkitOf(tila.kortit, layout, a.nro);
          const kortti = tila.kortit[korttiAvain(layout.nro, a.nro)];
          const keskeytti = tila.keskeyttaneet.includes(a.nro);
          const asemalla = merkit.slice(alku, loppu);
          const aktiivinen = kohta?.nro === a.nro && !korjaustila;
          return (
            <div key={a.nro} className={`rounded-lg border-2 px-2 py-1 ${aktiivinen ? 'border-blue-700 bg-white' : 'border-transparent bg-white'} ${keskeytti ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold" onClick={() => !korjaustila && !keskeytti && valitseAmpuja(a.nro)}>
                  <span className="mr-2 inline-block min-w-8 rounded bg-slate-200 px-1 text-center">{a.nro}</span>{a.nimi}
                </button>
                {korjaustila ? (
                  <button type="button" className={`shrink-0 rounded px-2 text-xs leading-5 ${keskeytti ? 'bg-slate-700 text-white' : 'border border-slate-300 text-slate-600'}`} onClick={() => vaihdaKeskeytys(a.nro)}>
                    {keskeytti ? 'Keskeytti · peru' : 'Keskeytti'}
                  </button>
                ) : keskeytti && <span className="shrink-0 rounded bg-slate-700 px-2 text-xs leading-5 text-white">Keskeytti</span>}
                {kortti?.hyvaksytty && <span className="shrink-0 rounded bg-green-700 px-1.5 text-xs leading-5 text-white">✓</span>}
                <span className="shrink-0 text-right leading-tight">
                  <span className="text-lg font-bold">{osumat(asemalla)}</span>
                  <span className="text-xs text-slate-500"> as. · yht. {osumat(merkit)}/{taytetyt(merkit)}{kortti && kortti.lahetetty === false ? ' •' : ''}</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...asemalla].map((m, k) => {
                  const i = alku + k;
                  const vari = m === 'X' ? 'bg-green-700 text-white' : m === 'O' ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-400';
                  const luokat = `flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold ${vari} ${aktiivinen && kohta.i === i ? 'ring-2 ring-blue-700 ring-offset-1' : ''}`;
                  return korjaustila && m !== '-' ? (
                    <button key={i} type="button" aria-label={`Korjaa kiekko ${k + 1}`} className={`${luokat} ring-1 ring-amber-500`} onClick={() => korjaa(a.nro, i)}>{m === 'X' ? 'X' : '0'}</button>
                  ) : (
                    <div key={i} className={luokat}>{m === 'X' ? 'X' : m === 'O' ? '0' : ''}</div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {layoutValmis && !korjaustila && (
          <div className="mt-2 flex flex-col gap-2 rounded-lg bg-white p-3">
            <div className="font-semibold">{layout.nimi} ammuttu. Jokainen ampuja tarkistaa ja hyväksyy tuloksensa.</div>
            {ampujat.filter((a) => !tila.keskeyttaneet.includes(a.nro)).map((a) => {
              const merkit = merkitOf(tila.kortit, layout, a.nro);
              const kortti = tila.kortit[korttiAvain(layout.nro, a.nro)];
              return (
                <div key={a.nro} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{a.nro} {a.nimi}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {asemaJarjestys(layout).map((k) => osumat(merkit.slice(asemat[k].alku, asemat[k].loppu))).join(' + ')}
                  </span>
                  <b className="shrink-0">{osumat(merkit)}/{layout.kohteita}</b>
                  {kortti?.hyvaksytty
                    ? <span className="shrink-0 rounded bg-green-700 px-2 py-1 text-xs text-white">Hyväksytty ✓</span>
                    : <button type="button" className="shrink-0 rounded bg-blue-800 px-3 py-1.5 text-white" onClick={() => hyvaksyAmpuja(a.nro)}>Hyväksyn</button>}
                </div>
              );
            })}
            {(() => {
              const seuraavaLayout = jarjestys.find((l) => l.nro !== layout.nro && !layoutHyvaksytty(l, ampujat, tila.kortit, tila.keskeyttaneet));
              return seuraavaLayout && (
                <button type="button" className="self-start rounded border border-slate-400 px-3 py-2" onClick={() => valitseLayout(seuraavaLayout.nro)}>
                  Seuraava layout: {seuraavaLayout.nimi}{seuraavaLayout.aika ? ` · ${seuraavaLayout.aika}` : ''}
                </button>
              );
            })()}
          </div>
        )}
      </section>

      <footer className="shrink-0 border-t border-slate-300 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.1)]">
        {korjaustila ? (
          <>
            <div className="mb-1 truncate text-center text-sm">{kuittaus || 'Korjaustila: napauta korjattavaa kiekkoa. Asemaa voi vaihtaa yläpalkista.'}</div>
            <button type="button" className="h-14 w-full rounded-lg bg-blue-800 text-lg font-bold text-white" onClick={() => setKorjaustila(false)}>Lopeta korjaus</button>
          </>
        ) : (
          <>
            <div className={`mb-1 flex h-6 items-center gap-2 text-sm ${kuittaus ? 'rounded bg-amber-100 px-1 text-amber-900' : ''}`}>
              <span className="min-w-0 flex-1 truncate">
                {kuittaus || (kohta
                  ? <>Vuorossa <b>{kohta.nro} {nimi(kohta.nro)}</b>{osa ? ` · ${osa.nimi}` : ''} · kiekko {kohta.i - alku + 1}/{loppu - alku}</>
                  : seuraavaKesken !== null ? 'Asema valmis.' : 'Layout valmis.')}
              </span>
              {kohta && <button type="button" className="shrink-0 rounded border border-slate-400 px-2 text-xs leading-6" onClick={seuraava}>Seuraava ampuja ›</button>}
              {!kohta && seuraavaKesken !== null && (
                <button type="button" className="shrink-0 rounded bg-blue-800 px-2 text-xs leading-6 text-white" onClick={() => valitseAsema(seuraavaKesken)}>Asema {asemat[seuraavaKesken].id} ›</button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_2fr_2fr] gap-2">
              <button type="button" className="flex h-14 flex-col items-center justify-center rounded-lg border-2 border-slate-400 font-semibold active:bg-slate-200 disabled:opacity-30 sm:h-20" disabled={!viimeHistoria} onClick={peruViimeisin}>
                <span className="text-lg leading-tight">PERU</span>
                {viimeHistoria && <span className="text-[11px] font-normal leading-tight text-slate-600">{viimeHistoria.nro}</span>}
              </button>
              <button type="button" className="h-14 rounded-lg bg-red-700 text-2xl font-bold text-white active:bg-red-900 disabled:opacity-30 sm:h-20" disabled={!kohta} onClick={() => merkitseKohta('O')}>NOLLA</button>
              <button type="button" className="h-14 rounded-lg bg-green-700 text-2xl font-bold text-white active:bg-green-900 disabled:opacity-30 sm:h-20" disabled={!kohta} onClick={() => merkitseKohta('X')}>OSUMA</button>
            </div>
          </>
        )}
      </footer>
    </main>
  );
}

const korvausTieto = (haltija, kirjattu, taydennetty) => ({
  nimi: haltija?.nimi || '', otettu: haltija?.otettu || '', vapaa: Boolean(haltija?.vapaa), kirjattu: kirjattu || 0, taydennetty: taydennetty || 0
});

function Ilmoitus({ children, onOk }) {
  return (
    <div className="flex shrink-0 items-center gap-2 bg-amber-100 px-3 py-2 text-sm text-amber-900">
      <span className="min-w-0 flex-1">{children}</span>
      <button type="button" className="rounded border border-amber-700 px-2 py-1" onClick={onOk}>OK</button>
    </div>
  );
}

// tyyppi: 'varattu' (toinen puhelin kirjaa), 'korvattu' (ryhmä otettiin tältä) tai 'luovutettu' (tämä luovutti).
function RyhmanHaltija({ tyyppi, haltija, korvattu, lahettamatta, onOta, onPaivita }) {
  const [viesti, setViesti] = useState('');
  const [odottaa, setOdottaa] = useState(false);
  const toinen = haltija && !haltija.vapaa && !haltija.oma ? `${haltija.nimi || 'toinen puhelin'}${haltija.otettu ? `, otettu ${haltija.otettu}` : ''}` : '';
  const ota = async () => {
    if (toinen && !window.confirm('Otetaanko ryhmän kirjaus tälle puhelimelle? Toinen puhelin lopettaa kirjauksen, ja sen lähettämättömät merkinnät täydentävät tämän puhelimen kortteja.')) return;
    setOdottaa(true);
    setViesti('');
    const tulos = await onOta();
    setOdottaa(false);
    if (tulos.virhe) setViesti(tulos.virhe);
  };
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      {tyyppi === 'varattu' && (
        <>
          <h2 className="text-lg font-bold text-amber-800">Ryhmää kirjaa toinen puhelin</h2>
          <p>Ryhmän tuloksia kirjaa {toinen || 'toinen puhelin'}. Yksi puhelin kirjaa ryhmää kerrallaan.</p>
          <p className="text-sm">Jos se puhelin on vielä käytössä, valitse siinä ☰ › <b>Luovuta ryhmä</b> ja paina tässä <b>Yritä uudelleen</b>.
            Jos se on sammunut tai poissa, ota kirjaus tälle puhelimelle.</p>
        </>
      )}
      {tyyppi === 'korvattu' && (
        <>
          <h2 className="text-lg font-bold text-red-800">Ryhmää kirjataan toisella puhelimella</h2>
          <p>{korvattu?.vapaa ? 'Ryhmän kirjaus on luovutettu.' : `Ryhmän otti ${korvattu?.nimi || 'toinen puhelin'}${korvattu?.otettu ? ` (${korvattu.otettu})` : ''}.`}
            {korvattu?.taydennetty > 0 ? ` Tämän puhelimen merkinnät välitettiin sille (${korvattu.taydennetty} korttia).` : ''}
            {korvattu?.kirjattu > 0 ? ` ${korvattu.kirjattu} poikkeavaa korttia kirjattiin kilpailutoimiston lokiin.` : ''}</p>
          {lahettamatta > 0 && <p className="text-sm">{lahettamatta} korttia jäi tähän puhelimeen.</p>}
        </>
      )}
      {tyyppi === 'luovutettu' && (
        <>
          <h2 className="text-lg font-bold">Ryhmä luovutettu</h2>
          <p>Kaikki merkinnät on lähetetty. Seuraava puhelin skannaa ryhmän QR-koodin ja jatkaa.</p>
        </>
      )}
      {viesti && <p className="text-sm text-red-700">{viesti}</p>}
      <button type="button" disabled={odottaa} className="rounded bg-blue-800 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50" onClick={ota}>
        {odottaa ? 'Otetaan…' : tyyppi === 'varattu' ? 'Ota kirjaus tälle puhelimelle' : 'Ota ryhmä takaisin tälle puhelimelle'}
      </button>
      <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={onPaivita}>Yritä uudelleen</button>
    </section>
  );
}
