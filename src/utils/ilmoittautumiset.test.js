import test from 'node:test';
import assert from 'node:assert/strict';

import {
  helsinginHetki, ilmoittautumisenTakaraja, lahdeSarake, lahteenIlmoittautuneet, lisattavatIlmoittautuneet, lomakkeenNimi,
  lomakkeenSarjat, lomakkeenTila, nimiAvain, tarkistaLomake
} from './ilmoittautumiset.js';

test('lahdeSarake tunnistaa nimen, sarjan, seuran ja siirtomerkinnän, muut sarakkeet eivät lähde', () => {
  assert.equal(lahdeSarake('NIMI'), 'nimi');
  assert.equal(lahdeSarake('Nimi (sukunimi etunimi)'), 'nimi');
  assert.equal(lahdeSarake('Kilpailijan nimi'), 'nimi');
  assert.equal(lahdeSarake('Sukunimi'), 'sukunimi');
  assert.equal(lahdeSarake('Etunimi'), 'etunimi');
  assert.equal(lahdeSarake('Sarja'), 'sarja');
  assert.equal(lahdeSarake('SEURA'), 'seura');
  assert.equal(lahdeSarake('SIIRRETTY'), 'siirretty');
  for (const muu of ['Sportti-ID', 'HUOM', 'TUOMARIKORTTI', 'Sähköpostiosoite', 'Puhelin', 'Lisätietoja', 'Aikaleima', 'Seuran yhteyshenkilö', 'Joukkueen nimi', '']) {
    assert.equal(lahdeSarake(muu), null, muu);
  }
});

test('lahteenIlmoittautuneet: Suomisport-tuonti, Google-lomake suku- ja etunimellä, siirretyt pois', () => {
  const suomisport = 'Sportti-ID,NIMI,SARJA,SEURA,HUOM\n1,Saastamoinen Juho,Y,KajA,Tarkista maksu\n2,,Y,X,\n3,7,Y,X,';
  assert.deepEqual(lahteenIlmoittautuneet(suomisport), [{ nimi: 'Saastamoinen Juho', sarja: 'Y', seura: 'KajA' }]);
  const lomake = 'Aikaleima,Etunimi,Sukunimi,Sarja,Seura,Sähköposti,SIIRRETTY\n1.11.2026,Tero, Rantonen ,Y,OMAS,t@x.fi,\n1.11.2026,Matti,Meikäläinen,Y56,NoSA,m@x.fi,2.11.2026';
  assert.deepEqual(lahteenIlmoittautuneet(lomake), [{ nimi: 'Rantonen Tero', sarja: 'Y', seura: 'OMAS' }]);
  assert.equal(lahteenIlmoittautuneet(lomake, { myosSiirretyt: true }).length, 2);
  assert.deepEqual(lahteenIlmoittautuneet([['NIMI'], ['A B']]), [{ nimi: 'A B', sarja: '', seura: '' }]);
});

test('lisattavatIlmoittautuneet ohittaa pääsivun nimet ja kaksoiskappaleet lähteiden välillä', () => {
  const lahde1 = 'NIMI,SARJA,SEURA\nRantonen Tero,Y,OMAS\nUusi Ampuja,Y,X';
  const lahde2 = 'Sukunimi,Etunimi,Sarja\nampuja , uusi,Y\nToinen,Uusi,N';
  assert.deepEqual(lisattavatIlmoittautuneet(['Tero Rantonen'], [lahde1, lahde2]).map((o) => o.nimi), ['Uusi Ampuja', 'Toinen Uusi']);
  assert.equal(nimiAvain(' Rantonen   TERO '), nimiAvain('tero rantonen'));
});

test('takaraja Helsingin aikaa: asetus päivänä, päivä ja kellonaika, oletuksena kisapäivän alku', () => {
  assert.equal(helsinginHetki(2026, 11, 15, 18, 0).toISOString(), '2026-11-15T16:00:00.000Z');
  assert.equal(helsinginHetki(2026, 6, 15, 18, 0).toISOString(), '2026-06-15T15:00:00.000Z');
  assert.equal(ilmoittautumisenTakaraja('15.11.2026 18:00', '').toISOString(), '2026-11-15T16:00:00.000Z');
  assert.equal(ilmoittautumisenTakaraja('15.11.2026', '').toISOString(), '2026-11-15T22:00:00.000Z');
  assert.equal(ilmoittautumisenTakaraja('', '21.11.2026').toISOString(), '2026-11-20T22:00:00.000Z');
  assert.equal(ilmoittautumisenTakaraja('', ''), null);
});

test('lomakkeenTila: käytössä vain arvolla LOMAKE ja auki takarajaan asti', () => {
  const speksit = [['', 'ILMOITTAUTUMINEN', 'lomake'], ['', 'ILMOITTAUTUMISEN_SARJAT', 'Y, Y56; N, Y']];
  const ennen = lomakkeenTila(speksit, '21.11.2026', new Date('2026-11-20T21:59:00Z'));
  assert.equal(ennen.kaytossa, true);
  assert.equal(ennen.auki, true);
  assert.deepEqual(ennen.sarjat, ['Y', 'Y56', 'N']);
  assert.equal(lomakkeenTila(speksit, '21.11.2026', new Date('2026-11-20T22:00:00Z')).auki, false);
  assert.equal(lomakkeenTila([['ILMOITTAUTUMINEN', 'SUOMISPORT']], '21.11.2099').auki, false);
  assert.deepEqual(lomakkeenSarjat(''), []);
});

test('tarkistaLomake: pakolliset kentät, sähköposti, sarjalista ja kaavaksi tulkittava teksti', () => {
  const hyva = { sukunimi: 'rantonen', etunimi: 'tero', sarja: 'y56', seura: '=HYPERLINK("x")', sahkoposti: 't@x.fi', suostumus: true };
  const { kentat, virheet } = tarkistaLomake(hyva, ['Y', 'Y56']);
  assert.deepEqual(virheet, {});
  assert.equal(kentat.sarja, 'Y56');
  assert.equal(kentat.seura, 'HYPERLINK("x")');
  assert.deepEqual(Object.keys(tarkistaLomake({}).virheet).sort(), ['etunimi', 'sahkoposti', 'sarja', 'seura', 'sukunimi', 'suostumus']);
  assert.equal(tarkistaLomake({ ...hyva, sahkoposti: 'ei' }).virheet.sahkoposti, 'virheellinen');
  assert.equal(tarkistaLomake({ ...hyva, sarja: 'Z' }, ['Y']).virheet.sarja, 'tuntematon');
  assert.equal(tarkistaLomake({ ...hyva, sarja: 'Z' }).virheet.sarja, undefined);
});

test('lomakkeenNimi: Sukunimi Etunimi, kirjoitusasu säilyy, jos siinä on isoja ja pieniä', () => {
  assert.equal(lomakkeenNimi('RANTONEN', 'tero'), 'Rantonen Tero');
  assert.equal(lomakkeenNimi('von Wright', 'anna-liisa'), 'von Wright Anna-Liisa');
  assert.equal(lomakkeenNimi('McDonald', 'JOHN'), 'McDonald John');
});
