import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  muodostaRyhmaJarjestysTaulukko,
  muodostaYhdistetytRyhmaKortit,
  paivanOtsikko,
  parseAikatauluRyhmat,
  ryhmaKortinPaivaRivit,
  ryhmaKorttienPaivat,
  suodataNakyvatPaivaosiot
} from './utils/aikatauluRyhmat';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { haeTekstit } from './i18n';

function getGroupBadgeClass(groupIndex) {
  const classes = [
    'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/35',
    'bg-[hsl(var(--status-ready))]/12 text-[hsl(var(--status-ready))] border-[hsl(var(--status-ready))]/35',
    'bg-[hsl(var(--score-second-fg))]/12 text-[hsl(var(--score-second-fg))] border-[hsl(var(--score-second-fg))]/35',
    'bg-[hsl(var(--rank-3))]/14 text-[hsl(var(--rank-3))] border-[hsl(var(--rank-3))]/35'
  ];
  return classes[groupIndex % classes.length];
}

// Värit päivän järjestysnumeron mukaan (1. ja 2. kilpailupäivä), viikonpäivästä riippumatta
function getOrderDayClasses(dayNumber) {
  if (dayNumber === 1) {
    return {
      title: 'text-[hsl(var(--primary))]',
      container: 'border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/[0.03]',
      header: 'bg-[hsl(var(--badge-upcoming-bg))] text-[hsl(var(--badge-upcoming-fg))]'
    };
  }

  if (dayNumber === 2) {
    return {
      title: 'text-[hsl(var(--score-second-fg))]',
      container: 'border-[hsl(var(--score-second-fg))]/30 bg-[hsl(var(--score-second-fg))]/[0.03]',
      header: 'bg-[hsl(var(--badge-ongoing-bg))] text-[hsl(var(--badge-ongoing-fg))]'
    };
  }

  return {
    title: 'text-[hsl(var(--foreground))]',
    container: 'border-[hsl(var(--border))]/60 bg-transparent',
    header: 'bg-[hsl(var(--muted))]/15 text-[hsl(var(--muted-foreground))]'
  };
}

// Ryhmäkortin päiväsarakkeet päivän numeron mukaan: parittomat sinisiä, parilliset vihreitä
// (samat värit kuin järjestysnäkymässä, myös kun 1. päivä on piilotettu)
const PAIVA_SARAKE_LUOKAT = [
  {
    head: 'bg-[hsl(var(--badge-upcoming-bg))] text-[hsl(var(--badge-upcoming-fg))]',
    cell: 'bg-[hsl(var(--badge-upcoming-bg))]/35',
    empty: 'bg-[hsl(var(--badge-upcoming-bg))]/35 text-[hsl(var(--badge-upcoming-fg))]'
  },
  {
    head: 'bg-[hsl(var(--badge-ongoing-bg))] text-[hsl(var(--badge-ongoing-fg))]',
    cell: 'bg-[hsl(var(--badge-ongoing-bg))]/35',
    empty: 'bg-[hsl(var(--badge-ongoing-bg))]/35 text-[hsl(var(--badge-ongoing-fg))]'
  }
];

function getLayoutColumnClasses(layoutLabel, index) {
  const upper = String(layoutLabel || '').toUpperCase();
  const isOne = /(?:^|[^0-9])1(?:[^0-9]|$)/.test(upper);
  const isTwo = /(?:^|[^0-9])2(?:[^0-9]|$)/.test(upper);

  if (isOne) {
    return {
      head: 'bg-[hsl(var(--badge-upcoming-bg))]/70 text-[hsl(var(--badge-upcoming-fg))]',
      cell: 'bg-[hsl(var(--primary))]/[0.04]'
    };
  }

  if (isTwo) {
    return {
      head: 'bg-[hsl(var(--badge-ongoing-bg))]/70 text-[hsl(var(--badge-ongoing-fg))]',
      cell: 'bg-[hsl(var(--score-second-fg))]/[0.04]'
    };
  }

  const fallback = [
    {
      head: 'bg-[hsl(var(--status-neutral-bg))] text-[hsl(var(--status-neutral-fg))]',
      cell: 'bg-[hsl(var(--status-ready))]/[0.04]'
    },
    {
      head: 'bg-[hsl(var(--badge-paused-bg))] text-[hsl(var(--badge-paused-fg))]',
      cell: 'bg-[hsl(var(--rank-1))]/[0.05]'
    }
  ];

  return fallback[index % fallback.length];
}

export default function AikatauluRyhmaNakyma({ rawCsv, locale = 'fi', sponsorLogos = [], showGlobalSponsorLogos = true, defaultGroupingMode = 'group5', competitionStartDate = '' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [combinedTab, setCombinedTab] = useState('groups');
  const [focusedGroupKey, setFocusedGroupKey] = useState('');
  const [focusedOrderKey, setFocusedOrderKey] = useState('');
  const groupCardRefs = useRef(new Map());
  const orderButtonRefs = useRef(new Map());
  const tx = haeTekstit('aikatauluRyhma', locale);

  const muodostaOrderKey = (dayKey, time, layoutLabel, groupLabel) => {
    const day = String(dayKey || '').trim();
    const t = String(time || '').trim();
    const layout = String(layoutLabel || '').trim();
    const group = String(groupLabel || '').trim();
    return `${day}|${t}|${layout}|${group}`;
  };

  const parsed = useMemo(() => {
    return parseAikatauluRyhmat(rawCsv, defaultGroupingMode, tx);
  }, [rawCsv, defaultGroupingMode, tx]);

  const laneLogoMap = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(parsed.laneColumns) || sponsorLogos.length === 0) return map;

    parsed.laneColumns.forEach((lane) => {
      const laneText = String(lane?.label || '').trim().toUpperCase();
      if (!laneText) {
        map.set(lane?.label || '', null);
        return;
      }

      const match = sponsorLogos.find((logo) => {
        const logoKey = String(logo?.alt || '').trim().toUpperCase();
        if (!logoKey) return false;
        return laneText.includes(logoKey);
      }) || null;

      map.set(lane.label, match);
    });

    return map;
  }, [parsed.laneColumns, sponsorLogos]);

  const globalSponsorLogos = useMemo(() => {
    if (!showGlobalSponsorLogos) return [];
    return sponsorLogos.filter((logo) => {
      const logoKey = String(logo?.alt || '').trim().toUpperCase();
      if (!logoKey) return true;
      return !parsed.laneColumns?.some((lane) => String(lane?.label || '').toUpperCase().includes(logoKey));
    });
  }, [parsed.laneColumns, sponsorLogos, showGlobalSponsorLogos]);

  const visibleDaySections = useMemo(() => {
    return suodataNakyvatPaivaosiot(parsed.daySections, parsed.mode, competitionStartDate);
  }, [parsed.daySections, parsed.mode, competitionStartDate]);

  const title = parsed.titleSuffix ? `${tx.title} | ${parsed.titleSuffix}` : tx.title;
  const naytaSarjaSarake = visibleDaySections.some((section) =>
    (section.heats || []).some((heat) => (heat.shooters || []).some((shooter) => Boolean(shooter.className)))
  );
  const naytaSeuraSarake = visibleDaySections.some((section) =>
    (section.heats || []).some((heat) => (heat.shooters || []).some((shooter) => Boolean(shooter.club || shooter.lane)))
  );
  const yhdistetytRyhmaKortit = useMemo(() => {
    return muodostaYhdistetytRyhmaKortit(parsed.mode, visibleDaySections);
  }, [parsed.mode, visibleDaySections]);
  const korttiPaivat = useMemo(() => ryhmaKorttienPaivat(yhdistetytRyhmaKortit), [yhdistetytRyhmaKortit]);
  const korttienPaivaRivit = useMemo(
    () => new Map(yhdistetytRyhmaKortit.map((kortti) => [kortti.key, ryhmaKortinPaivaRivit(kortti.scheduleRows, korttiPaivat)])),
    [yhdistetytRyhmaKortit, korttiPaivat]
  );
  const filteredYhdistetytRyhmaKortit = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return yhdistetytRyhmaKortit;
    return yhdistetytRyhmaKortit.filter((group) =>
      (group.shooters || []).some((shooter) => String(shooter.shooter || '').toLowerCase().includes(query))
    );
  }, [yhdistetytRyhmaKortit, searchQuery]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  useLayoutEffect(() => {
    if (combinedTab !== 'groups' || !focusedGroupKey) return;
    let raf1 = 0;
    let raf2 = 0;

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        const el = groupCardRefs.current.get(focusedGroupKey);
        if (!el) return;
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    });

    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [combinedTab, focusedGroupKey, filteredYhdistetytRyhmaKortit]);

  const ryhmaJarjestysTaulukko = useMemo(() => {
    return muodostaRyhmaJarjestysTaulukko(parsed.mode, visibleDaySections);
  }, [parsed.mode, visibleDaySections]);

  useLayoutEffect(() => {
    if (combinedTab !== 'order' || !focusedOrderKey) return;
    let raf1 = 0;
    let raf2 = 0;

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        const el = orderButtonRefs.current.get(focusedOrderKey);
        if (!el) return;
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      });
    });

    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [combinedTab, focusedOrderKey, ryhmaJarjestysTaulukko]);

  // Hookit kutsuttava ennen tätä, jotta niiden järjestys pysyy samana joka renderöinnissä.
  if (!visibleDaySections.length) {
    return <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{tx.empty}</div>;
  }

  const avaaRyhmanakyma = (groupLabel) => {
    const key = `group-${groupLabel}`;
    setSearchQuery('');
    setFocusedGroupKey(key);

    if (combinedTab === 'groups') {
      const el = groupCardRefs.current.get(key);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      return;
    }

    setCombinedTab('groups');
  };

  const avaaJarjestysNakyma = (slot, groupLabel) => {
    if (!slot) return;
    const orderKey = muodostaOrderKey(slot.dayKey, slot.time, slot.layoutLabel, groupLabel);
    setFocusedOrderKey(orderKey);

    if (combinedTab === 'order') {
      const el = orderButtonRefs.current.get(orderKey);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }
      return;
    }

    setCombinedTab('order');
  };

  return (
    <div className="space-y-3">
      <Card className="w-full shadow-sm">
        <CardHeader className="pb-3 bg-[hsl(var(--muted))]/20 border-b">
          <div className="flex items-center gap-3">
            <CardTitle className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</CardTitle>
            {showGlobalSponsorLogos && globalSponsorLogos.length > 0 && (
              <div className="flex max-w-[62%] shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {globalSponsorLogos.map((logo, idx) => (
                  logo.href ? (
                    <a key={`group-sponsor-global-${idx}`} href={logo.href} target="_blank" rel="noopener noreferrer" className="flex items-center hover:opacity-75 transition-opacity">
                      <img
                        src={logo.src}
                        alt={logo.alt}
                        loading="lazy"
                        decoding="async"
                        className="h-6 max-w-[84px] object-contain opacity-90"
                      />
                    </a>
                  ) : (
                    <img
                      key={`group-sponsor-global-${idx}`}
                      src={logo.src}
                      alt={logo.alt}
                      loading="lazy"
                      decoding="async"
                      className="h-6 max-w-[84px] object-contain opacity-90"
                    />
                  )
                ))}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-3 md:p-4">
          {parsed.mode === 'combined-schedule' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCombinedTab('groups');
                    setFocusedGroupKey('');
                    setFocusedOrderKey('');
                  }}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${combinedTab === 'groups' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                >
                  {tx.groupsTab}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCombinedTab('order');
                    setFocusedGroupKey('');
                    setFocusedOrderKey('');
                  }}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${combinedTab === 'order' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
                >
                  {tx.orderTab}
                </button>
              </div>

              {combinedTab === 'groups' && (
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder={tx.searchPlaceholder}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 pr-20 text-sm text-[hsl(var(--foreground))] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/50"
                  />
                  {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-[hsl(var(--muted))]/50 px-1.5 py-0.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    {tx.clear}
                  </button>
                  )}
                </div>
              )}

              {combinedTab === 'groups' && filteredYhdistetytRyhmaKortit.length === 0 ? (
                <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-3 py-5 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  {tx.noSearchResults}
                </div>
              ) : combinedTab === 'groups' ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredYhdistetytRyhmaKortit.map((group) => {
                const paivaRivit = korttienPaivaRivit.get(group.key) || [];

                return (
                <article
                  key={group.key}
                  ref={(node) => {
                    if (node) groupCardRefs.current.set(group.key, node);
                    else groupCardRefs.current.delete(group.key);
                  }}
                  className={`overflow-hidden rounded-xl border bg-[hsl(var(--card))] shadow-sm ${focusedGroupKey === group.key ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]/20' : 'border-[hsl(var(--border))]'}`}
                >
                  <header className="border-b border-[hsl(var(--border))]/60 px-3 py-2 bg-[hsl(var(--muted))]/20">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[hsl(var(--foreground))]">
                        {tx.group} {group.groupLabel}
                      </h3>
                    </div>
                  </header>

                  <div className="border-b border-[hsl(var(--border))]/45 px-3 py-2">
                    <div className="overflow-hidden">
                      <table className="w-full table-fixed border-collapse text-[11px] md:text-xs">
                        <thead>
                          <tr>
                            {korttiPaivat.map((paiva) => (
                              <th key={paiva.dayNumber} className={`${PAIVA_SARAKE_LUOKAT[(paiva.dayNumber + 1) % 2].head} px-1.5 py-1 text-left font-semibold md:px-2`}>
                                {paivanOtsikko(paiva.dayLabel, tx)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paivaRivit.length === 0 ? (
                            <tr className="border-t border-[hsl(var(--border))]/45">
                              {korttiPaivat.map((paiva) => (
                                <td key={paiva.dayNumber} className={`${PAIVA_SARAKE_LUOKAT[(paiva.dayNumber + 1) % 2].empty} px-1.5 py-1.5 md:px-2`}>-</td>
                              ))}
                            </tr>
                          ) : (
                            paivaRivit.map((rivi, idx) => (
                              <tr key={`${group.key}-day-${idx}`} className="border-t border-[hsl(var(--border))]/45">
                                {rivi.map((slot, d) => (
                                  <td key={korttiPaivat[d].dayNumber} className={`${PAIVA_SARAKE_LUOKAT[(korttiPaivat[d].dayNumber + 1) % 2].cell} px-1.5 py-1.5 align-top md:px-2`}>
                                    {slot ? (
                                      <button
                                        type="button"
                                        onClick={() => avaaJarjestysNakyma(slot, group.groupLabel)}
                                        className="w-full truncate text-left text-[10px] leading-tight text-[hsl(var(--foreground))] hover:underline md:text-[11px]"
                                        title={tx.openOrder}
                                      >
                                        <span className="font-semibold">{slot.time || '—'}</span>
                                        <span className="text-[hsl(var(--muted-foreground))]">{` · ${slot.layoutLabel || '—'}`}</span>
                                      </button>
                                    ) : (
                                      <span className="text-[hsl(var(--muted-foreground))]">-</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--muted))]/15 text-[hsl(var(--muted-foreground))]">
                          <th className="w-12 px-2 py-1 text-left font-semibold">{tx.number}</th>
                          <th className="px-2 py-1 text-left font-semibold">{tx.shooter}</th>
                          {naytaSarjaSarake && <th className="w-14 px-2 py-1 text-left font-semibold">{tx.classLabel}</th>}
                          {naytaSeuraSarake && <th className="w-16 px-2 py-1 text-left font-semibold">{tx.clubLabel}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {group.shooters.map((shooter, idx) => {
                          const highlighted = normalizedSearchQuery
                            && String(shooter.shooter || '').toLowerCase().includes(normalizedSearchQuery);
                          return (
                          <tr key={`${group.key}-shooter-${idx}`} className={`border-t border-[hsl(var(--border))]/45 ${highlighted ? 'bg-[hsl(var(--primary))]/10' : ''}`}>
                            <td className="px-2 py-1.5 font-mono">{shooter.number || '-'}</td>
                            <td translate="no" className="px-2 py-1.5 font-medium text-[hsl(var(--foreground))]">{shooter.shooter}</td>
                            {naytaSarjaSarake && <td translate="no" className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">{shooter.className || '—'}</td>}
                            {naytaSeuraSarake && <td translate="no" className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">{shooter.club || '—'}</td>}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
                );
              })}
            </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                  <div className="border-b border-[hsl(var(--border))]/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {tx.orderOnlyTitle}
                  </div>
                  {ryhmaJarjestysTaulukko.dayTables.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">{tx.noOrderRows}</div>
                  ) : (
                    <div className="space-y-4 p-3">
                      {ryhmaJarjestysTaulukko.dayTables.map((dayTable) => {
                        const dayClasses = getOrderDayClasses(dayTable.dayNumber);
                        return (
                        <section key={dayTable.key} className="space-y-2">
                          <h4 className={`text-sm font-semibold ${dayClasses.title}`}>{dayTable.dayLabel}</h4>
                          <div className={`overflow-x-auto rounded-lg border ${dayClasses.container}`}>
                            <table className="w-full min-w-[520px] border-collapse text-xs">
                              <thead>
                                <tr className={dayClasses.header}>
                                  <th className="w-20 px-2 py-1 text-left font-semibold">{tx.time}</th>
                                  {dayTable.layouts.map((layoutLabel, layoutIndex) => {
                                    const layoutClasses = getLayoutColumnClasses(layoutLabel, layoutIndex);
                                    return (
                                    <th key={`${dayTable.key}-${layoutLabel}`} className={`px-2 py-1 text-left font-semibold ${layoutClasses.head}`}>{layoutLabel}</th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {dayTable.rows.length === 0 ? (
                                  <tr className="border-t border-[hsl(var(--border))]/45">
                                    <td colSpan={Math.max(2, dayTable.layouts.length + 1)} className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">-</td>
                                  </tr>
                                ) : (
                                  dayTable.rows.map((row, idx) => (
                                    <tr key={`${dayTable.key}-order-${idx}`} className="border-t border-[hsl(var(--border))]/45">
                                      <td className="px-2 py-1.5 font-semibold text-[hsl(var(--foreground))]">{row.time || '—'}</td>
                                      {row.layouts.map((layoutCell, layoutIndex) => {
                                        const layoutClasses = getLayoutColumnClasses(layoutCell.layoutLabel, layoutIndex);
                                        return (
                                        <td key={`${dayTable.key}-${row.time}-${layoutCell.layoutLabel}`} className={`px-2 py-1.5 ${layoutClasses.cell}`}>
                                          {layoutCell.groups.length > 0
                                            ? (
                                              <div className="flex flex-wrap gap-1">
                                                {layoutCell.groups.map((groupLabel, groupIdx) => {
                                                  const orderKey = muodostaOrderKey(dayTable.key, row.time, layoutCell.layoutLabel, groupLabel);
                                                  const highlighted = focusedOrderKey === orderKey;
                                                  return (
                                                  <button
                                                    key={`${dayTable.key}-${row.time}-${layoutCell.layoutLabel}-${groupLabel}-${groupIdx}`}
                                                    type="button"
                                                    onClick={() => avaaRyhmanakyma(groupLabel)}
                                                    ref={(node) => {
                                                      if (node) orderButtonRefs.current.set(orderKey, node);
                                                      else orderButtonRefs.current.delete(orderKey);
                                                    }}
                                                    className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${highlighted ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]/30' : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/45 hover:bg-[hsl(var(--primary))]/10'}`}
                                                    title={tx.openGroup}
                                                  >
                                                    {tx.group} {groupLabel}
                                                  </button>
                                                  );
                                                })}
                                              </div>
                                            )
                                            : '-'}
                                        </td>
                                        );
                                      })}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
          <div className="space-y-4">
            {visibleDaySections.map((section) => (
              <section key={section.key} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{section.label}</h3>
                {(section.sessionSections || [{ key: `${section.key}-all`, label: '', shortLabel: '', heats: section.heats }]).map((session) => (
                  <div key={session.key} className="space-y-2">
                    {session.shortLabel && session.shortLabel !== section.label && (
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{session.shortLabel}</h4>
                    )}
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {session.heats.map((heat) => (
                    <article key={heat.id} className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                      <header className="border-b border-[hsl(var(--border))]/60 px-3 py-2 bg-[hsl(var(--muted))]/20">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[hsl(var(--foreground))]">
                            {parsed.mode === 'combined-schedule'
                              ? `${heat.layoutLabel || tx.heat}${heat.time ? ` - ${heat.time}` : ''}`
                              : `${tx.heat} ${heat.heatNumber}${heat.time ? ` - ${heat.time}` : ''}`}
                          </h3>
                          <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${getGroupBadgeClass(heat.groupIndex)}`}>
                            {tx.group} {heat.groupLabel ?? (heat.groupIndex + 1)}
                          </span>
                        </div>
                      </header>

                      {heat.shooters.length === 0 ? (
                        <div className="px-3 py-3 text-xs italic text-[hsl(var(--muted-foreground))]">{tx.noShooter}</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-xs">
                            <thead>
                              <tr className="bg-[hsl(var(--muted))]/15 text-[hsl(var(--muted-foreground))]">
                                <th className="w-12 px-2 py-1 text-left font-semibold">{tx.number}</th>
                                <th className="px-2 py-1 text-left font-semibold">{tx.shooter}</th>
                                {naytaSarjaSarake && <th className="w-14 px-2 py-1 text-left font-semibold">{tx.classLabel}</th>}
                                {naytaSeuraSarake && <th className="w-16 px-2 py-1 text-left font-semibold">{parsed.mode === 'combined-schedule' || parsed.mode === 'group-sheet' ? tx.clubLabel : tx.lane}</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {heat.shooters.map((shooter, idx) => {
                                const laneLogo = laneLogoMap.get(shooter.lane);
                                const highlighted = normalizedSearchQuery
                                  && String(shooter.shooter || '').toLowerCase().includes(normalizedSearchQuery);
                                return (
                                  <tr key={`${heat.id}-row-${idx}`} className={`border-t border-[hsl(var(--border))]/45 ${highlighted ? 'bg-[hsl(var(--primary))]/10' : ''}`}>
                                    <td className="px-2 py-1.5 font-mono">{shooter.number || '-'}</td>
                                    <td translate="no" className="px-2 py-1.5 font-medium text-[hsl(var(--foreground))]">{shooter.shooter}</td>
                                    {naytaSarjaSarake && <td translate="no" className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">{shooter.className || '—'}</td>}
                                    {naytaSeuraSarake && <td className="px-2 py-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span translate="no" className="truncate">{shooter.club || shooter.lane || '-'}</span>
                                        {(!shooter.club && laneLogo) && (
                                          laneLogo.href ? (
                                            <a href={laneLogo.href} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:opacity-75 transition-opacity">
                                              <img src={laneLogo.src} alt={laneLogo.alt} loading="lazy" decoding="async" className="h-4 max-w-[46px] object-contain opacity-80" />
                                            </a>
                                          ) : (
                                            <img src={laneLogo.src} alt={laneLogo.alt} loading="lazy" decoding="async" className="h-4 max-w-[46px] object-contain opacity-80 shrink-0" />
                                          )
                                        )}
                                      </div>
                                    </td>}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </article>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
