import { createRoot } from 'react-dom/client';
import './index.css';
import HenkiloTaulukko from './HenkiloTaulukko';
const n = Number(new URLSearchParams(location.search).get('radat') || 8);
const otsikot = ['Sija', 'Nimi', 'Sarja', 'Seura', 'La', 'Su', 'Tulos', ...Array.from({ length: n }, (_, i) => String(i + 1)), 'Ratko', ''];
const nimet = ['Matti Meikäläinen', 'Liisa Virtanen', 'Pekka Korhonen', 'Anna-Kaisa Nieminen'];
const seurat = ['Lahden Ampumaseura', 'SA', 'Etelä-Pohjanmaan Haulikkoampujat ry', 'HSA'];
const rivit = [otsikot, ...nimet.map((nimi, i) => {
  const erat = Array.from({ length: n }, (_, j) => String(25 - ((i + j) % 4)));
  const sum = erat.reduce((a, b) => a + Number(b), 0);
  return [String(i + 1), nimi, 'Y', seurat[i], '', '', String(sum), ...erat, '', ''];
})];
const csv = rivit.map((r) => r.join(',')).join('\n');
const maksimit = Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 25]));
createRoot(document.getElementById('root')).render(
  <div className="p-2"><HenkiloTaulukko data={{ henkilotCsvRaw: csv, speksitCsvRaw: '' }} parsedRows={{ henkilotRows: rivit }}
    parsedSpeksit={{ asemaMaksimit: maksimit, asemaToiseksiParasKaytossa: {}, ratkoPalkintoSija: 3 }} kisaStatus="kaynnissa" /></div>
);
