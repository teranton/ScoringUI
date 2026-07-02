function toText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return toText(value).toUpperCase();
}

function isGuideKey(value) {
  const key = normalizeKey(value);
  return key === 'OHJE'
    || key.startsWith('OHJE:')
    || key === 'GUIDE'
    || key.startsWith('GUIDE:');
}

function getSafeExternalUrl(rawUrl) {
  const value = toText(rawUrl);
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function getInlineTitleFromKey(key) {
  const text = toText(key);
  const separatorIndex = text.indexOf(':');
  if (separatorIndex === -1) return '';
  return text.slice(separatorIndex + 1).trim();
}

export function extractMaterialGuidesFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const guides = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;

    for (let i = 0; i < row.length - 1; i++) {
      const keyCell = row[i];
      if (!isGuideKey(keyCell)) continue;

      const followingCells = row.slice(i + 1).map(toText);
      const urlRelativeIndex = followingCells.findIndex((cell) => Boolean(getSafeExternalUrl(cell)));
      if (urlRelativeIndex === -1) continue;

      const url = getSafeExternalUrl(followingCells[urlRelativeIndex]);
      if (!url) continue;

      const textBeforeUrl = followingCells
        .slice(0, urlRelativeIndex)
        .filter(Boolean);

      const inlineTitle = getInlineTitleFromKey(keyCell);
      const title = inlineTitle || textBeforeUrl[0] || toText(keyCell);
      const description = inlineTitle
        ? (textBeforeUrl[0] || textBeforeUrl[1] || '')
        : (textBeforeUrl[1] || '');

      guides.push({
        title,
        description,
        url
      });
      break;
    }
  }

  return guides;
}
