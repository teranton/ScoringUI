// Tulostettava Compak-aikataulu: radat rinnakkain A4-sivuille. Näkyy vain tulostettaessa (index.css).
import { useMemo } from 'react';
import { parseCsvRows } from './utils/csv';
import { muodostaTulosteAikataulu } from './utils/aikatauluRadat';
import { haeTekstit } from './i18n';

function muotoileTulostusaika(pvm, locale) {
  const kieli = locale === 'en' ? 'en-GB' : 'fi-FI';
  return `${pvm.toLocaleDateString(kieli)} ${pvm.toLocaleTimeString(kieli, { hour: '2-digit', minute: '2-digit' })}`;
}

function Ruutu({ ruutu, naytaAika, tx }) {
  const aika = naytaAika && <td className="tuloste-num tuloste-raja">{ruutu.aika}</td>;
  if (ruutu.tauko) {
    return (
      <>
        {aika}
        <td colSpan={2} className={`tuloste-tauko${naytaAika ? '' : ' tuloste-raja'}`}>{tx.break}</td>
      </>
    );
  }
  return (
    <>
      {aika}
      <td className={`tuloste-num${naytaAika ? '' : ' tuloste-raja'}`}>{ruutu.nro}</td>
      <td className={`tuloste-nimi${ruutu.tuomari ? ' tuloste-tuomari' : ''}`}>{ruutu.nimi}</td>
    </>
  );
}

export default function TulosteAikataulu({ rawCsv, otsikko, kisaNimi, kisaPaivat, tulostusaika, locale = 'fi' }) {
  const tx = haeTekstit('tulosteAikataulu', locale);
  const aikataulu = useMemo(() => muodostaTulosteAikataulu(parseCsvRows(rawCsv || '')), [rawCsv]);
  const osat = aikataulu?.osat || [];
  // Vaaka-A4, kun rinnakkain on yli kaksi rataa; kahdelle radalle pysty riittää.
  const vaaka = osat.some((osa) => osa.radat.length > 2);
  const onTuomareita = osat.some((osa) => osa.rivit.some((rivi) => rivi.ruudut.some((r) => r.tuomari)));
  // Otsikkorivin päivämäärä ("AIKATAULU | 12.07.2026"), muuten välilehden nimi (esim. "Aikataulu Su").
  const alaotsikko = aikataulu?.otsikko ? `${tx.title} ${aikataulu.otsikko}` : (otsikko || tx.title);

  return (
    <div className="tuloste-root tuloste-aikataulu" lang={locale}>
      <style>{`@media print { @page { size: A4 ${vaaka ? 'landscape' : 'portrait'}; margin: 10mm; } }`}</style>
      {osat.length === 0 && <p>{tx.empty}</p>}

      {osat.map((osa, osaIndeksi) => (
        <section key={osa.radat.join('|')} className="tuloste-aikataulu-osa">
          <header className="tuloste-otsikko">
            <div>
              <h1 translate="no">{kisaNimi}</h1>
              <div>{[kisaPaivat, alaotsikko].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="tuloste-meta">
              {onTuomareita && osaIndeksi === 0 && <div><span className="tuloste-tuomari">{tx.refereeSample}</span> {tx.refereeLegend}</div>}
              <div>{tx.printed} {muotoileTulostusaika(tulostusaika, locale)}</div>
            </div>
          </header>
          <table>
            <colgroup>
              {osa.yhteinenAika && <col className="tuloste-col-aika" />}
              {osa.radat.map((rata) => (
                <ColGroup key={rata} naytaAika={!osa.yhteinenAika} />
              ))}
            </colgroup>
            <thead>
              <tr className="tuloste-ratarivi">
                {osa.yhteinenAika && <th rowSpan={2} className="tuloste-num">{tx.time}</th>}
                {osa.radat.map((rata) => (
                  <th key={rata} colSpan={osa.yhteinenAika ? 2 : 3} className="tuloste-raja" translate="no">{tx.lane} {rata}</th>
                ))}
              </tr>
              <tr>
                {osa.radat.map((rata) => (
                  <RataOtsikot key={rata} naytaAika={!osa.yhteinenAika} tx={tx} />
                ))}
              </tr>
            </thead>
            <tbody>
              {osa.rivit.map((rivi) => (
                <tr key={rivi.id}>
                  {osa.yhteinenAika && <td className="tuloste-num tuloste-aika">{rivi.aika}</td>}
                  {rivi.ruudut.map((ruutu, i) => (
                    <Ruutu key={osa.radat[i]} ruutu={ruutu} naytaAika={!osa.yhteinenAika} tx={tx} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function ColGroup({ naytaAika }) {
  return (
    <>
      {naytaAika && <col className="tuloste-col-aika" />}
      <col className="tuloste-col-nro" />
      <col />
    </>
  );
}

function RataOtsikot({ naytaAika, tx }) {
  return (
    <>
      {naytaAika && <th className="tuloste-num tuloste-raja">{tx.time}</th>}
      <th className={`tuloste-num${naytaAika ? '' : ' tuloste-raja'}`}>{tx.number}</th>
      <th>{tx.shooter}</th>
    </>
  );
}
