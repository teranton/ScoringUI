// Vercel Analytics ladataan laiskasti, jotta mainosten esto ei estä sovelluksen renderöintiä.
let analyticsTrack = null;

// Palauttaa peruutusfunktion (effectin siivous).
export function lataaAnalytiikka() {
  let isCancelled = false;

  import('@vercel/analytics')
    .then((module) => {
      if (isCancelled) return;
      analyticsTrack = typeof module?.track === 'function' ? module.track : null;
    })
    .catch(() => {
      analyticsTrack = null;
    });

  return () => {
    isCancelled = true;
  };
}

export function trackAnalyticsEvent(eventName, properties = {}) {
  try {
    if (typeof analyticsTrack === 'function') {
      analyticsTrack(eventName, properties);
    }
  } catch {
    // Ignore analytics tracking errors to avoid affecting UI behavior.
  }
}
