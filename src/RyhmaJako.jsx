// src/RyhmaJako.jsx
import { useState } from 'react';
import { ReactSortable } from 'react-sortablejs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Badge } from './components/ui/badge';

export default function RyhmaJako({ data, locale = 'fi' }) {
  const [erat, setErat] = useState(() => data?.erät || data?.ryhmat || []);

  const tx = locale === 'en'
    ? {
      loading: 'Loading heat data...',
      title: 'Heat Assignment',
      description: 'You can rearrange shooters between heats by dragging.',
      heat: 'Heat'
    }
    : {
      loading: 'Ladataan erätietoja...',
      title: 'Eräjako',
      description: 'Voit järjestellä ampujia erien välillä raahaamalla.',
      heat: 'Erä'
    };

  if (!data) return <div className="py-6 text-sm text-slate-500">{tx.loading}</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{tx.title}</CardTitle>
          <CardDescription>{tx.description}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {erat.map((erä, eräIndeksi) => (
          <Card key={eräIndeksi} className="overflow-hidden border-slate-200">
            <CardHeader className="flex-row items-center justify-between space-y-0 bg-slate-50 py-3">
              <CardTitle className="text-base">{erä.nimi || `${tx.heat} ${eräIndeksi + 1}`}</CardTitle>
              <Badge variant="default" className="bg-slate-200 text-slate-700">
                {(erä.ampujat || []).length}
              </Badge>
            </CardHeader>

            <CardContent className="p-3">
            <ReactSortable
              list={erä.ampujat || []}
              setList={(uusiLista) => {
                const paivitetytErät = [...erat];
                paivitetytErät[eräIndeksi].ampujat = uusiLista;
                setErat(paivitetytErät);
              }}
              group="ampujapooli"
              animation={150}
              className="flex min-h-[120px] flex-col gap-2"
            >
              {(erä.ampujat || []).map((ampuja, aIndeksi) => (
                <div
                  key={ampuja.nimi + aIndeksi}
                  className="flex cursor-grab items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{ampuja.nimi}</span>
                  <span className="text-xs font-semibold text-slate-500">{ampuja.sarja}</span>
                </div>
              ))}
            </ReactSortable>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}