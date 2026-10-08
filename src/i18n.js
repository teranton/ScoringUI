// Jäädyttää tekstit, koska samaa oliota jaetaan kaikille komponenteille.
function jaadyta(olio) {
  Object.values(olio).forEach((arvo) => {
    if (arvo && typeof arvo === 'object') jaadyta(arvo);
  });
  return Object.freeze(olio);
}

// Käyttöliittymän suomen- ja englanninkieliset tekstit näkymittäin.
// Tekstit ovat vakioita, joten niitä ei rakenneta uudelleen jokaisella renderöinnillä.
const TEKSTIT = jaadyta({
  fi: {
    app: {
      appTitle: '🎯 T&T Tulospalvelu',
      appSubtitle: 'Tämänkin voi tehdä helpommin',
      contactLabel: 'Yhteys',
      loadingRegistry: 'Ladataan kilpailurekisteriä...',
      backHome: 'Etusivu',
      results: 'Tulokset',
      table: 'Taulukko',
      registrations: 'Ilmoittautuneet',
      timetable: 'Aikataulu',
      materials: 'Materiaalit',
      teamResults: 'Joukkuetulokset',
      themeLabel: 'Teema',
      themeDefault: 'Oletus',
      themeOcean: 'Meri',
      themeForest: 'Metsa',
      fetchingCompetitionData: 'Haetaan kilpailun tietoja...'
    },
    kisaStatus: {
      kaynnissa: 'Käynnissä',
      tauolla: 'Tauolla',
      paattynyt: 'Päättynyt',
      tulossa: 'Tulossa'
    },
    aikataulu: {
      title: 'Aikataulu',
      empty: 'Aikataulurivejä ei löytynyt.',
      lane: 'Rata',
      time: 'Aika',
      group: 'Ryhmä',
      end: 'Loppu',
      event: 'Tapahtuma',
      location: 'Paikka',
      notes: 'Lisätieto',
      shooters: 'ampujaa',
      noShootersOnLane: 'Ei ampujia tällä radalla.'
    },
    aikatauluHaku: {
      placeholder: 'Hae ampujaa...',
      results: 'Ampujan aikataulu',
      noResults: 'Ei osumia'
    },
    aikatauluMobiili: {
      lanes: 'Radat',
      largeTable: 'Taulukkonäkymä',
      hiddenMarkerTitle: 'Aloitustuomarointi.'
    },
    aikatauluTulostus: {
      button: 'Tulosta / PDF'
    },
    aikatauluRyhma: {
      title: 'Eräluettelo',
      empty: 'Ryhmäaikataulurivejä ei löytynyt.',
      heat: 'Erä',
      day: 'Päivä',
      group: 'Ryhmä',
      time: 'Aika',
      lane: 'Rata',
      classLabel: 'Sarja',
      clubLabel: 'Seura',
      noShooter: 'Ei ampujia tässä erässä.',
      number: 'Nro',
      shooter: 'Ampuja',
      searchPlaceholder: 'Hae ampujaa...',
      clear: 'Tyhjennä',
      noSearchResults: 'Haulla ei löytynyt ryhmää.',
      saturday: 'Lauantai',
      sunday: 'Sunnuntai',
      groupsTab: 'Ryhmät',
      orderTab: 'Järjestys',
      orderOnlyTitle: 'Ryhmien järjestys',
      noOrderRows: 'Järjestysrivejä ei löytynyt.',
      openGroup: 'Avaa ryhmänäkymä',
      openOrder: 'Avaa järjestysnäkymässä'
    },
    henkiloTaulukko: {
      loading: 'Ladataan taulukkodataa...',
      title: 'Kaikki tulokset taulukkona',
      normal: 'Normaali',
      compact: 'Kompakti',
      fullscreen: 'Koko näyttö',
      exitFullscreen: 'Poistu koko näytöstä',
      rank: 'Sija',
      name: 'Nimi',
      classLabel: 'Sarja',
      clubLabel: 'Seura',
      laLabel: 'La',
      suLabel: 'Su',
      total: 'Yht',
      allStagesReady: 'Kaikki alitulokset valmiit',
      stagesMissing: 'Alituloksia puuttuu',
      zoomReset: 'Nollaa zoom',
      showStageAnalytics: 'Rata-analyysi',
      hideStageAnalytics: 'Piilota analyysi',
      analyticsAvg: 'KA (n)',
      analyticsDetails: 'Md / Max%'
    },
    henkiloTulokset: {
      noResults: 'Ei henkilökohtaisia tuloksia saatavilla tai välilehteä ei löydy.',
      noData: 'Ei tulosdataa.',
      missingNameColumn: 'Virhe: NIMI-saraketta ei löytynyt taulukosta.',
      allStagesReady: 'Kaikki alitulokset valmiit',
      stagesMissing: 'Alituloksia puuttuu',
      day: 'Päivä',
      sort: 'Järjestä',
      total: 'Kokonaistulos',
      stage: 'Asema'
    },
    ilmoittautuneet: {
      title: 'Ilmoittautuneet osallistujat',
      description: 'Tämä lista poistuu näkyvistä automaattisesti, kun kilpailu alkaa.',
      classLabel: 'Sarja',
      shooters: 'ampujaa'
    },
    joukkueTulokset: {
      loading: 'Ladataan tulosdataa...',
      allClasses: 'Kaikki sarjat',
      lane: 'Rata',
      totalShort: 'Yht',
      pointsShort: 'Pst',
      classLabel: 'Sarja',
      allStagesReady: 'Kaikki alitulokset valmiit',
      stagesMissing: 'Alituloksia puuttuu',
      teamStageTotals: 'Joukkueen yhteispisteet',
      shooterBreakdown: 'Ampujakohtaiset tulokset',
      total: 'Yht'
    },
    materiaalit: {
      title: 'Viralliset materiaalit ja ohjeet',
      empty: 'Ei lisäohjeita saatavilla.',
      pdf: 'PDF-dokumentti',
      link: 'Verkkosivu / Linkki',
      previewHint: 'Klikkaa avataksesi linkin'
    },
    ryhmaJako: {
      loading: 'Ladataan erätietoja...',
      title: 'Eräjako',
      description: 'Voit järjestellä ampujia erien välillä raahaamalla.',
      heat: 'Erä'
    }
  },
  en: {
    app: {
      appTitle: '🎯 T&T Competition Results',
      appSubtitle: 'Live and archived competition results',
      contactLabel: 'Contact',
      loadingRegistry: 'Loading competition registry...',
      backHome: 'Homepage',
      results: 'Results',
      table: 'Table',
      registrations: 'Registrations',
      timetable: 'Timetable',
      materials: 'Materials',
      teamResults: 'Team Results',
      themeLabel: 'Theme',
      themeDefault: 'Default',
      themeOcean: 'Ocean',
      themeForest: 'Forest',
      fetchingCompetitionData: 'Fetching competition data...'
    },
    kisaStatus: {
      kaynnissa: 'Ongoing',
      tauolla: 'Paused',
      paattynyt: 'Ended',
      tulossa: 'Upcoming'
    },
    aikataulu: {
      title: 'Timetable',
      empty: 'No timetable rows found.',
      lane: 'Lane',
      time: 'Time',
      group: 'Group',
      end: 'End',
      event: 'Event',
      location: 'Location',
      notes: 'Notes',
      shooters: 'shooters',
      noShootersOnLane: 'No shooters on this lane.'
    },
    aikatauluHaku: {
      placeholder: 'Search shooter...',
      results: 'Shooter schedules',
      noResults: 'No matches found'
    },
    aikatauluMobiili: {
      lanes: 'Lanes',
      largeTable: 'Large table',
      hiddenMarkerTitle: 'Name contains hidden backend marker (U+200B).'
    },
    aikatauluTulostus: {
      button: 'Print / PDF'
    },
    aikatauluRyhma: {
      title: 'Heat Schedule',
      empty: 'No group schedule rows found.',
      heat: 'Heat',
      day: 'Day',
      group: 'Group',
      time: 'Time',
      lane: 'Lane',
      classLabel: 'Class',
      clubLabel: 'Club',
      noShooter: 'No shooters in this heat.',
      number: 'No.',
      shooter: 'Shooter',
      searchPlaceholder: 'Search shooter...',
      clear: 'Clear',
      noSearchResults: 'No matching group found.',
      saturday: 'Saturday',
      sunday: 'Sunday',
      groupsTab: 'Groups',
      orderTab: 'Order',
      orderOnlyTitle: 'Group Order',
      noOrderRows: 'No order rows found.',
      openGroup: 'Open group view',
      openOrder: 'Open in order view'
    },
    henkiloTaulukko: {
      loading: 'Loading table data...',
      title: 'All Results (Table)',
      normal: 'Normal',
      compact: 'Compact',
      fullscreen: 'Fullscreen Sheet',
      exitFullscreen: 'Exit Fullscreen',
      rank: 'Rank',
      name: 'Name',
      classLabel: 'Class',
      clubLabel: 'Club',
      laLabel: 'Sat',
      suLabel: 'Sun',
      total: 'Total',
      allStagesReady: 'All stage scores are complete',
      stagesMissing: 'Some stage scores are missing',
      zoomReset: 'Reset Zoom',
      showStageAnalytics: 'Stage Analytics',
      hideStageAnalytics: 'Hide Analytics',
      analyticsAvg: 'Avg (n)',
      analyticsDetails: 'Md / Max%'
    },
    henkiloTulokset: {
      noResults: 'No individual results available or sheet not found.',
      noData: 'No result data.',
      missingNameColumn: 'Error: NIMI column was not found in the table.',
      allStagesReady: 'All stage scores are complete',
      stagesMissing: 'Some stage scores are missing',
      day: 'Day',
      sort: 'Sort by',
      total: 'Total score',
      stage: 'Stage'
    },
    ilmoittautuneet: {
      title: 'Registered participants',
      description: 'This list will be hidden automatically once the competition starts.',
      classLabel: 'Class',
      shooters: 'shooters'
    },
    joukkueTulokset: {
      loading: 'Loading result data...',
      allClasses: 'All classes',
      lane: 'Lane',
      totalShort: 'Tot',
      pointsShort: 'Pts',
      classLabel: 'Class',
      allStagesReady: 'All stage scores are complete',
      stagesMissing: 'Some stage scores are missing',
      teamStageTotals: 'Team stage totals',
      shooterBreakdown: 'Shooter breakdown',
      total: 'Total'
    },
    materiaalit: {
      title: 'Official Notices & Instructions',
      empty: 'No additional instructions available.',
      pdf: 'PDF document',
      link: 'Website / Link',
      previewHint: 'Click to open the link'
    },
    ryhmaJako: {
      loading: 'Loading heat data...',
      title: 'Heat Assignment',
      description: 'You can rearrange shooters between heats by dragging.',
      heat: 'Heat'
    }
  }
});

// Palauttaa näkymän tekstit. Muu kuin 'en' tarkoittaa suomea, kuten ennenkin.
export function haeTekstit(nakyma, locale) {
  const kieli = locale === 'en' ? 'en' : 'fi';
  const tekstit = TEKSTIT[kieli][nakyma];
  if (!tekstit) throw new Error(`Tuntematon tekstiosio: ${nakyma}`);
  return tekstit;
}
