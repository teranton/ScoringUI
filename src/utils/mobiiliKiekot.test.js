import test from 'node:test';
import assert from 'node:assert/strict';
import { asemanKiekot, compakKorttiValilehdet, lueMobiiliKortit, onkoRyhmaKortteja } from './mobiiliKiekot.js';

test('lueMobiiliKortit: asemien kiekot nimen mukaan eri layouteilta', () => {
  const kortit = lueMobiiliKortit({
    'MOBIILI Layout 1': [
      'NRO,NIMI,ASEMA 1,1/2,1/1,ASEMA 2,2/1',
      '',
      '2,Berg  Bertta,1,O,X,0,',
      '3,Carlsson Cecilia,0,,,0,'
    ].join('\n'),
    'MOBIILI Layout 2': 'NRO,NIMI,ASEMA 3,3/1,3/2\n2,Berg Bertta,2,X,x'
  });
  assert.deepEqual(asemanKiekot(kortit, 'berg bertta', '1'), { merkit: 'XO', osumat: 1, compak: false });
  assert.deepEqual(asemanKiekot(kortit, 'Berg Bertta\u200B', 3), { merkit: 'XX', osumat: 2, compak: false });
  // Asema ilman merkintöjä ja tuntematon ampuja.
  assert.equal(asemanKiekot(kortit, 'Berg Bertta', '2'), null);
  assert.equal(asemanKiekot(kortit, 'Carlsson Cecilia', '1'), null);
  assert.equal(asemanKiekot(kortit, 'Ei Ketään', '1'), null);
});

test('lueMobiiliKortit: sama nimi kahdella numerolla jää näyttämättä', () => {
  const kortit = lueMobiiliKortit({ 'MOBIILI Layout 1': 'NRO,NIMI,1/1\n4,Virtanen Ville,X\n9,Virtanen Ville,O' });
  assert.equal(asemanKiekot(kortit, 'Virtanen Ville', '1'), null);
});

test('onkoRyhmaKortteja: ryhmärivi MOBIILI_RYHMAT-välilehdellä', () => {
  assert.equal(onkoRyhmaKortteja('RYHMÄ\n\n3'), true);
  assert.equal(onkoRyhmaKortteja('RYHMÄ'), false);
  assert.equal(onkoRyhmaKortteja(''), false);
});

test('lueMobiiliKortit: Compak-radan kortit tulossarakkeen mukaan', () => {
  const otsikko = ['NRO', 'NIMI', 'TULOS', 'PÄIVITETTY', ...Array.from({ length: 25 }, (_, i) => i + 1)].join(',');
  const kortit = lueMobiiliKortit({
    'MOBIILI Rata 2': `${otsikko}\n5,Aalto Antti,3,,X,O,X,X\n6,Berg Bertta,0,,,,`,
    'MOBIILI Rata 3': `${otsikko}\n5,Aalto Antti,1,,O,X`
  });
  assert.deepEqual(asemanKiekot(kortit, 'Aalto Antti', '2'), { merkit: 'XOXX' + '-'.repeat(21), osumat: 3, compak: true });
  assert.equal(asemanKiekot(kortit, 'Aalto Antti', '3').merkit.slice(0, 2), 'OX');
  // Tyhjä kortti ja rata, jolla ampujalla ei ole korttia.
  assert.equal(asemanKiekot(kortit, 'Berg Bertta', '2'), null);
  assert.equal(asemanKiekot(kortit, 'Aalto Antti', '1'), null);
  assert.deepEqual(compakKorttiValilehdet(2), ['MOBIILI Rata 1', 'MOBIILI Rata 2']);
  assert.equal(compakKorttiValilehdet(40).length, 24);
});
