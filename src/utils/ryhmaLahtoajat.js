// src/utils/ryhmaLahtoajat.js
// Ryhmien lähtöajat ryhmien muokkaukseen: kunkin ryhmän ensimmäinen aika kunakin päivänä aikataulu-välilehdiltä.
// Ryhmäaikataulu (Sporting/ESP): ajat ryhmänumeron mukaan. Compak-rata-ruudukko: ajat ampujanumeron mukaan,
// ja ryhmän aika on sen paikkojen numeroiden aikaisin aika. Aika kuuluu paikalle, ei ampujalle.
import { paivanOtsikko, parseAikatauluRyhmat } from './aikatauluRyhmat.js';
import { toSortValue } from './aikatauluRadat.js';

const numero = (arvo) => {
  const m = String(arvo ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

// Päivä tunnistetaan välilehdestä ja sen päiväosiosta, joten samannimiset välilehdet pysyvät eri päivinä.
function lisaa(kartta, avain, paiva, aika) {
  if (avain === null || !aika) return;
  if (!kartta.has(avain)) kartta.set(avain, new Map());
  const paivat = kartta.get(avain);
  const vanha = paivat.get(paiva.avain);
  if (!vanha || toSortValue(aika) < toSortValue(vanha.aika)) paivat.set(paiva.avain, { paiva: paiva.nimi, aika });
}

// aikataulut: [{ key, raw, label }] (App.jsx aikatauluCsvList). tx: aikatauluRyhma-tekstit (päivien nimet).
// Palauttaa { ryhmittain: Map<ryhmä, Map<päiväavain, { paiva, aika }>>, numeroittain: Map<numero, sama> }.
// Päivän nimi jätetään pois, kun aikataulussa on vain yksi päivä.
export function lueLahtoajat(aikataulut, ryhmittely, tx) {
  const ryhmittain = new Map();
  const numeroittain = new Map();
  const lista = (aikataulut || []).filter((a) => String(a?.raw || '').trim());
  const osiot = [];
  lista.forEach((valilehti, v) => {
    const jasennetty = parseAikatauluRyhmat(valilehti.raw, ryhmittely, tx);
    const paivaosiot = jasennetty.daySections || [];
    for (const osio of paivaosiot) {
      // Monen välilehden aikataulussa yhden päivän välilehti nimetään välilehden otsikolla.
      const nimi = lista.length > 1 && paivaosiot.length === 1 ? valilehti.label : paivanOtsikko(osio.label, tx);
      osiot.push({ avain: `${v}:${osio.key}`, nimi, osio, mode: jasennetty.mode, laneRows: jasennetty.laneRows });
    }
  });
  const yksiPaiva = osiot.length <= 1;
  for (const { avain, nimi, osio, mode, laneRows } of osiot) {
    const paiva = { avain, nimi: yksiPaiva ? '' : nimi };
    if (mode === 'combined-schedule') {
      for (const lahto of osio.heats || []) lisaa(ryhmittain, numero(lahto.groupLabel), paiva, lahto.time);
    } else if (mode === 'lane-grid') {
      for (const rivi of laneRows || []) {
        if (rivi.dayKey !== osio.key) continue;
        for (const ruutu of rivi.slots || []) {
          if (String(ruutu.shooter || '').trim()) lisaa(numeroittain, numero(ruutu.number), paiva, ruutu.time);
        }
      }
    }
  }
  return { ryhmittain, numeroittain };
}

// Ryhmän lähtöajat näytettäväksi: [{ paiva, aika }] päivien järjestyksessä.
export function ryhmanLahtoajat(lahtoajat, ryhma) {
  if (!lahtoajat) return [];
  const suoraan = lahtoajat.ryhmittain.get(ryhma.numero);
  const yhdistetty = new Map(suoraan || []);
  if (!suoraan) {
    for (const paikka of ryhma.paikat || []) {
      for (const [avain, lahto] of lahtoajat.numeroittain.get(numero(paikka.nro)) || []) {
        const vanha = yhdistetty.get(avain);
        if (!vanha || toSortValue(lahto.aika) < toSortValue(vanha.aika)) yhdistetty.set(avain, lahto);
      }
    }
  }
  return [...yhdistetty.values()];
}
