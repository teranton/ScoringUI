// src/Ilmoittautuneet.jsx
import { useMemo } from 'react';
import { parseCsvRows } from './utils/csv';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Badge } from './components/ui/badge';

export default function Ilmoittautuneet({ rawCsv, locale = 'fi', showCompetitionNumbers = false }) {
  const onkoRawTyhja = !rawCsv || rawCsv.trim().length < 10;

  const tx = locale === 'en'
    ? {
      title: 'Registered participants',
      description: 'This list will be hidden automatically once the competition starts.',
      classLabel: 'Class',
      shooters: 'shooters'
    }
    : {
      title: 'Ilmoittautuneet osallistujat',
      description: 'Tämä lista poistuu näkyvistä automaattisesti, kun kilpailu alkaa.',
      classLabel: 'Sarja',
      shooters: 'ampujaa'
    };

  const { ryhmitellytSarjat, kokonaismaara } = useMemo(() => {
    const raakaRivit = parseCsvRows(rawCsv || '');
    if (raakaRivit.length < 2) return { ryhmitellytSarjat: {}, kokonaismaara: 0 };

    // 1. Etsitään oikeat sarakkeet ensimmäiseltä riviltä tekstien perusteella
    const otsikot = raakaRivit[0].map((o) => String(o || '').toUpperCase().trim());
    const otsikotNormalisoitu = otsikot.map((o) => o.replace(/[^A-Z0-9]/g, ''));

    const etsiSarakkeenIndeksi = (ehdot) => {
      for (const ehto of ehdot) {
        const idx = otsikotNormalisoitu.findIndex((h) => ehto(h));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idxNimi = etsiSarakkeenIndeksi([(h) => h === 'NIMI', (h) => h.includes('NIMI')]);
    const idxSarja = etsiSarakkeenIndeksi([(h) => h === 'SARJA', (h) => h.includes('SARJA')]);
    const idxSeura = etsiSarakkeenIndeksi([(h) => h === 'SEURA', (h) => h.includes('SEURA')]);
    const idxKilpailuNumero = etsiSarakkeenIndeksi([
      (h) => h === 'KILPAILUNUMERO',
      (h) => h === 'KISA_NUMERO',
      (h) => h === 'NUMERO',
      (h) => h === 'NRO',
      (h) => h === 'BIB',
      (h) => h.includes('KILPAILUNUMERO'),
      (h) => h.includes('BIB'),
      (h) => h.includes('NUMERO')
    ]);

    // Jos otsikoita ei jostain syystä löydy lainkaan, käytetään varuiksi antamasi datan indeksejä (3, 4, 5)
    const lopullinenIdxNimi = idxNimi !== -1 ? idxNimi : 3;
    const lopullinenIdxSarja = idxSarja !== -1 ? idxSarja : 4;
    const lopullinenIdxSeura = idxSeura !== -1 ? idxSeura : 5;
    const lopullinenIdxKilpailuNumero = idxKilpailuNumero !== -1 ? idxKilpailuNumero : 2;

    const osallistujat = [];

    // 2. Käydään datarivit läpi (aloitetaan riviltä 1 otsikoiden jälkeen)
    for (let i = 1; i < raakaRivit.length; i++) {
      const row = raakaRivit[i];
      if (!row || row.length === 0) continue;

      const nimiArvo = String(row[lopullinenIdxNimi] || '').trim();
      const sarjaArvo = String(row[lopullinenIdxSarja] || '').trim() || 'Määrittelemätön';
      const seuraArvo = String(row[lopullinenIdxSeura] || '').trim();
      const kilpailuNumeroArvo = String(row[lopullinenIdxKilpailuNumero] || '').trim();

      // Ohitetaan tyhjät rivit tai otsikoiden "Päivitetty" apurivit
      if (!nimiArvo || nimiArvo.toLowerCase().includes('päivitetty')) continue;

      osallistujat.push({
        id: `${nimiArvo}-${sarjaArvo}-${i}`,
        nimi: nimiArvo,
        seura: seuraArvo,
        sarja: sarjaArvo,
        kilpailuNumero: kilpailuNumeroArvo
      });
    }

    // Järjestetään kaikki osallistujat sukunimen/nimen mukaan aakkosiin
    osallistujat.sort((a, b) => a.nimi.localeCompare(b.nimi, 'fi'));

    // Ryhmitellään sarjoittain
    const ryhmittely = {};
    osallistujat.forEach((o) => {
      if (!ryhmittely[o.sarja]) ryhmittely[o.sarja] = [];
      ryhmittely[o.sarja].push(o);
    });

    return { ryhmitellytSarjat: ryhmittely, kokonaismaara: osallistujat.length };
  }, [rawCsv]);

  if (onkoRawTyhja) return null;
  if (kokonaismaara === 0) return null;

  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-1 pb-4">
        <CardTitle className="text-xl">{tx.title} ({kokonaismaara})</CardTitle>
        <CardDescription>
          {tx.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {Object.keys(ryhmitellytSarjat).sort().map((sarja) => (
          <section key={sarja} className="space-y-2">
            <div className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-2">
              <h3 className="text-sm font-semibold text-slate-800">{tx.classLabel} {sarja}</h3>
              <Badge variant="default" className="bg-white text-slate-600">
                {ryhmitellytSarjat[sarja].length} {tx.shooters}
              </Badge>
            </div>

            <div className="divide-y divide-slate-100">
              {ryhmitellytSarjat[sarja].map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate font-medium text-slate-900">{o.nimi}</span>
                  <div className="flex shrink-0 items-center gap-2 text-slate-500">
                    {showCompetitionNumbers && o.kilpailuNumero && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                        {o.kilpailuNumero}
                      </span>
                    )}
                    <span>{o.seura || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}