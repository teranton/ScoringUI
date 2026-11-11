// Rata tai ryhmä jatkuu paperikorteilla (laite rikki, akku loppumassa, kylmä): kirjaus on pysäytetty tällä laitteella.
// Näkymä listaa kesken jääneet kortit (lapsina), jotta niiden merkinnät voi kopioida paperikortille, ja kertoo, onko
// kaikki lähetetty. Kirjaus jatkuu laitteella vain "Jatka mobiilikirjausta" -napista (radan haltija).
import { KohdeMerkki } from './Haltija.jsx';
import { paperinKello } from './paperi.js';

// ryhma: ryhmäpuhelin (tekstit ryhmälle). onJatka: null, kun laite ei ole haltija (rata otetaan ensin).
export function PaperiNakyma({ kohde, aika, paikallinen, lahettamatta, ryhma = false, onJatka, onLataaLoki, children }) {
  const kello = paperinKello(aika);
  const jatka = () => {
    const ohje = ryhma
      ? 'Jatketaanko ryhmän kirjausta tällä puhelimella? Kirjaa ensin paperille merkityt kiekot puhelimeen, jos asema jäi kesken.'
      : 'Jatketaanko radan kirjausta tällä laitteella? Laite ohittaa ampujat, joiden radan tulos on jo kirjoitettu pääsivulle '
        + 'paperikortilta. Muiden paperille merkityt kiekot kirjataan laitteeseen ennen jatkamista.';
    if (window.confirm(ohje)) onJatka();
  };
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <KohdeMerkki kohde={kohde} />
      <div className="rounded-lg bg-amber-100 p-3 text-amber-950">
        <p className="text-lg font-bold">{ryhma ? 'Ryhmä' : 'Rata'} jatkuu paperikorteilla{kello ? ` (klo ${kello})` : ''}</p>
        <p className="text-sm">
          Kirjaus on pysäytetty tällä laitteella. Kesken jääneiden korttien merkinnät näkyvät alla: kopioi ne paperikortille
          ja jatka paperilla. Kilpailutoimisto kirjoittaa paperikorttien tulokset pääsivulle; mobiilikortit eivät korvaa niitä.
        </p>
        {paikallinen && (
          <p className="mt-1 text-sm font-semibold text-red-800">
            Tieto ei vielä mennyt taulukkoon (ei yhteyttä). Kerro kilpailutoimistolle: 📱 Mobiilikirjaus › Rata tai ryhmä jatkuu paperilla.
            Laite lähettää tiedon, kun yhteys palaa.
          </p>
        )}
      </div>
      <p className={`rounded px-3 py-2 text-sm font-semibold ${lahettamatta > 0 ? 'bg-red-100 text-red-900' : 'bg-green-100 text-green-900'}`}>
        {lahettamatta > 0
          ? `${lahettamatta} ${lahettamatta === 1 ? 'kortti' : 'korttia'} lähettämättä: pidä laite päällä, kunnes ne lähtevät, tai kopioi merkinnät paperille.`
          : 'Kaikki merkinnät on lähetetty taulukkoon.'}
      </p>
      <h2 className="text-sm font-semibold">Kesken jääneet kortit</h2>
      {children}
      <div className="mt-2 flex flex-wrap gap-2">
        {onJatka ? (
          <button type="button" className="rounded bg-blue-800 px-4 py-3 text-white" onClick={jatka}>Jatka mobiilikirjausta</button>
        ) : <span className="text-sm text-slate-600">Kirjaus voi jatkua tällä laitteella, kun {ryhma ? 'ryhmä' : 'rata'} on otettu sille (yhteys tarvitaan).</span>}
        <button type="button" className="rounded border border-slate-400 px-4 py-3" onClick={onLataaLoki}>Lataa merkintäloki</button>
      </div>
    </section>
  );
}
