// Kehitysaikainen suorituskykyloki. Päälle: ?perf=1, window.__SCORINGUI_PERF__ = true,
// localStorage 'scoringui:perf' = '1' tai VITE_SCORINGUI_PERF=1.

function tulkitseLippu(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

export function isPerfLoggingEnabled() {
  const envFlag = tulkitseLippu(import.meta.env?.VITE_SCORINGUI_PERF);

  if (typeof window === 'undefined') return envFlag === true;

  try {
    const qpFlag = tulkitseLippu(new URLSearchParams(window.location.search || '').get('perf'));
    if (qpFlag !== null) return qpFlag;
  } catch {
    // Ignore URL parsing failures.
  }

  if (window.__SCORINGUI_PERF__ === true) return true;
  if (window.__SCORINGUI_PERF__ === false) return false;

  try {
    const storedFlag = tulkitseLippu(window.localStorage?.getItem('scoringui:perf'));
    if (storedFlag !== null) return storedFlag;
  } catch {
    // Ignore storage access errors in restricted environments.
  }

  return envFlag === true;
}

// Aikaleima vain lokitusta varten; ei vaikuta renderöinnin tulokseen.
export function perfNow() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export function createPerfLogger(tag) {
  return function logPerf(scope, startTime, details = {}) {
    if (!isPerfLoggingEnabled() || typeof performance === 'undefined') return;
    const ms = performance.now() - startTime;
    console.log(`[${tag}] ${scope}: ${ms.toFixed(1)}ms`, details);
  };
}
