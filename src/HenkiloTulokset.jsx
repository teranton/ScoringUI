// src/HenkiloTulokset.jsx
import React, { useMemo, useState } from 'react';
import { parseCsvRows } from './utils/csv';
import {
  laskeHenkilosijoitukset,
  muodostaRatkoNakyma,
  parseAsemaSpeksitCsv
} from './utils/henkiloTulokset';
import { teema } from './teema'; // Varmista että teema on importattu

export default function HenkiloTulokset({ rawCsv, speksitCsv, kisaStatus }) {
  const [valittuAmpujaId, setValittuAmpujaId] = useState(null);
  const [sarjaSuodatin, setSarjaSuodatin] = useState('OPEN (Y)');

  // 1. Parsitaan asemakohtaiset speksit KISANSPEKSIT-datasta (asema, maksimi, toiseksi paras käytössä)
  const { asemaMaksimit, asemaToiseksiParasKaytossa } = useMemo(() => {
    return parseAsemaSpeksitCsv(speksitCsv);
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

  const onkoAliTulosPuuttuu = (arvo) => {
    const teksti = String(arvo ?? '').trim().toUpperCase();
    return teksti === '' || teksti === '-' || teksti === '—' || teksti === 'N/A';
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

      const osumaSarjat = [];
      for (let r = 1; r <= kisanRatojenMaara; r++) {
        const sarakkeenIndex = aloitusIndeksi + (r - 1);

        if (row[sarakkeenIndex] !== undefined) {
          osumaSarjat.push({
            numero: r.toString(),
            tulos: row[sarakkeenIndex] || '-'
          });
        }
      }

      const ampuja = {
        id: `${row[idxNimi] || 'ampuja'}|${idxSarja !== -1 ? row[idxSarja] || 'Y' : 'Y'}|${i}`,
        alkuperainenSija: row[idxSija] || i.toString(),
        nimi: row[idxNimi],
        sarja: idxSarja !== -1 ? row[idxSarja] : 'Y',
        seura: idxSeura !== -1 ? row[idxSeura] : '',
        tulos: row[idxTulos] || '0',
        la: idxLa !== -1 ? row[idxLa] : null,
        su: idxSu !== -1 ? row[idxSu] : null,
        ratko: idxRatko !== -1 ? row[idxRatko] : '',
        ratko2: idxRatko !== -1 ? row[idxRatko + 1] || '' : '',
        ratkoNaytto: muodostaRatkoNakyma(row[idxRatko] || '', idxRatko !== -1 ? row[idxRatko + 1] || '' : ''),
        sarjat: osumaSarjat
      };

      parsedAmpujat.push(ampuja);
      if (ampuja.sarja) sarjatSet.add(ampuja.sarja);
    }

    return { ampujat: parsedAmpujat, loydetytSarjat: sarjatSet };
  }, [idxLa, idxNimi, idxRatko, idxSarja, idxSeura, idxSija, idxSu, idxTulos, kisanRatojenMaara, aloitusIndeksi, rivit]);

  const naytettavatAmpujat = useMemo(() => laskeHenkilosijoitukset(ampujat, sarjaSuodatin), [ampujat, sarjaSuodatin]);
  const naytaRatkoSarake = naytettavatAmpujat.some((a) => a.ratkoNaytto?.statusEtiketit?.length > 0 || (sarjaSuodatin !== 'OPEN (Y)' || parseInt(a.laskettuSija, 10) <= 3) && a.ratkoNaytto?.teksti);

  const onkoAmpujaValmis = (ampuja) => {
    if (!ampuja?.sarjat || ampuja.sarjat.length === 0) return false;
    return ampuja.sarjat.every((s) => !onkoAliTulosPuuttuu(s.tulos));
  };

  const haeStatusLabelTyyli = (status) => {
    if (['DNS', 'DNF', 'DNQ', 'DSQ'].includes(status)) {
      return { background: teema.statusLabelTausta, color: teema.statusLabelTeksti };
    }

    return { background: teema.statusOletusTausta, color: teema.statusOletusTeksti };
  };

  const naytaValmiusIndikaattori = kisaStatus === 'kaynnissa';

  return (
    <div style={tyylit.Alue}>
      <div style={tyylit.SuodatinPalkki}>
        <button onClick={() => { setSarjaSuodatin('OPEN (Y)'); setValittuAmpujaId(null); }} style={sarjaSuodatin === 'OPEN (Y)' ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>OPEN (Y)</button>
        {Array.from(loydetytSarjat)
          .sort()
          .filter(sarja => sarja.toUpperCase() !== 'Y') // 👈 TÄMÄ RIVI POISTAA Y-NAPIN dynaamisesti
          .map(sarja => (
            <button key={sarja} onClick={() => { setSarjaSuodatin(sarja); setValittuAmpujaId(null); }} style={sarjaSuodatin === sarja ? tyylit.SuodatinNappiAktiivinen : tyylit.SuodatinNappi}>{sarja}</button>
          ))}
      </div>

      {/* KORVATTU TAULUKKO MODERNILLA KORTTILISTALLA */}
      <div style={tyylit.KorttiLista}>
        {naytettavatAmpujat.map((ampuja, index) => {
          const onAuki = valittuAmpujaId === ampuja.id;
          const ratkoNakyma = muodostaRatkoNakyma(ampuja.ratko, ampuja.ratko2);
          const naytaRatko = sarjaSuodatin !== 'OPEN (Y)' || parseInt(ampuja.laskettuSija, 10) <= 3;
          const ampujaValmis = onkoAmpujaValmis(ampuja);

          return (
            <div key={ampuja.id} style={tyylit.KorttiKapseli}>
              <div
                style={{
                  ...tyylit.KorttiRivi,
                  // Kortin tausta on nyt aina siisti valkoinen tai auki-tilan väri
                  background: onAuki ? teema.riviAuki : teema.pintaValkoinen || '#ffffff',
                  // Tehdään mitaliraita vasempaan reunaan suoraan sijoituksen mukaan
                  borderLeft: ampuja.laskettuSija === '1' ? `5px solid ${teema.kulta}`
                    : ampuja.laskettuSija === '2' ? `5px solid ${teema.hopea}`
                      : ampuja.laskettuSija === '3' ? `5px solid ${teema.pronssi}`
                        : '5px solid transparent', // Normaaliriveillä ei ole mitaliraitaa
                  // Pyöristetään vasen reuna nätisti raidan mukaisesti
                  borderTopLeftRadius: '8px',
                  borderBottomLeftRadius: '8px'
                }}
                onClick={() => setValittuAmpujaId(onAuki ? null : ampuja.id)}
              >
                {/* Sija */}
                <div style={tyylit.KorttiSija}>
                  {ampuja.laskettuSija}
                </div>

                {/* Nimi ja Seuratiedot dynaamisesti ilman katkeamista */}
                <div style={tyylit.KorttiInfo}>
                  <div style={tyylit.KorttiNimi}>
                    {ampuja.nimi}
                    {naytaValmiusIndikaattori && (
                      <span
                        style={{
                          ...tyylit.ValmiusPiste,
                          background: ampujaValmis ? teema.valmiusValmis : teema.valmiusPuuttuu
                        }}
                        title={ampujaValmis ? 'Kaikki alitulokset valmiit' : 'Alituloksia puuttuu'}
                      />
                    )}
                  </div>
                  <div style={tyylit.KorttiAlempiRivi}>
                    <span style={tyylit.SarjaTag}>{ampuja.sarja}</span>
                    <span style={tyylit.KorttiSeura}>{ampuja.seura || '—'}</span>
                  </div>
                </div>

                {/* Oikea laita: Tulos ja mahdollinen Ratko */}
                <div style={tyylit.KorttiOikea}>
                  <div style={tyylit.KorttiTulos}>{ampuja.tulos}</div>

                  {(ratkoNakyma.statusEtiketit.length > 0 || (naytaRatko && ratkoNakyma.teksti)) && (
                    <div style={tyylit.KorttiRatkoOsa}>
                      {ratkoNakyma.statusEtiketit.map((status) => (
                        <span key={`${ampuja.id}-${status}`} style={{ ...tyylit.StatusLabel, ...haeStatusLabelTyyli(status) }}>
                          {status}
                        </span>
                      ))}
                      {naytaRatko && ratkoNakyma.teksti && (
                        <span style={tyylit.RatkoTekstiInline}>{ratkoNakyma.teksti}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Asemien erittelyruudukko laajennuksena kortin alle */}
              {onAuki && ampuja.sarjat.length > 0 && (
                <div style={tyylit.KorttiLaajennus}>
                  <div style={tyylit.SarjaRuudukko}>
                    {ampuja.sarjat.map((s, sIdx) => {
                      const puhdistettuNumero = s.numero.replace(/\D/g, '');
                      const maksimiTulos = asemaMaksimit[puhdistettuNumero] || asemaMaksimit[s.numero];
                      const ampujaTulosNum = parseInt(s.tulos, 10);
                      const naytaToiseksiParas = Boolean(asemaToiseksiParasKaytossa[puhdistettuNumero] ?? asemaToiseksiParasKaytossa[s.numero]);
                      const onkoMaksimiOsuma = !isNaN(ampujaTulosNum) && maksimiTulos !== undefined && ampujaTulosNum === maksimiTulos;
                      const onkoToiseksiParasOsuma = !isNaN(ampujaTulosNum) && maksimiTulos !== undefined && naytaToiseksiParas && ampujaTulosNum === (maksimiTulos - 1);

                      return (
                        <div
                          key={`${ampuja.id}-${s.numero}-${sIdx}`}
                          style={tyylit.SarjaSolu}
                        >
                          <div style={tyylit.SarjaSoluNumero}>S{s.numero}</div>
                          <div
                            style={{
                              ...tyylit.SarjaSoluArvo,
                              ...(onkoMaksimiOsuma
                                ? teema.maksimiTulos
                                : onkoToiseksiParasOsuma
                                  ? teema.toiseksiParasTulos
                                  : {})
                            }}
                          >
                            {s.tulos}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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

  KorttiLista: { display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' },
  KorttiKapseli: {
    width: '100%',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e8eaed',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    background: '#ffffff'
  },
  KorttiRivi: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px 12px 12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    minHeight: '52px'
  },
  KorttiSija: {
    width: '36px',
    minWidth: '36px',
    height: '36px',
    fontWeight: '800',
    fontSize: '1.05em',
    color: '#3c4043',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '12px',
    borderRadius: '50%',
    background: '#f1f3f4'
  },
  KorttiInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, paddingRight: '8px' },
  KorttiNimi: { fontWeight: '700', fontSize: '1.05em', color: '#1a1f2c', whiteSpace: 'normal', wordBreak: 'break-word', display: 'flex', alignItems: 'center', gap: '6px' },
  KorttiAlempiRivi: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85em' },
  KorttiSeura: { color: '#5f6368', fontWeight: '500' },
  ValmiusPiste: { width: '9px', height: '9px', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' },
  SarjaTag: { background: '#f1f3f4', color: '#3c4043', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', fontSize: '0.85em' },
  KorttiOikea: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', minWidth: '80px' },
  KorttiTulos: { fontSize: '1.25em', fontWeight: '900', color: '#1a1f2c', lineHeight: '1' },
  KorttiRatkoOsa: { display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' },
  RatkoTekstiInline: { color: '#475569', fontWeight: '700', fontSize: '0.8em', fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' },
  KorttiLaajennus: { background: '#f8f9fa', padding: '12px', borderTop: '1px solid #e8eaed' },
  SarjaRuudukko: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  SarjaSolu: { background: '#ffffff', border: '1px solid #dadce0', borderRadius: '4px', textAlign: 'center', minWidth: '36px', padding: '2px 4px', transition: 'all 0.15s ease' },
  SarjaSoluNumero: { fontSize: '0.6em', color: '#70757a' },
  SarjaSoluArvo: { fontSize: '0.85em', fontWeight: '700' },

  StatusLabel: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '0.75em',
    fontWeight: '800',
    letterSpacing: '0.03em',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    verticalAlign: 'middle'
  }
};
