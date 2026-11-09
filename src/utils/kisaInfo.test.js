import test from 'node:test';
import assert from 'node:assert/strict';

import { kisanInfo, lajinNimi, muotoileKellonaika, muotoileMaksu, turvallinenLinkki, yhteystiedonOsat } from './kisaInfo.js';

const otsikko = [['KILPAILUN ASETUKSET'], ['Selite', 'Avain', 'Arvo', 'Ohje']];

test('kisanInfo lukee Kisainfo-avaimet ja OHJE-rivit', () => {
  const rivit = [
    ...otsikko,
    ['Kilpailun tyyppi', 'KILPAILUTYYPPI', 'ESP'],
    ['Ensimmäinen lähtö', 'ALOITUS_AIKA', '09:00:00'],
    ['Lomakkeen sarjat', 'ILMOITTAUTUMISEN_SARJAT', 'Y, Y20; N'],
    ['Maksu', 'OSALLISTUMISMAKSU', '45'],
    ['Kisainfo'],
    ['Kisan kuvaus', 'KUVAUS', 'Kauden avaus.\r\nKahvio auki.\n\n\n\u0007Tervetuloa!'],
    ['Kiekkoja', 'KIEKKOMAARA', '80'],
    ['Kilpailupaikka', 'KISAPAIKKA', 'Oulaisten ampumarata'],
    ['Järjestävä seura', 'JARJESTAJA', 'OMAS'],
    ['Yhteyshenkilö', 'YHTEYSTIETO', 'Matti 040 123 4567'],
    ['Suomisport', 'ILMOITTAUTUMISLINKKI', 'javascript:alert(1)'],
    ['Logot ja ohjeet'],
    ['OHJE:', 'Kilpailukutsu', 'https://drive.google.com/file/d/x/preview'],
    ['OHJE:', 'Ilmoittautumislinkki', 'https://www.suomisport.fi/events/abc']
  ];
  const info = kisanInfo(rivit, { paikka: 'Oulainen', jarjestaja: 'Ei käytetä' });
  assert.equal(info.laji, 'English Sporting');
  assert.equal(info.kiekkoja, 80);
  assert.equal(info.kuvaus, 'Kauden avaus.\nKahvio auki.\n\nTervetuloa!');
  assert.equal(info.paikka, 'Oulaisten ampumarata');
  assert.match(info.karttaUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Oulaisten%20ampumarata$/);
  assert.equal(info.jarjestaja, 'OMAS');
  assert.deepEqual(info.yhteystieto, [{ teksti: 'Matti ' }, { teksti: '040 123 4567', href: 'tel:0401234567' }]);
  // Vaarallinen linkki ohitetaan, ja ilmoittautumisen OHJE-rivi on varana.
  assert.equal(info.ilmoittautumisLinkki, 'https://www.suomisport.fi/events/abc');
  assert.equal(info.osallistumismaksu, '45 €');
  assert.equal(info.aloitusAika, '9.00');
  assert.deepEqual(info.sarjat, ['Y', 'Y20', 'N']);
  assert.equal(info.asiakirjat.length, 2);
  assert.equal(info.kutsu.title, 'Kilpailukutsu');
});

test('kisanInfo vanhalle kisalle: rekisterin tiedot varana, koordinaatteja ei näytetä paikkana', () => {
  const vanha = [['OSALLISTUJAT', '120'], ['', '', '', '', 'ALOITUS_AIKA', '9:30'], ['Järjestävät seurat:', 'NoSA']];
  const info = kisanInfo(vanha, { paikka: '64.27, 24.81', laji: 'compak' });
  assert.equal(info.laji, 'Compak Sporting');
  assert.equal(info.paikka, '');
  assert.equal(info.karttaUrl, '');
  assert.equal(info.jarjestaja, 'NoSA');
  assert.equal(info.aloitusAika, '9.30');
  assert.equal(info.kuvaus, '');
  assert.equal(info.kiekkoja, 0);
  assert.deepEqual(info.yhteystieto, []);
  assert.equal(info.kutsu, null);

  const rekisterista = kisanInfo([], { paikka: 'Oulainen', jarjestaja: 'OulA' });
  assert.equal(rekisterista.paikka, 'Oulainen');
  assert.equal(rekisterista.jarjestaja, 'OulA');
  assert.equal(rekisterista.laji, '');
});

test('lajinNimi, maksu, kellonaika ja linkit', () => {
  assert.equal(lajinNimi('FITASC'), 'FITASC Sporting');
  assert.equal(lajinNimi('ESP', { lyhyt: true }), 'ESP');
  assert.equal(lajinNimi('Trap'), 'Trap');
  assert.equal(muotoileMaksu('45,50'), '45,50 €');
  assert.equal(muotoileMaksu('60 € (juniorit 30 €)'), '60 € (juniorit 30 €)');
  assert.equal(muotoileKellonaika('25:00'), '');
  assert.equal(muotoileKellonaika('08:30:00'), '8.30');
  assert.equal(turvallinenLinkki('https://a.fi/x'), 'https://a.fi/x');
  assert.equal(turvallinenLinkki('data:text/html,x'), '');
});

test('yhteystiedonOsat tekee sähköpostista ja puhelimesta linkit', () => {
  assert.deepEqual(yhteystiedonOsat('Matti M., +358 40 123 4567, kisat@omas.fi'), [
    { teksti: 'Matti M., ' },
    { teksti: '+358 40 123 4567', href: 'tel:+358401234567' },
    { teksti: ', ' },
    { teksti: 'kisat@omas.fi', href: 'mailto:kisat@omas.fi' }
  ]);
  assert.deepEqual(yhteystiedonOsat('Kisatoimisto'), [{ teksti: 'Kisatoimisto' }]);
});
