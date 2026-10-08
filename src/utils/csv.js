// src/utils/csv.js

export function parseCsvRows(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (ch === '\r') {
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => String(cell || '').trim() !== ''));
}

export function hasCsvDataRows(csvText, minRows = 2) {
  return parseCsvRows(csvText).length >= minRows;
}

// CSV on virheellinen, jos se puuttuu, on liian lyhyt tai on HTML-sivu (esim. Googlen kirjautumissivu).
// Sisältöä ei etsitä sanoilla "error" tai "html", koska kelvollisessa datassa voi olla #ERROR!-soluja tai linkkejä.
export function onkoCsvVirheellinen(raw, minPituus) {
  if (!raw) return true;
  const teksti = String(raw).trim();
  return teksti.length < minPituus || /^<(!doctype|html|head|body)[\s>]/i.test(teksti);
}
