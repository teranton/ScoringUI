// Tulostettava tulosluettelo: kaikki sarjat peräkkäin A4-sivuille. Näkyy vain tulostettaessa (index.css).
import { useMemo } from 'react';
import { muodostaTulosteSarjat } from './utils/tulosteTulokset';
import { tunnistaPaivaSarakeNimet } from './utils/henkiloTaulukko';
import { laskeRatojenMaara } from './utils/henkiloTulokset';
import { haeTekstit } from './i18n';

function muotoileTulostusaika(pvm, locale) {
  const kieli = locale === 'en' ? 'en-GB' : 'fi-FI';
  return `${pvm.toLocaleDateString(kieli)} ${pvm.toLocaleTimeString(kieli, { hour: '2-digit', minute: '2-digit' })}`;
}

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

  const { sarjat, eraNumerot, naytaPaivat } = useMemo(
    () => muodostaTulosteSarjat(rawRows, {
      ratojenMaara,
      ratkoSija: parsedSpeksit?.ratkoPalkintoSija
    }),
    [rawRows, ratojenMaara, parsedSpeksit?.ratkoPalkintoSija]
  );
  const { laLabel, suLabel } = useMemo(() => tunnistaPaivaSarakeNimet(rawRows, locale), [rawRows, locale]);
  // Samat sarakkeet ja leveydet kaikissa sarjoissa, jotta nimet ja tulokset ovat samoissa kohdissa.
  const naytaRatko = sarjat.some((s) => s.naytaRatko);
  const numeroSarakkeita = eraNumerot.length + (naytaPaivat ? 2 : 0) + 1 + (naytaRatko ? 1 : 0);
  const sarakkeet = (
    <colgroup>
      <col className="tuloste-col-sija" />
      <col />
      <col className="tuloste-col-seura" />
      {eraNumerot.map((n) => <col key={n} className="tuloste-col-era" />)}
      {naytaPaivat && <col className="tuloste-col-paiva" />}
      {naytaPaivat && <col className="tuloste-col-paiva" />}
      <col className="tuloste-col-yht" />
      {naytaRatko && <col className="tuloste-col-ratko" />}
    </colgroup>
  );

  return (
    <div className="tuloste-root" lang={locale}>
      <header className="tuloste-otsikko">
        <div>
          <h1 translate="no">{kisaNimi}</h1>
          <div>{[kisaPaivat, tx.title].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="tuloste-meta">
          {kisaStatus !== 'paattynyt' && <div className="tuloste-epavirallinen">{tx.unofficial}</div>}
          <div>{tx.printed} {muotoileTulostusaika(tulostusaika, locale)}</div>
        </div>
      </header>

      {sarjat.length === 0 && <p>{tx.empty}</p>}

      {sarjat.map(({ sarja, rivit, eiTulosta }) => (
        <section key={sarja || '-'} className="tuloste-sarja">
          <h2>
            {sarja || tx.noClass}{' '}
            <span>
              {rivit.length} {tx.shooters}{eiTulosta.length > 0 ? `, ${eiTulosta.length} ${tx.noResult.toLowerCase()}` : ''}
            </span>
          </h2>
          <table>
            {sarakkeet}
            <thead>
              <tr>
                <th className="tuloste-num">{tx.rank}</th>
                <th>{tx.name}</th>
                <th>{tx.club}</th>
                {eraNumerot.map((n) => <th key={n} className="tuloste-num">{n}</th>)}
                {naytaPaivat && <th className="tuloste-num tuloste-paiva">{laLabel}</th>}
                {naytaPaivat && <th className="tuloste-num">{suLabel}</th>}
                <th className="tuloste-num tuloste-yht">{tx.total}</th>
                {naytaRatko && <th className="tuloste-num">{tx.tieBreak}</th>}
              </tr>
            </thead>
            <tbody>
              {rivit.map((rivi) => (
                <tr key={rivi.id}>
                  <td className="tuloste-num">{rivi.sija}.</td>
                  <td className="tuloste-nimi">{rivi.nimi}</td>
                  <td>{rivi.seura}</td>
                  {rivi.erat.map((arvo, i) => <td key={eraNumerot[i]} className="tuloste-num">{arvo}</td>)}
                  {naytaPaivat && <td className="tuloste-num tuloste-paiva">{rivi.la}</td>}
                  {naytaPaivat && <td className="tuloste-num">{rivi.su}</td>}
                  <td className="tuloste-num tuloste-yht">{rivi.tulos}</td>
                  {naytaRatko && <td className="tuloste-num">{rivi.ratko}</td>}
                </tr>
              ))}
              {eiTulosta.map((ampuja) => (
                <tr key={ampuja.id} className="tuloste-ei-tulosta">
                  <td />
                  <td className="tuloste-nimi">{ampuja.nimi}</td>
                  <td>{ampuja.seura}</td>
                  {eraNumerot.length > 0 && <td colSpan={eraNumerot.length} />}
                  <td
                    colSpan={numeroSarakkeita - eraNumerot.length}
                    className={naytaPaivat ? 'tuloste-num tuloste-paiva' : 'tuloste-num'}
                  >
                    {tx.noResult}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
