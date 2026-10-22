// Tulostettava tulostaulukko: näytön taulukon sarja ja järjestys A4-sivuille, kaikki sarakkeet ja koko nimet.
// HenkiloTaulukko renderöi tämän tulostuksen ajaksi App:n tulostejuureen (portaali), joten myös selaimen oma
// tulostus (Ctrl+P) käyttää tätä eikä vieritettävää näytön taulukkoa. Näkyy vain tulostettaessa (index.css).
import { laskeTulosteSarakeLeveydet, laskeTulosteTaulukonKoko, muodostaTulosteRatko } from './utils/henkiloTaulukko';
import { haeTekstit } from './i18n';

function muotoileTulostusaika(pvm, locale) {
  const kieli = locale === 'en' ? 'en-GB' : 'fi-FI';
  return `${pvm.toLocaleDateString(kieli)} ${pvm.toLocaleTimeString(kieli, { hour: '2-digit', minute: '2-digit' })}`;
}

// sarakkeet: { sarja, seura, la, su, ratko } näytetäänkö sarake. analyysi: rata-analyysin rivit tai null.
export default function TulosteTaulukko({
  kisaNimi,
  kisaPaivat,
  kisaStatus,
  sarja,
  ampujat,
  radat,
  asemaMaksimit,
  sarakkeet,
  paivaSarakeNimet,
  ratkoIdt,
  analyysi,
  tulostusaika,
  locale = 'fi'
}) {
  const tx = haeTekstit('henkiloTaulukko', locale);

  const { vaaka, tiivis } = laskeTulosteTaulukonKoko(radat.length);
  const leveydet = laskeTulosteSarakeLeveydet(ampujat, sarakkeet, radat.length);
  const etusarakkeita = 3
    + (sarakkeet.sarja ? 1 : 0)
    + (sarakkeet.seura ? 1 : 0)
    + (sarakkeet.la ? 1 : 0)
    + (sarakkeet.su ? 1 : 0)
    + (sarakkeet.ratko ? 1 : 0);
  const onkoMaksimi = (n, arvo) => {
    const maksimi = asemaMaksimit?.[n] ?? asemaMaksimit?.[`${n}`];
    const piste = parseInt(arvo, 10);
    return maksimi !== undefined && !Number.isNaN(piste) && piste === maksimi;
  };

  return (
    <div className={`tuloste-taulukko${tiivis ? ' tuloste-taulukko-tiivis' : ''}`}>
      <style>{`@media print { @page { size: A4 ${vaaka ? 'landscape' : 'portrait'}; margin: 10mm; } }`}</style>
      <header className="tuloste-otsikko">
        <div>
          <h1 translate="no">{kisaNimi}</h1>
          <div>{[kisaPaivat, tx.title, sarja].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="tuloste-meta">
          {kisaStatus !== 'paattynyt' && <div className="tuloste-epavirallinen">{tx.unofficial}</div>}
          <div>{tx.printed} {muotoileTulostusaika(tulostusaika, locale)}</div>
        </div>
      </header>

      {ampujat.length === 0 && <p>{tx.printEmpty}</p>}

      {ampujat.length > 0 && (
        <table>
          <colgroup>
            <col className="tuloste-col-sija" />
            <col />
            {sarakkeet.sarja && <col style={{ width: `${leveydet.sarja}em` }} />}
            {sarakkeet.seura && <col style={{ width: `${leveydet.seura}em` }} />}
            {sarakkeet.la && <col className="tuloste-col-paiva" />}
            {sarakkeet.su && <col className="tuloste-col-paiva" />}
            <col className="tuloste-col-yht" />
            {sarakkeet.ratko && <col className="tuloste-col-ratko" />}
            {radat.map((n) => <col key={n} className="tuloste-col-era" />)}
          </colgroup>
          <thead>
            <tr>
              <th className="tuloste-num">{tx.rank}</th>
              <th>{tx.name}</th>
              {sarakkeet.sarja && <th>{tx.classLabel}</th>}
              {sarakkeet.seura && <th>{tx.clubLabel}</th>}
              {sarakkeet.la && <th className="tuloste-num">{paivaSarakeNimet.laLabel}</th>}
              {sarakkeet.su && <th className="tuloste-num">{paivaSarakeNimet.suLabel}</th>}
              <th className="tuloste-num">{tx.total}</th>
              {sarakkeet.ratko && <th className="tuloste-ratko">Ratko</th>}
              {radat.map((n, i) => (
                <th key={n} className={`tuloste-num${i === 0 ? ' tuloste-raja' : ''}`}>{n}</th>
              ))}
            </tr>
          </thead>
          {/* Analyysi omassa tbodyssa, ettei se siirrä ampujarivien raidoitusta. */}
          {analyysi && (
            <tbody className="tuloste-analyysi">
              {analyysi.map((rivi) => (
                <tr key={rivi.otsikko}>
                  <td colSpan={etusarakkeita}>{rivi.otsikko}</td>
                  {rivi.arvot.map((arvo, i) => (
                    <td key={radat[i]} className={`tuloste-num${i === 0 ? ' tuloste-raja' : ''}`}>{arvo}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
          <tbody>
            {ampujat.map((ampuja) => (
              <tr key={ampuja.id}>
                <td className="tuloste-num">{ampuja.laskettuSija}</td>
                <td className="tuloste-nimi" translate="no">{ampuja.nimi}</td>
                {sarakkeet.sarja && <td>{ampuja.sarja}</td>}
                {sarakkeet.seura && <td translate="no">{ampuja.seura}</td>}
                {sarakkeet.la && <td className="tuloste-num">{ampuja.la}</td>}
                {sarakkeet.su && <td className="tuloste-num">{ampuja.su}</td>}
                <td className="tuloste-num tuloste-yht">{ampuja.kokonaistulos}</td>
                {sarakkeet.ratko && <td className="tuloste-ratko">{muodostaTulosteRatko(ampuja, ratkoIdt)}</td>}
                {radat.map((n, i) => {
                  const arvo = ampuja.erat[n] || '';
                  const luokat = ['tuloste-num', i === 0 && 'tuloste-raja', onkoMaksimi(n, arvo) && 'tuloste-maksimi'];
                  return <td key={n} className={luokat.filter(Boolean).join(' ')}>{arvo}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
