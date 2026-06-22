// src/HenkiloTulokset.jsx
import React, { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import { teema } from './teema'; // Varmista että teema on importattu

export default function HenkiloTulokset({ rawCsv, speksitCsv }) {
  const [valittuAmpujaId, setValittuAmpujaId] = useState(null);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('KAIKKI');

  // 1. Parsitaan asemakohtaiset maksimit KISANSPEKSIT-datasta (alue J3:K)
  const asemaMaksimit = useMemo(() => {
    const maksimit = {};
    if (!speksitCsv || typeof speksitCsv !== 'string' || speksitCsv.trim().length < 2) {
      return maksimit;
    }

    try {
      const speksiRivit = parseCsvRows(speksitCsv);
      if (!Array.isArray(speksiRivit)) return maksimit;

      speksiRivit.forEach((rivi) => {
        // Varmistetaan, että rivi on olemassa ja siinä on tarvittavat sarakkeet
        if (!rivi || rivi.length < 11) return;

        const raakaAsema = rivi[9];
        const raakaMaksimi = rivi[10];

        if (raakaAsema !== undefined && raakaAsema !== null && raakaMaksimi !== undefined && raakaMaksimi !== null) {
          const asemaTunnus = raakaAsema.toString().trim();
          const maksimiArvo = parseInt(raakaMaksimi, 10);

          if (asemaTunnus && !isNaN(maksimiArvo)) {
            // Puhdistetaan otsikko pelkäksi numeroksi (esim. "Asema 1" -> "1")
            const asemaNumero = asemaTunnus.replace(/\D/g, '');
            maksimit[asemaNumero || asemaTunnus] = maksimiArvo;
          }
        }
      });
    } catch (e) {
      console.error("Virhe speksien parsinnoissa:", e);
    }

    return maksimit;
  }, [speksitCsv]);

  if (!rawCsv || rawCsv.trim().length < 10 || rawCsv.toLowerCase().includes("html") || rawCsv.toLowerCase().includes("error")) {
    return <div style={tyylit.Viesti}>Ei henkilökohtaisia tuloksia saatavilla tai välilehteä ei löydy.</div>;
  }

  const rivit = useMemo(() => parseCsvRows(rawCsv), [rawCsv]);
  if (rivit.length < 2) return <div style={tyylit.Viesti}>Ei tulosdataa.</div>;

  const otsikot = rivit[0].map((o) => String(o || '').toUpperCase());
  const otsikotNormalisoitu = otsikot.map((o) => o.replace(/[^A-Z0-9]/g, ''));

  const etsiSarakkeenIndeksi = (ehdot) => {
    for (const ehto of ehdot) {
      const idx = otsikotNormalisoitu.findIndex((h) => ehto(h));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const ratkoStatusPainot = {
    DNS: -1,
    DNF: -2,
    DNQ: -3,
    DSQ: -4
  };

  const puraRatkoArvo = (arvo) => {
    const teksti = String(arvo || '').trim().toUpperCase();
    if (!teksti) return { tyyppi: 'empty', piste: -9999 };

    const status = teksti.replace(/[^A-Z]/g, '');
    if (Object.prototype.hasOwnProperty.call(ratkoStatusPainot, status)) {
      return { tyyppi: 'status', piste: ratkoStatusPainot[status], status };
    }

    const numero = parseInt(teksti, 10);
    if (!Number.isNaN(numero)) {
      return { tyyppi: 'num', piste: numero };
    }

    return { tyyppi: 'text', piste: -5000, teksti };
  };

  const muodostaRatkoNaytto = (ratko1, ratko2) => {
    const eka = String(ratko1 || '').trim();
    const toka = String(ratko2 || '').trim();
    if (eka && toka) return `${eka} + ${toka}`;
    return eka || toka || '';
  };

  const muodostaRatkoNakyma = (ratko1, ratko2) => {
    const arvo1 = puraRatkoArvo(ratko1);
    const arvo2 = puraRatkoArvo(ratko2);

    const statusTunnisteet = [];
    if (arvo1.tyyppi === 'status' && arvo1.status) statusTunnisteet.push(arvo1.status);
    if (arvo2.tyyppi === 'status' && arvo2.status) statusTunnisteet.push(arvo2.status);

    const uniikitStatus = Array.from(new Set(statusTunnisteet));
    const naytto = muodostaRatkoNaytto(ratko1, ratko2);

    if (uniikitStatus.length > 0) {
      const osat = naytto
        .split('+')
        .map((s) => s.trim())
        .filter((s) => s && !uniikitStatus.includes(s.toUpperCase()));
      return { statusEtiketit: uniikitStatus, teksti: osat.join(' + ') };
    }

    return { statusEtiketit: [], teksti: naytto };
  };

  const idxNimi = etsiSarakkeenIndeksi([(h) => h === 'NIMI', (h) => h.includes('NIMI')]);
  const idxSarja = etsiSarakkeenIndeksi([(h) => h === 'SARJA', (h) => h.includes('SARJA')]);
  const idxSeura = etsiSarakkeenIndeksi([(h) => h === 'SEURA', (h) => h.includes('SEURA')]);
  const idxRata1 = otsikot.findIndex((o) => o.trim() === '1');

  // Fallback vanhaan malliin (indeksiin 4), jos jostain syystä otsikkoa "1" ei löydy lainkaan
  const aloitusIndeksi = idxRata1 !== -1 ? idxRata1 : 4;

  // 3. LASKETAAN RATKO-SARAKKEEN PAIKKA DYNAAMISESTI ALOITUSPISTEESTÄ
  const kisanRatojenMaara = Object.keys(asemaMaksimit).length > 0
    ? Object.keys(asemaMaksimit).length
    : 8;

  // RATKO on täsmälleen ratojen määrän verran aloitusindeksistä eteenpäin
  // Esim. Jos Rata 1 on indeksissä 4 ja ratoja on 8, RATKO on indeksissä 4 + 8 + 1 (YHT)= 13.
  const idxRatko = aloitusIndeksi + kisanRatojenMaara + 1;
  const idxLa = etsiSarakkeenIndeksi([(h) => h === 'LA', (h) => h.startsWith('LAUANTAI')]);
  const idxSu = etsiSarakkeenIndeksi([(h) => h === 'SU', (h) => h.startsWith('SUNNUNTAI')]);

  if (idxNimi === -1) {
    return <div style={tyylit.Viesti}>Virhe: 'NIMI'-saraketta ei löytynyt taulukosta.</div>;
  }

  let idxTulos = etsiSarakkeenIndeksi([(h) => h === 'TULOS', (h) => h.startsWith('TULOS')]);
  if (idxTulos === -1 && idxSeura !== -1) {
    idxTulos = idxSeura + 1;
  }

  const idxSija = idxNimi - 1 >= 0 ? idxNimi - 1 : 1;

  const { ampujat, loydetytSarjat } = useMemo(() => {
    const parsedAmpujat = [];
    const sarjatSet = new Set();

    for (let i = 1; i < rivit.length; i++) {
      const row = rivit[i];
      if (!row[idxNimi]) continue;


      // Etsitään ampujan radat dynaamisesti aloitusindeksistä lähtien
      const osumaSarjat = [];
      for (let r = 1; r <= kisanRatojenMaara; r++) {
        // Lasketaan jokaisen radan sarake suhteessa ensimmäisen radan paikkaan
        const sarakkeenIndex = aloitusIndeksi + (r - 1);

        if (row[sarakkeenIndex] !== undefined) {
          osumaSarjat.push({
            numero: r.toString(),
            tulos: row[sarakkeenIndex] || "-"
          });
        }
      }

      const ampuja = {
        id: `${row[idxNimi] || 'ampuja'}|${idxSarja !== -1 ? row[idxSarja] || 'Y' : 'Y'}|${i}`,
        alkuperainenSija: row[idxSija] || i.toString(),
        nimi: row[idxNimi],
        sarja: idxSarja !== -1 ? row[idxSarja] : "Y",
        seura: idxSeura !== -1 ? row[idxSeura] : "",
        tulos: row[idxTulos] || "0",
        la: idxLa !== -1 ? row[idxLa] : null,
        su: idxSu !== -1 ? row[idxSu] : null,
        ratko: idxRatko !== -1 ? row[idxRatko] : "",
        ratko2: idxRatko !== -1 ? row[idxRatko + 1] || "" : "",
        sarjat: osumaSarjat
      };

      ampuja.ratkoNaytto = muodostaRatkoNaytto(ampuja.ratko, ampuja.ratko2);

      parsedAmpujat.push(ampuja);
      if (ampuja.sarja) sarjatSet.add(ampuja.sarja);
    }

    return { ampujat: parsedAmpujat, loydetytSarjat: sarjatSet };
  }, [idxLa, idxNimi, idxRatko, idxSarja, idxSeura, idxSija, idxSu, idxTulos, otsikot, rivit, asemaMaksimit]);

  const naytettavatAmpujat = useMemo(() => {
    if (sarjaSuodatin === 'KAIKKI') {
      const sortedAmpujat = [...ampujat].sort((a, b) => {
        const tulosA = parseInt(a.tulos, 10) || 0;
        const tulosB = parseInt(b.tulos, 10) || 0;
        if (tulosB !== tulosA) return tulosB - tulosA;

        const ratkoA = puraRatkoArvo(a.ratko);
        const ratkoB = puraRatkoArvo(b.ratko);
        if (ratkoB.piste !== ratkoA.piste) return ratkoB.piste - ratkoA.piste;

        const ratko2A = puraRatkoArvo(a.ratko2);
        const ratko2B = puraRatkoArvo(b.ratko2);
        return ratko2B.piste - ratko2A.piste;
      });

      return sortedAmpujat.map((ampuja, index, array) => {
        let sija = index + 1;
        const tulosNum = parseInt(ampuja.tulos, 10) || 0;
        const ratkoArvo = puraRatkoArvo(ampuja.ratko);
        const ratko2Arvo = puraRatkoArvo(ampuja.ratko2);

        if (index > 0) {
          const edellinen = array[index - 1];
          const edellinenTulos = parseInt(edellinen.tulos, 10) || 0;
          const edellinenRatko = puraRatkoArvo(edellinen.ratko);
          const edellinenRatko2 = puraRatkoArvo(edellinen.ratko2);
          if (
            edellinenTulos === tulosNum &&
            edellinenRatko.piste === ratkoArvo.piste &&
            edellinenRatko2.piste === ratko2Arvo.piste
          ) {
            sija = parseInt(edellinen.laskettuSija || `${index}`, 10) || index;
          }
        }
        return { ...ampuja, laskettuSija: sija.toString() };
      });
    }

    const sarjanVaki = ampujat
      .filter((a) => a.sarja.toUpperCase() === sarjaSuodatin.toUpperCase())
      .sort((a, b) => {
        const tulosA = parseInt(a.tulos, 10) || 0;
        const tulosB = parseInt(b.tulos, 10) || 0;
        if (tulosB !== tulosA) return tulosB - tulosA;

        const ratkoA = puraRatkoArvo(a.ratko);
        const ratkoB = puraRatkoArvo(b.ratko);
        if (ratkoB.piste !== ratkoA.piste) return ratkoB.piste - ratkoA.piste;

        const ratko2A = puraRatkoArvo(a.ratko2);
        const ratko2B = puraRatkoArvo(b.ratko2);
        return ratko2B.piste - ratko2A.piste;
      });

    return sarjanVaki.map((ampuja, index, array) => {
      let sija = index + 1;
      const tulosNum = parseInt(ampuja.tulos, 10) || 0;
      const ratkoArvo = puraRatkoArvo(ampuja.ratko);
      const ratko2Arvo = puraRatkoArvo(ampuja.ratko2);

      if (index > 0) {
        const edellinen = array[index - 1];
        const edellinenTulos = parseInt(edellinen.tulos, 10) || 0;
        const edellinenRatko = puraRatkoArvo(edellinen.ratko);
        const edellinenRatko2 = puraRatkoArvo(edellinen.ratko2);
        if (
          edellinenTulos === tulosNum &&
          edellinenRatko.piste === ratkoArvo.piste &&
          edellinenRatko2.piste === ratko2Arvo.piste
        ) {
          sija = parseInt(edellinen.laskettuSija || `${index}`, 10) || index;
        }
      }
      return { ...ampuja, laskettuSija: sija.toString() };
    });
  }, [ampujat, sarjaSuodatin]);

  const haeSijoitusRivinTausta = (sijaStr, onAuki, index) => {
    if (onAuki) return teema.riviAuki;

    const sija = parseInt(sijaStr, 10);
    if (sija === 1) return teema.kulta;
    if (sija === 2) return teema.hopea;
    if (sija === 3) return teema.pronssi;

    return index % 2 === 0 ? teema.riviParillinen : teema.riviPariton;
  };

  const haeStatusLabelTyyli = (status) => {
    if (['DNS', 'DNF', 'DNQ', 'DSQ'].includes(status)) {
      return { background: teema.statusLabelTausta, color: teema.statusLabelTeksti };
    }

    return { background: teema.statusOletusTausta, color: teema.statusOletusTeksti };
  };

  const onMobiili = typeof window !== 'undefined' && window.innerWidth < 600;
  const sarakeMaara = (onMobiili ? 3 : 5) + (idxLa !== -1 ? 1 : 0) + (idxSu !== -1 ? 1 : 0) + 1;

  return (
    <div style={tyylit.Alue}>
      <div style={tyylit.SuodatinPalkki}>
        <button onClick={() => { setSarjaSuodatin('KAIKKI'); setValittuAmpujaId(null); }} style={sarjaSuodatin === 'KAIKKI' ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>KAIKKI</button>
        {Array.from(loydetytSarjat).sort().map(sarja => (
          <button key={sarja} onClick={() => { setSarjaSuodatin(sarja); setValittuAmpujaId(null); }} style={sarjaSuodatin === sarja ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>{sarja}</button>
        ))}
      </div>

      <div style={tyylit.TaulukkoSäiliö}>
        <table style={tyylit.Taulukko}>
          <thead>
            <tr style={tyylit.OtsikkoRivi}>
              <th style={{ ...tyylit.Th, ...tyylit.SijaSarake, textAlign: 'center' }}>#</th>
              <th style={{ ...tyylit.Th, textAlign: 'left' }}>Nimi</th>
              <th style={{ ...tyylit.Th, ...tyylit.DesktopSarake }}>Sarja</th>
              <th style={{ ...tyylit.Th, ...tyylit.DesktopSarake }}>Seura</th>
              {idxLa !== -1 && <th style={{ ...tyylit.Th, ...tyylit.SuppeaSarake, textAlign: 'center' }}>LA</th>}
              {idxSu !== -1 && <th style={{ ...tyylit.Th, ...tyylit.SuppeaSarake, textAlign: 'center' }}>SU</th>}
              <th style={{ ...tyylit.Th, ...tyylit.YhteensaSarake, textAlign: 'right', paddingRight: '12px' }}>Yht.</th>
              <th style={{ ...tyylit.Th, ...tyylit.RatkoSarake, textAlign: 'center' }}>RATKO</th>
            </tr>
          </thead>
          <tbody>
            {naytettavatAmpujat.map((ampuja, index) => {
              const onAuki = valittuAmpujaId === ampuja.id;
              const ratkoNakyma = muodostaRatkoNakyma(ampuja.ratko, ampuja.ratko2);
              const naytaRatko = sarjaSuodatin !== 'KAIKKI' || parseInt(ampuja.laskettuSija, 10) <= 3;

              return (
                <React.Fragment key={ampuja.id}>
                  <tr
                    style={{
                      ...tyylit.DataRivi,
                      background: haeSijoitusRivinTausta(ampuja.laskettuSija, onAuki, index)
                    }}
                    onClick={() => setValittuAmpujaId(onAuki ? null : ampuja.id)}
                  >
                    <td style={{ ...tyylit.Td, ...tyylit.SijaSarake, textAlign: 'center', fontWeight: '700', color: '#3c4043' }}>
                      {ampuja.laskettuSija}
                    </td>

                    <td style={{ ...tyylit.Td, ...tyylit.NimiSolu }}>
                      <div style={tyylit.NimiTeksti}>{ampuja.nimi}</div>
                      <div style={tyylit.MobiiliAliTiedot}>
                        <span style={tyylit.MobiiliSarja}>{ampuja.sarja}</span> {ampuja.seura}
                      </div>
                    </td>

                    <td style={{ ...tyylit.Td, ...tyylit.DesktopSarake }}><span style={tyylit.SarjaTag}>{ampuja.sarja}</span></td>
                    <td style={{ ...tyylit.Td, ...tyylit.DesktopSarake, color: '#5f6368' }}>{ampuja.seura || '—'}</td>

                    {idxLa !== -1 && <td style={{ ...tyylit.Td, ...tyylit.SuppeaSarake, textAlign: 'center', color: '#5f6368' }}>{ampuja.la || '—'}</td>}
                    {idxSu !== -1 && <td style={{ ...tyylit.Td, ...tyylit.SuppeaSarake, textAlign: 'center', color: '#5f6368' }}>{ampuja.su || '—'}</td>}

                    <td style={{ ...tyylit.Td, ...tyylit.YhteensaSarake, textAlign: 'right', fontWeight: '900', color: '#1a1f2c', paddingRight: '12px', fontSize: '1.1em' }}>
                      {ampuja.tulos}
                    </td>

                    <td style={{ ...tyylit.Td, ...tyylit.RatkoSarake, textAlign: 'center', fontSize: '0.8em' }}>
                      <div style={tyylit.RatkoKontaineri}>
                        {ratkoNakyma.statusEtiketit.map((status) => (
                          <span key={`${ampuja.id}-${status}`} style={{ ...tyylit.StatusLabel, ...haeStatusLabelTyyli(status) }}>{status}</span>
                        ))}
                      </div>
                      {naytaRatko && ratkoNakyma.teksti && (
                        <div style={tyylit.RatkoTeksti}>
                          {ratkoNakyma.teksti}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* ISTUNNON/ERÄN TARKEMMAT TIEDOT LAAJENNUSVÄRITYKSELLÄ */}
                  {onAuki && ampuja.sarjat.length > 0 && (
                    <tr>
                      <td colSpan={sarakeMaara} style={tyylit.LaajennusSolu}>
                        <div style={tyylit.SarjaRuudukko}>
                          {ampuja.sarjat.map((s, sIdx) => {
                            // Verrataan laukauksen numeroa kisaspeksien maksimiin
                            const puhdistettuNumero = s.numero.replace(/\D/g, '');
                            const maksimiTulos = asemaMaksimit[puhdistettuNumero] || asemaMaksimit[s.numero];

                            const ampujaTulosNum = parseInt(s.tulos, 10);
                            const onkoMaksimiOsuma = !isNaN(ampujaTulosNum) && maksimiTulos !== undefined && ampujaTulosNum === maksimiTulos;

                            return (
                              <div
                                key={`${ampuja.id}-${s.numero}-${sIdx}`}
                                style={{
                                  ...tyylit.SarjaSolu,
                                  borderColor: onkoMaksimiOsuma ? teema.maksimiTulos.borderColor : '#dadce0',
                                  background: onkoMaksimiOsuma ? teema.maksimiTulos.background : teema.pintaValkoinen
                                }}
                              >
                                <div style={tyylit.SarjaSoluNumero}>S{s.numero}</div>
                                <div
                                  style={{
                                    ...tyylit.SarjaSoluArvo,
                                    color: onkoMaksimiOsuma ? teema.maksimiTulos.color : '#202124'
                                  }}
                                >
                                  {s.tulos}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const onMobiiliYhteys = typeof window !== 'undefined' && window.innerWidth < 600;

const tyylit = {
  Alue: { width: '100%', boxSizing: 'border-box' },
  Viesti: { padding: '20px', color: '#5f6368', textAlign: 'center', fontFamily: 'sans-serif' },
  SuodatinPalkki: { display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 2px 10px 2px', marginBottom: '4px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' },
  SuodatinNappi: { background: '#f1f3f4', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8em', fontWeight: '600', color: '#3c4043', cursor: 'pointer' },
  SuodatinNappiAktiivinen: { background: '#202124', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8em', fontWeight: '600', color: '#fff', cursor: 'pointer' },
  TaulukkoSäiliö: { width: '100%', maxWidth: '100%', overflowX: 'hidden', background: '#ffffff', borderRadius: '8px', border: '1px solid #e8eaed' },
  Taulukko: { width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontFamily: '-apple-system, sans-serif', fontSize: '0.85em' },
  OtsikkoRivi: { background: '#f8f9fa', borderBottom: '1px solid #e8eaed' },
  Th: { padding: '10px 6px', fontWeight: '700', color: '#5f6368', fontSize: '0.8em', textTransform: 'uppercase', textAlign: 'left' },
  DataRivi: { borderBottom: '1px solid #f1f3f4', cursor: 'pointer' },
  Td: { padding: '10px 6px', verticalAlign: 'middle', textAlign: 'left', overflow: 'hidden' },
  SijaSarake: { width: '35px', minWidth: '35px' },
  SuppeaSarake: { width: '45px', minWidth: '45px' },
  YhteensaSarake: { width: '55px', minWidth: '55px' },
  NimiSolu: { width: 'auto', overflow: 'hidden' },
  NimiTeksti: { fontWeight: '600', color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  RatkoSarake: { width: '100px', minWidth: '100px', padding: '4px 6px' },
  RatkoKontaineri: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', verticalAlign: 'middle' },
  RatkoTeksti: { color: '#1e293b', fontWeight: '700', fontSize: '0.95em', display: 'inline-block', verticalAlign: 'middle', fontFamily: 'monospace' },
  DesktopSarake: { display: onMobiiliYhteys ? 'none' : 'table-cell' },
  MobiiliAliTiedot: { display: onMobiiliYhteys ? 'block' : 'none', fontSize: '0.8em', color: '#70757a', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  MobiiliSarja: { fontWeight: 'bold', background: '#f1f3f4', padding: '1px 4px', borderRadius: '3px', marginRight: '4px', color: '#3c4043' },
  SarjaTag: { background: '#f1f3f4', color: '#3c4043', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', fontSize: '0.8em' },

  StatusLabel: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '0.75em',
    fontWeight: '800',
    letterSpacing: '0.03em',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    verticalAlign: 'middle'
  },
  LaajennusSolu: { background: '#f8f9fa', padding: '8px' },
  SarjaRuudukko: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  SarjaSolu: { background: '#ffffff', border: '1px solid #dadce0', borderRadius: '4px', textAlign: 'center', minWidth: '36px', padding: '2px 4px', transition: 'all 0.15s ease' },
  SarjaSoluNumero: { fontSize: '0.6em', color: '#70757a' },
  SarjaSoluArvo: { fontSize: '0.85em', fontWeight: '700' }
};
