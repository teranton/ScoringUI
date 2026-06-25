// src/JoukkueTulokset.jsx
import { useMemo, useState } from 'react';
import { teema } from './teema';
import { parseCsvRows } from './utils/csv';
import { tulkitseTotuusarvo } from './utils/henkiloTulokset';

export default function JoukkueTulokset({ data, kisaStatus }) {
  const [avatutJoukkueet, setAvatutJoukkueet] = useState({});

  // 1. HAETAAN KISASPEKSIT (Ratojen määrä ja asemakohtaiset maksimit)
// 1. HAETAAN KISASPEKSIT (Vain ne radat, joiden maksimi > 0)
  const speksit = useMemo(() => {
    const maksimit = {};
    const toiseksiParasKaytossa = {};
    let ratojenMaara = 0;

    if (data?.speksitCsvRaw) {
      try {
        const speksiRivit = parseCsvRows(data.speksitCsvRaw);
        speksiRivit.forEach((rivi) => {
          if (!rivi || rivi.length < 11) return;

          const raakaAsema = rivi[9];
          const raakaMaksimi = rivi[10];

          if (raakaAsema !== undefined && raakaAsema !== null && raakaMaksimi !== undefined && raakaMaksimi !== null) {
            const asemaTunnus = raakaAsema.toString().trim();
            const maksimiArvo = parseInt(raakaMaksimi, 10);
            const naytaToiseksiParas = tulkitseTotuusarvo(rivi[11]);

            // HUOMITAVAT RADAT: Aseman pitää olla olemassa ja maksimin pitää olla YLI nollan
            if (asemaTunnus && !isNaN(maksimiArvo) && maksimiArvo > 0) {
              const asemaNumero = asemaTunnus.replace(/\D/g, '');
              const avain = asemaNumero || asemaTunnus;
              maksimit[avain] = maksimiArvo;
              toiseksiParasKaytossa[avain] = naytaToiseksiParas;
              ratojenMaara++; // Kasvatetaan vain, jos kyseessä on oikea aktiivinen rata
            }
          }
        });
      } catch (e) {
        console.error("Virhe joukkue-speksien parsinnoissa:", e);
      }
    }

    return {
      asemaMaksimit: maksimit,
      asemaToiseksiParasKaytossa: toiseksiParasKaytossa,
      ratojenMaara: ratojenMaara > 0 ? ratojenMaara : 8 
    };
  }, [data]);

  const onkoAliTulosPuuttuu = (arvo) => {
    const teksti = String(arvo ?? '').trim().toUpperCase();
    return teksti === '' || teksti === '-' || teksti === '—' || teksti === 'N/A';
  };

  const onkoJoukkueValmis = (joukkue) => {
    if (!joukkue.ampujat || joukkue.ampujat.length === 0) return false;

    return joukkue.ampujat.every((ampuja) =>
      // Tarkistetaan valmius vain kisan todellisten ratojen osalta
      Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1).every(
        (n) => !onkoAliTulosPuuttuu(ampuja.erat[n])
      )
    );
  };

  const onkoDataPuuttuu = !data || !data.joukkueetCsvRaw;

  const toggleJoukkue = (joukkueNimi) => {
    setAvatutJoukkueet(prev => ({
      ...prev,
      [joukkueNimi]: !prev[joukkueNimi]
    }));
  };

  const { sarjat } = useMemo(() => {
    if (onkoDataPuuttuu) return { sarjat: {} };
    const raakaRivit = parseCsvRows(data.joukkueetCsvRaw);
    const parsedJoukkueet = [];
    let currentTeam = null;

    for (let i = 1; i < raakaRivit.length; i++) {
      const row = raakaRivit[i];
      if (!row || (!row[0] && !row[1] && !row[2])) continue;

      const ranking = row[0] || '';
      const teamName = row[1] || '';
      const shooterName = row[2] || '';
      const category = row[3] || '';
      // Tallennetaan erät dynaamisesti speksien ilmoittaman ratamäärän mukaan
// 1. Tallennetaan erät dynaamisesti speksien ilmoittaman ratamäärän mukaan
      const eratMap = {};
      let laskettuSumma = 0;
      let onkoPisteita = false;

      for (let col = 4; col <= 3 + speksit.ratojenMaara; col++) {
        const eraNum = col - 3;
        const arvo = row[col] !== undefined ? row[col] : "";
        eratMap[eraNum] = arvo;

        // Lasketaan vain numeeriset arvot mukaan summaan
        const p = parseInt(arvo, 10);
        if (!isNaN(p)) {
          laskettuSumma += p;
          onkoPisteita = true;
        }
      }

      // 2. Käytetään ensisijaisesti taulukon ilmoittamaa tulosta, 
      // mutta jos se puuttuu tai on "0", käytetään laskettua summaa.
      const raakaYhteistulos = row[28] || "";
      const lopullinenTulos = (raakaYhteistulos && raakaYhteistulos !== "0") 
        ? raakaYhteistulos 
        : (onkoPisteita ? laskettuSumma.toString() : "0");

      // 3. Luodaan tai päivitetään joukkueet ja ampujat
      if (teamName !== "" && shooterName === "") {
        if (currentTeam) parsedJoukkueet.push(currentTeam);
        currentTeam = {
          id: `${teamName}|${category}|${i}`,
          sijoitus: ranking,
          joukkue: teamName,
          sarja: category,
          kokonaistulos: lopullinenTulos,
          erat: eratMap,
          ampujat: []
        };
      } else if (shooterName !== "" && currentTeam) {
        currentTeam.ampujat.push({
          id: `${currentTeam.id}|${shooterName}|${currentTeam.ampujat.length}`,
          nimi: shooterName,
          sarja: category,
          kokonaistulos: lopullinenTulos,
          erat: eratMap
        });
      }
    }

    if (currentTeam) parsedJoukkueet.push(currentTeam);

    const ryhmitellytSarjat = {};
    parsedJoukkueet.forEach((j) => {
      if (!j.sarja) return;
      if (!ryhmitellytSarjat[j.sarja]) ryhmitellytSarjat[j.sarja] = [];
      ryhmitellytSarjat[j.sarja].push(j);
    });

    return { sarjat: ryhmitellytSarjat };
  }, [data, speksit.ratojenMaara, onkoDataPuuttuu]);

  if (onkoDataPuuttuu) {
    return <div style={tyylit.Lataus}>Ladataan tulosdataa...</div>;
  }

  const mitaliVarit = { 1: teema.kulta, 2: teema.hopea, 3: teema.pronssi };
  const naytaValmiusIndikaattori = kisaStatus === 'kaynnissa';

  // Apufunktio dynaamisen erätaulukon luomiseen ja solujen väritykseen
  const renderöiEräTaulukko = (erat, onkoYhteispisteet = false) => {
    // Luodaan lista radoista dynaamisesti (esim. [1, 2, 3, 4, 5, 6, 7, 8])
    const kaikkiRadat = Array.from({ length: speksit.ratojenMaara }, (_, i) => i + 1);
    
    // Jos ratoja on enemmän kuin 12 (kuten 24 erän kisoissa), jaetaan ne edelleen kahteen riviin mobiilia varten
    const rivit = speksit.ratojenMaara > 12 
      ? [kaikkiRadat.slice(0, 12), kaikkiRadat.slice(12)]
      : [kaikkiRadat];
    
    return (
      <div style={tyylit.TaulukkoSäiliö}>
        {rivit.map((rivi, rIdx) => (
          <table key={rIdx} style={tyylit.Taulukko}>
            <thead>
              <tr>
                <th style={tyylit.OtsikkoSoluMuted}>Rata</th>
                {rivi.map(n => <th key={n} style={tyylit.OtsikkoSolu}>{n}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tyylit.DataSoluMuted}>{onkoYhteispisteet ? 'Jok' : 'Pst'}</td>
                {rivi.map(n => {
                  const pisteArvo = erat[n] || '-';
                  const pisteNum = parseInt(pisteArvo, 10);
                  
                  // Tarkistetaan maksimi. Yhteispisteissä (joukkueen summa) ei väritetä yksittäistä maksimia
                  const maksimiTulos = speksit.asemaMaksimit[n] || speksit.asemaMaksimit[`${n}`];
                  const naytaToiseksiParas = Boolean(speksit.asemaToiseksiParasKaytossa[n] ?? speksit.asemaToiseksiParasKaytossa[`${n}`]);
                  const onkoMaksimi = !onkoYhteispisteet && !isNaN(pisteNum) && maksimiTulos !== undefined && pisteNum === maksimiTulos;
                  const onkoToiseksiParas = !onkoYhteispisteet && !isNaN(pisteNum) && maksimiTulos !== undefined && naytaToiseksiParas && pisteNum === (maksimiTulos - 1);

                  return (
                    <td 
                      key={n} 
                      style={{
                        ...tyylit.DataSolu,
                        ...(onkoMaksimi
                          ? teema.maksimiTulos
                          : onkoToiseksiParas
                            ? teema.toiseksiParasTulos
                            : {})
                      }}
                    >
                      {pisteArvo}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        ))}
      </div>
    );
  };

  return (
    <div style={tyylit.SivuSäiliö}>
      {Object.keys(sarjat).map(sarjaNimi => (
        <div key={sarjaNimi} style={{ marginBottom: '35px' }}>
          <h2 style={tyylit.SarjaOtsikko}>Sarja {sarjaNimi}</h2>
          
          <div style={tyylit.Lista}>
            {sarjat[sarjaNimi].map((joukkueAlkio, indeksi) => {
              
              const mitaliVari = mitaliVarit[joukkueAlkio.sijoitus || (indeksi + 1)];
              const onAuki = !!avatutJoukkueet[joukkueAlkio.joukkue];
              const joukkueValmis = onkoJoukkueValmis(joukkueAlkio);
              const jasenetTeksti = joukkueAlkio.ampujat.map(a => a.nimi).join(', ');

              const korttiDynaaminenTyyli = {
                borderLeft: mitaliVari ? `5px solid ${mitaliVari}` : `5px solid ${teema.paavari || '#1a4a75'}`
              };

              const sijoitusDynaaminenTyyli = {
                background: mitaliVari ? mitaliVari : teema.sijoitusFallbackTausta,
                color: mitaliVari ? teema.tekstiVaalea : teema.sijoitusFallbackTeksti,
                fontWeight: mitaliVari ? 'bold' : 'normal'
              };

              return (
                <div key={joukkueAlkio.id} style={{ ...tyylit.Kortti, ...korttiDynaaminenTyyli }}>
                  
                  <div onClick={() => toggleJoukkue(joukkueAlkio.joukkue)} style={tyylit.JoukkueRivi}>
                    <span style={{ ...tyylit.SijoitusPallo, ...sijoitusDynaaminenTyyli }}>
                      {joukkueAlkio.sijoitus}
                    </span>
                    <div style={tyylit.TekstiAlue}>
                      <span style={tyylit.JoukkueNimi}>
                        {joukkueAlkio.joukkue} <span style={tyylit.NuoliIcon}>{onAuki ? '▼' : '▶'}</span>
                        {naytaValmiusIndikaattori && (
                          <span
                            style={{
                              ...tyylit.ValmiusPiste,
                              background: joukkueValmis ? teema.valmiusValmis : teema.valmiusPuuttuu
                            }}
                            title={joukkueValmis ? 'Kaikki alitulokset valmiit' : 'Alituloksia puuttuu'}
                          />
                        )}
                      </span>
                      <span style={tyylit.JasenetLista}>{jasenetTeksti}</span>
                    </div>
                    <span style={tyylit.Pisteet}>{joukkueAlkio.kokonaistulos}</span>
                  </div>
                  
                  {onAuki && (
                    <div style={tyylit.AmpujatSektio}>
                      
                      <div style={tyylit.OsioLaatikko}>
                        <div style={tyylit.SektioOtsikko}>Joukkueen yhteispisteet</div>
                        {renderöiEräTaulukko(joukkueAlkio.erat, true)}
                      </div>

                      <div style={{ marginTop: '15px' }}>
                        <div style={tyylit.SektioOtsikko}>Ampujakohtaiset tulokset</div>
                        {joukkueAlkio.ampujat.map((ampuja) => (
                          <div key={ampuja.id} style={tyylit.AmpujaRiviLaatikko}>
                            <div style={tyylit.AmpujaYlaosa}>
                              <span style={tyylit.AmpujaNimi}>• {ampuja.nimi}</span>
                              <span style={tyylit.AmpujaYhteensa}>Yht: {ampuja.kokonaistulos}</span>
                            </div>
                            {renderöiEräTaulukko(ampuja.erat, false)}
                          </div>
                        ))}
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const tyylit = {
  SivuSäiliö: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222' },
  Lataus: { fontFamily: 'sans-serif', padding: '20px', color: '#666' },
  SarjaOtsikko: { fontSize: '1.3em', fontWeight: '700', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', maxWidth: '600px', marginBottom: '16px', color: '#111827' }, 
  Lista: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }, 
  Kortti: { background: '#ffffff', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }, 
  JoukkueRivi: { display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', userSelect: 'none', gap: '14px' }, 
  SijoitusPallo: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '0.9em', flexShrink: 0 },
  TekstiAlue: { flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }, 
  JoukkueNimi: { fontSize: '1.1em', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }, 
  ValmiusPiste: { width: '9px', height: '9px', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' },
  NuoliIcon: { fontSize: '0.7em', color: '#9ca3af' },
  JasenetLista: { fontSize: '0.85em', color: '#4b5563' }, 
  Pisteet: { width: '65px', textAlign: 'right', fontSize: '1.3em', fontWeight: '700', fontFamily: 'monospace' }, 
  AmpujatSektio: { padding: '14px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '12px' }, 
  OsioLaatikko: { background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e5e7eb' },
  AmpujaRiviLaatikko: { background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '8px' },
  AmpujaYlaosa: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  AmpujaNimi: { fontWeight: '600', color: '#374151', fontSize: '0.95em' },
  AmpujaYhteensa: { fontWeight: '700', color: '#111827', fontSize: '0.95em', fontFamily: 'monospace' },
  SektioOtsikko: { fontWeight: '600', marginBottom: '6px', fontSize: '0.75em', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' },
  TaulukkoSäiliö: { display: 'flex', flexDirection: 'column', gap: '6px', overflowX: 'auto' },
  Taulukko: { width: '100%', borderCollapse: 'collapse', marginTop: '2px', fontSize: '0.8em', fontFamily: 'monospace' },
  OtsikkoSolu: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', padding: '3px 2px', textAlign: 'center', fontWeight: '600', minWidth: '24px' },
  OtsikkoSoluMuted: { background: '#e5e7eb', color: '#4b5563', border: '1px solid #e5e7eb', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold', width: '36px' },
  DataSolu: { border: '1px solid #e5e7eb', padding: '3px 2px', textAlign: 'center', transition: 'all 0.15s ease' },
  DataSoluMuted: { background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', padding: '3px 4px', textAlign: 'center', fontSize: '0.8em' }
};