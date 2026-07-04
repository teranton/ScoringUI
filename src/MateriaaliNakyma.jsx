import { useMemo } from 'react';
import { parseCsvRows } from './utils/csv';
import { extractMaterialGuidesFromRows } from './utils/materials';
import EsikatseltavaMateriaali from './components/EsikatseltavaMateriaali';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';

function onkoPdfLinkki(urlArvo) {
  const teksti = String(urlArvo || '').trim();
  if (!teksti) return false;

  const lower = teksti.toLowerCase();
  if (lower.endsWith('.pdf')) return true;
  if (lower.includes('.pdf?')) return true;
  if (lower.includes('/export?format=pdf')) return true;
  if (lower.includes('format=pdf')) return true;
  if (lower.includes('mime=application/pdf')) return true;

  try {
    const parsed = new URL(teksti);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('drive.google.com')) {
      const pathname = parsed.pathname.toLowerCase();
      const hasPdfPath = pathname.endsWith('.pdf') || pathname.includes('.pdf/');
      const hasPdfQuery = parsed.searchParams.get('export') === 'download' && parsed.searchParams.get('format') === 'pdf';
      return hasPdfPath || hasPdfQuery;
    }
  } catch {
    // Invalid URL; rely on string heuristics above.
  }

  return false;
}

export default function MateriaaliNakyma({ specsCsv, locale = 'fi' }) {
  const tx = locale === 'en'
    ? {
      title: 'Official Notices & Instructions',
      empty: 'No additional instructions available.',
      pdf: 'PDF document',
      link: 'Website / Link',
      previewHint: 'Click to open preview'
    }
    : {
      title: 'Viralliset materiaalit ja ohjeet',
      empty: 'Ei lisäohjeita saatavilla.',
      pdf: 'PDF-dokumentti',
      link: 'Verkkosivu / Linkki',
      previewHint: 'Klikkaa avataksesi esikatselun'
    };

  const guides = useMemo(() => {
    if (!specsCsv) return [];

    return extractMaterialGuidesFromRows(parseCsvRows(specsCsv));
  }, [specsCsv]);

  if (guides.length === 0) {
    return (
      <div className="py-4 text-sm text-[hsl(var(--muted-foreground))]">
        {tx.empty}
      </div>
    );
  }

  const getIconType = (title) => {
    const t = String(title || '').toLowerCase();
    if (t.includes('kartta') || t.includes('map') || t.includes('saapuminen') || t.includes('paikka') || t.includes('location')) {
      return 'map';
    }
    return 'file';
  };

  return (
    <Card className="w-full shadow-sm border border-[hsl(var(--border))]">
      <CardHeader className="bg-[hsl(var(--muted))]/10 border-b py-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight text-[hsl(var(--foreground))]">
          {tx.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {guides.map((guide, idx) => {
            const isPdf = onkoPdfLinkki(guide.url);

            return (
              <EsikatseltavaMateriaali
                key={`${guide.url}-${idx}`}
                title={guide.title}
                url={guide.url}
                description={guide.description || tx.previewHint}
                typeLabel={isPdf ? tx.pdf : tx.link}
                iconType={getIconType(guide.title)}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}