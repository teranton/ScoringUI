const ALERT_STATUS_CODES = new Set(['DNS', 'DNF', 'DNQ', 'DQF', 'DQ', 'DSQ']);

export function isAlertStatusCode(status) {
  return ALERT_STATUS_CODES.has(String(status || '').trim().toUpperCase());
}

export function getStatusLabelToneClass(status) {
  if (isAlertStatusCode(status)) {
    return 'bg-[hsl(var(--card))] text-[hsl(var(--status-alert-fg))] ring-1 ring-[hsl(var(--status-alert-fg))/0.4]';
  }
  return 'bg-[hsl(var(--card))] text-[hsl(var(--status-neutral-fg))] ring-1 ring-[hsl(var(--status-neutral-fg))/0.32]';
}

export function getStatusLabelSizeClass({ compact = false } = {}) {
  if (compact) {
    return 'rounded px-1 py-0 text-[9px] font-semibold leading-none';
  }
  return 'rounded px-1.5 py-0.5 text-[10px] font-bold leading-none';
}
