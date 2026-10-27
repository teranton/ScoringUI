// Rata- ja ryhmänäkymän yhteiset osat: lähetystila otsikossa ja asennusohje.
import { onIos } from './sovellus.js';

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
