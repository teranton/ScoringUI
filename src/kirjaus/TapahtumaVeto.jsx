// Toimintahäiriö ja varoitus kirjausnäkymässä: tilarivin pyyhkäisy ylös (tai kahvan napautus) avaa isot napit
// NOLLA/OSUMA-rivin yläpuolelle, napautus muualle, pyyhkäisy alas tai kirjaus sulkee ne. Piilossa ne eivät vie tilaa eivätkä osu vahingossa.

import { haeTekstit } from '../i18n.js';

// Tilarivin kahva: näyttää, että rivin voi vetää ylös; napautus avaa tai sulkee.
export function VetoKahva({ auki, onClick, disabled, locale = 'fi' }) {
  const tx = haeTekstit('kirjausTapahtumat', locale);
  return (
    <button type="button" aria-label={auki ? tx.piilotaNapit : tx.naytaNapit} aria-expanded={auki}
      className="flex h-full shrink-0 items-center gap-1 rounded px-2 text-xs text-slate-500 active:bg-slate-200 disabled:opacity-30"
      disabled={disabled} onClick={onClick}>
      <span className="block h-1 w-6 rounded-full bg-slate-400" />
      <span>{auki ? '▾' : '▴'}</span>
    </button>
  );
}

// Isot napit: Häiriö (laskuri) ja Varoitus. Valinta sulkee paneelin, samoin napautus muualle: läpinäkyvä kerros
// napin alla ottaa napautuksen, joten se vain sulkee napit eikä esim. merkitse kiekkoa.
export function TapahtumaNapit({ hairioTeksti, onHairio, onVaroitus, onSulje, disabled, locale = 'fi' }) {
  const tx = haeTekstit('kirjausTapahtumat', locale);
  return (
    <>
    <div className="fixed inset-0 z-40" aria-hidden="true" data-testid="tapahtumanapit-tausta"
      onClick={onSulje} />
    <div className="relative z-50 mb-2 grid grid-cols-2 gap-2">
      <button type="button" className="h-14 rounded-lg border-2 border-amber-500 bg-amber-50 text-lg font-bold text-amber-900 active:bg-amber-200 disabled:opacity-30 sm:h-16"
        disabled={disabled} onClick={() => { onSulje(); onHairio(); }}>
        {hairioTeksti}
      </button>
      <button type="button" className="h-14 rounded-lg border-2 border-purple-600 bg-purple-50 text-lg font-bold text-purple-900 active:bg-purple-200 disabled:opacity-30 sm:h-16"
        disabled={disabled} onClick={() => { onSulje(); onVaroitus(); }}>
        {tx.varoitusNappi}
      </button>
    </div>
    </>
  );
}
