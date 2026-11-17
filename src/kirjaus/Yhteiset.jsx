// Rata- ja ryhmänäkymän yhteiset osat: lähetystila otsikossa, asennusohje ja ulkoisten nappien asetus.
import { useEffect, useState } from 'react';
import { onIos } from './sovellus.js';
import { TOIMINNOT, OLETUSNAPIT, kirjoituskentta, nappiTekstina, onOletus, opetaNappi } from './napit.js';

// Otsikon lähetystila: kaikki lähetetty / N korttia lähettämättä / ei yhteyttä N min (katko alkoi ensimmäisestä
// epäonnistuneesta lähetyksestä).
export function SynkMerkki({ lahettamatta, virhe, katkesi, nyt }) {
  if (lahettamatta === 0) return <span className="rounded bg-green-700 px-2 py-1 text-xs font-semibold">✓ Kaikki lähetetty</span>;
  const minuutit = katkesi ? Math.max(0, Math.floor((nyt - katkesi) / 60000)) : 0;
  const syy = virhe === 'Ei yhteyttä' ? `ei yhteyttä${minuutit > 0 ? ` ${minuutit} min` : ''}` : virhe;
  return (
    <span className={`rounded px-2 py-1 text-right text-xs leading-tight font-semibold ${virhe ? 'bg-red-700' : 'bg-amber-600'}`} title={virhe}>
      {lahettamatta} {lahettamatta === 1 ? 'kortti' : 'korttia'} lähettämättä{syy ? <><br className="sm:hidden" /><span className="hidden sm:inline"> · </span>{syy}</> : ''}
    </span>
  );
}

// Asennus aloitusnäytölle: ei osoiteriviä eikä välilehtiä, joten kirjaus ei sulkeudu vahingossa.
export function Asennus({ asennus, onKopioiKoodi, koodiTeksti = 'Kopioi ratakoodi' }) {
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
            Safarissa: Jaa ⎙ → Lisää Koti-valikkoon. Asennettu sovellus ei näe Safarin tietoja, joten kopioi koodi
            ensin ja liitä se sovellukseen. Lähettämättömät kortit lähtevät Safarista, kun avaat sen uudelleen.
          </p>
          <button type="button" className="self-start rounded border border-slate-400 px-3 py-2" onClick={onKopioiKoodi}>{koodiTeksti}</button>
        </>
      ) : (
        <p className="text-slate-600">Selaimen valikosta: Asenna sovellus tai Lisää aloitusnäytölle.</p>
      ))}
    </div>
  );
}

// Ulkoiset napit: nykyiset näppäimet ja opetus. Opetuksen aikana seuraava painallus (mikä tahansa näppäin tekstikentän
// ulkopuolella) lisätään toiminnolle. Kuuntelija on kaappausvaiheessa ja pysäyttää painalluksen, joten kirjauksen
// kuuntelija ei näe sitä (ei hylkäysääntä).
export function NapitAsetus({ napit, onNapit }) {
  const [opetettava, setOpetettava] = useState(null);
  useEffect(() => {
    if (!opetettava) return undefined;
    const opeta = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || kirjoituskentta(e.target)) return;
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const uudet = e.code === 'Escape' ? null : opetaNappi(napit, opetettava, e.code);
      if (uudet) onNapit(uudet);
      setOpetettava(null);
    };
    // Välilyönti ja Enter painavat kohdistettua Opeta-painiketta vapautettaessa; se ei saa aloittaa opetusta uudelleen.
    const vapauta = (e) => {
      if (kirjoituskentta(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', opeta, true);
    window.addEventListener('keyup', vapauta, true);
    return () => {
      window.removeEventListener('keydown', opeta, true);
      window.removeEventListener('keyup', vapauta, true);
    };
  }, [opetettava, napit, onNapit]);

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-300 p-2">
      <span><b>Ulkoiset napit</b> · Bluetooth-näppäin tai tuomarin käsiohjain (paritetaan laitteen Bluetooth-asetuksista)</span>
      {TOIMINNOT.map(({ avain, nimi }) => (
        <div key={avain} className="flex items-center justify-between gap-2">
          <span>
            {nimi}: <b>{(napit[avain] || []).map(nappiTekstina).join(', ') || '–'}</b>
          </span>
          <button
            type="button"
            className={`rounded border px-3 py-2 ${opetettava === avain ? 'border-blue-800 bg-blue-800 text-white' : 'border-slate-400'}`}
            onClick={() => setOpetettava(opetettava === avain ? null : avain)}
          >
            {opetettava === avain ? 'Paina nappia…' : 'Opeta'}
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600">Napit merkitsevät vain kirjausnäkymässä, eivät valikon ollessa auki. Ryhmäpuhelimessa OSUMAn pitäminen pohjassa 1 s hyväksyy ammutun aseman.</span>
        {!onOletus(napit) && (
          <button type="button" className="shrink-0 rounded border border-slate-400 px-3 py-2" onClick={() => onNapit(OLETUSNAPIT)}>Oletukset</button>
        )}
      </div>
    </div>
  );
}
