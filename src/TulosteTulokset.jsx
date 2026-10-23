// Tulostettavat tulokset: kaikki sarjat tulostaulukon muodossa (TulosteTaulukko), jokainen sarja omalle sivulleen.
// Sivun suunta ja sarakeleveydet kuten taulukon tulosteessa. Näkyy vain tulostettaessa (index.css).
import { useMemo } from 'react';
import TulosteTaulukko from './TulosteTaulukko';
import { muodostaTulosteSarjat } from './utils/tulosteTulokset';
import { parsiTaulukkoAmpujat, tunnistaPaivaSarakeNimet } from './utils/henkiloTaulukko';
import { laskeRatojenMaara } from './utils/henkiloTulokset';
import { haeTekstit } from './i18n';

export default function TulosteTulokset({
  rawRows,
  parsedSpeksit,
  kisaNimi,
  kisaPaivat,
  kisaStatus,
  tulostusaika,
  locale = 'fi'
}) {
  const tx = haeTekstit('tulosteTulokset', locale);
  const ratojenMaara = laskeRatojenMaara(parsedSpeksit?.asemaMaksimit);
  const radat = useMemo(() => Array.from({ length: ratojenMaara }, (_, i) => i + 1), [ratojenMaara]);

  const sarjat = useMemo(
    () => muodostaTulosteSarjat(
      Array.isArray(rawRows) && rawRows.length > 1 ? parsiTaulukkoAmpujat(rawRows, ratojenMaara) : [],
      { ratkoSija: parsedSpeksit?.ratkoPalkintoSija, openSarja: parsedSpeksit?.openSarja }
    ),
    [rawRows, ratojenMaara, parsedSpeksit?.ratkoPalkintoSija, parsedSpeksit?.openSarja]
  );
  const paivaSarakeNimet = useMemo(() => tunnistaPaivaSarakeNimet(rawRows, locale), [rawRows, locale]);

  return (
    <div className="tuloste-root" lang={locale}>
      {sarjat.length === 0 && <p>{tx.empty}</p>}
      {sarjat.map(({ sarja, nimi, ampujat, ratkoIdt, sarakkeet }) => (
        <TulosteTaulukko
          key={sarja}
          otsikko={tx.title}
          kisaNimi={kisaNimi}
          kisaPaivat={kisaPaivat}
          kisaStatus={kisaStatus}
          sarja={nimi}
          ampujat={ampujat}
          radat={radat}
          asemaMaksimit={parsedSpeksit?.asemaMaksimit}
          sarakkeet={sarakkeet}
          paivaSarakeNimet={paivaSarakeNimet}
          ratkoIdt={ratkoIdt}
          analyysi={null}
          tulostusaika={tulostusaika}
          locale={locale}
        />
      ))}
    </div>
  );
}
