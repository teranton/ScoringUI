// Ratkotapaukset henkilötulosten sijoitus- ja näyttölogiikan testaukseen.
// Testit: henkiloTulokset.test.js
//
// Uuden tapauksen lisääminen (esim. oikeasta kisasta):
//   nimi:              mitä tapaus testaa
//   sarja:             näkymän suodatin, 'OPEN (Y)' tai sarjan tunnus kuten 'V'
//   ratkoPalkintoSija: KISANSPEKSIT RATKO_PALKINTO_SIJA (montako palkintosijaa ratkotaan)
//   ampujat:           { id, sarja, tulos, ratko?, ratko2?, asemat? }
//                      asemat = asemakohtaiset tulokset järjestyksessä (eivät ratkaise tasatulosta)
//   odotettu:          näytettävä järjestys muodossa [id, sija, ratkoNakyy]
//                      ratkoNakyy = näytetäänkö ratkotulos kortissa / taulukossa
//   todo:              (valinnainen) selitys, jos odotettu käytös ei ole vielä toteutettu

export const ratkoTapaukset = [
  {
    nimi: 'OPEN: tasatulos 3. sijasta ratkaistaan ratkolla',
    sarja: 'OPEN (Y)',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100 },
      { id: 'B', sarja: 'Y', tulos: 99 },
      { id: 'C', sarja: 'Y', tulos: 98, ratko: '4' },
      { id: 'D', sarja: 'Y', tulos: 98, ratko: '5' },
      { id: 'E', sarja: 'Y', tulos: 90 }
    ],
    odotettu: [
      ['A', 1, false],
      ['B', 2, false],
      ['D', 3, true],
      ['C', 4, true],
      ['E', 5, false]
    ]
  },
  {
    nimi: 'OPEN: tasatulos palkintosijoilla ilman syötettyä ratkoa pysyy tasan',
    sarja: 'OPEN (Y)',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100 },
      { id: 'B', sarja: 'Y', tulos: 98 },
      { id: 'C', sarja: 'Y', tulos: 98 },
      { id: 'D', sarja: 'Y', tulos: 98 }
    ],
    odotettu: [
      ['A', 1, false],
      ['B', 2, false],
      ['C', 2, false],
      ['D', 2, false]
    ]
  },
  {
    nimi: 'OPEN: palkintosijojen ulkopuolinen ratko ei näy eikä riko tasatulosta',
    sarja: 'OPEN (Y)',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100 },
      { id: 'B', sarja: 'Y', tulos: 99 },
      { id: 'C', sarja: 'Y', tulos: 98 },
      { id: 'D', sarja: 'Y', tulos: 95, ratko: '3' },
      { id: 'E', sarja: 'Y', tulos: 95 }
    ],
    odotettu: [
      ['A', 1, false],
      ['B', 2, false],
      ['C', 3, false],
      ['D', 4, false],
      ['E', 4, false]
    ]
  },
  {
    nimi: 'OPEN: 5 palkintosijaa, tasatulos 4.-6. sijasta ratkotaan',
    sarja: 'OPEN (Y)',
    ratkoPalkintoSija: 5,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100 },
      { id: 'B', sarja: 'Y', tulos: 99 },
      { id: 'C', sarja: 'Y', tulos: 98 },
      { id: 'D', sarja: 'V', tulos: 97, ratko: '5' },
      { id: 'E', sarja: 'Y', tulos: 97, ratko: '3' },
      { id: 'F', sarja: 'Y', tulos: 97, ratko: '4' },
      { id: 'G', sarja: 'Y', tulos: 90 }
    ],
    odotettu: [
      ['A', 1, false],
      ['B', 2, false],
      ['C', 3, false],
      ['D', 4, true],
      ['F', 5, true],
      ['E', 6, true],
      ['G', 7, false]
    ]
  },
  {
    nimi: 'OPEN: tasainen 1. ratko ratkaistaan 2. ratkolla',
    sarja: 'OPEN (Y)',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100, ratko: '5', ratko2: '3' },
      { id: 'B', sarja: 'Y', tulos: 100, ratko: '5', ratko2: '4' },
      { id: 'C', sarja: 'Y', tulos: 99 }
    ],
    odotettu: [
      ['B', 1, true],
      ['A', 2, true],
      ['C', 3, false]
    ]
  },
  {
    nimi: 'OPEN: DNS ratkossa sijoittuu ratkon ampuneen taakse',
    sarja: 'OPEN (Y)',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100, ratko: 'DNS' },
      { id: 'B', sarja: 'Y', tulos: 100, ratko: '2' },
      { id: 'C', sarja: 'Y', tulos: 99 }
    ],
    odotettu: [
      ['B', 1, true],
      ['A', 2, false],
      ['C', 3, false]
    ]
  },
  {
    nimi: 'OPEN: tasainen ratko jää tasatulokseksi, viimeinen asema ei ratkaise (countbackia ei käytetä)',
    sarja: 'OPEN (Y)',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 50, ratko: '5', asemat: [25, 25] },
      { id: 'B', sarja: 'Y', tulos: 50, ratko: '5', asemat: [24, 26] },
      { id: 'C', sarja: 'Y', tulos: 40, asemat: [20, 20] }
    ],
    odotettu: [
      ['A', 1, true],
      ['B', 1, true],
      ['C', 3, false]
    ]
  },
  {
    // kisa-2025_17, sarja A: ratko 25 kaikilla kolmella, uusintaratkolle ei ollut aikaa -> jaettu 3. sija.
    nimi: 'Sarja A: kolmen tasainen ratko 3. sijasta pysyy tasan, seuraava sija 6.',
    sarja: 'A',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'A', tulos: 50, ratko: '24', asemat: [25, 25] },
      { id: 'B', sarja: 'A', tulos: 50, ratko: '23', asemat: [25, 25] },
      { id: 'C', sarja: 'A', tulos: 49, ratko: '25', asemat: [24, 25] },
      { id: 'D', sarja: 'A', tulos: 49, ratko: '25', asemat: [24, 25] },
      { id: 'E', sarja: 'A', tulos: 49, ratko: '25', asemat: [25, 24] },
      { id: 'F', sarja: 'A', tulos: 47, asemat: [24, 23] }
    ],
    odotettu: [
      ['A', 1, true],
      ['B', 2, true],
      ['C', 3, true],
      ['D', 3, true],
      ['E', 3, true],
      ['F', 6, false]
    ]
  },
  {
    nimi: 'Sarja V: OPEN-ratkoa ampunut ilman sarjan sisäistä tasatulosta, ratko ei näy',
    sarja: 'V',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100 },
      { id: 'B', sarja: 'Y', tulos: 99 },
      { id: 'C', sarja: 'Y', tulos: 98, ratko: '4' },
      { id: 'D', sarja: 'V', tulos: 98, ratko: '5' },
      { id: 'E', sarja: 'V', tulos: 90 }
    ],
    odotettu: [
      ['D', 1, false],
      ['E', 2, false]
    ]
  },
  {
    nimi: 'Sarja V: OPEN-ratkoa ampunut tasatuloksessa toisen V-ampujan kanssa',
    sarja: 'V',
    ratkoPalkintoSija: 3,
    ampujat: [
      { id: 'A', sarja: 'Y', tulos: 100 },
      { id: 'B', sarja: 'Y', tulos: 99 },
      { id: 'C', sarja: 'Y', tulos: 98, ratko: '4' },
      { id: 'D', sarja: 'V', tulos: 98, ratko: '5' },
      { id: 'E', sarja: 'V', tulos: 98 }
    ],
    odotettu: [
      ['D', 1, false],
      ['E', 1, false]
    ],
    todo: 'OPEN-ratko näkyy V-näkymässä ja ratkaisee V-sarjan tasatuloksen (nyt D 1. + ratko, E 2.)'
  }
];
