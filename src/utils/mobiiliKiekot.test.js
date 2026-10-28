import test from 'node:test';
import assert from 'node:assert/strict';
import { asemanKiekot, lueRyhmaKortit, onkoRyhmaKortteja } from './mobiiliKiekot.js';

test('lueRyhmaKortit: asemien kiekot nimen mukaan eri layouteilta', () => {
  const kortit = lueRyhmaKortit({
    'MOBIILI Layout 1': [
      'NRO,NIMI,ASEMA 1,1/2,1/1,ASEMA 2,2/1',
      '',
      '2,Berg  Bertta,1,O,X,0,',
      '3,Carlsson Cecilia,0,,,0,'
    ].join('\n'),
    'MOBIILI Layout 2': 'NRO,NIMI,ASEMA 3,3/1,3/2\n2,Berg Bertta,2,X,x'
  });
  assert.deepEqual(asemanKiekot(kortit, 'berg bertta', '1'), { merkit: 'XO', osumat: 1 });
  assert.deepEqual(asemanKiekot(kortit, 'Berg Bertta\u200B', 3), { merkit: 'XX', osumat: 2 });
  // Asema ilman merkintöjä ja tuntematon ampuja.
  assert.equal(asemanKiekot(kortit, 'Berg Bertta', '2'), null);
  assert.equal(asemanKiekot(kortit, 'Carlsson Cecilia', '1'), null);
  assert.equal(asemanKiekot(kortit, 'Ei Ketään', '1'), null);
});

test('lueRyhmaKortit: sama nimi kahdella numerolla jää näyttämättä', () => {
  const kortit = lueRyhmaKortit({ 'MOBIILI Layout 1': 'NRO,NIMI,1/1\n4,Virtanen Ville,X\n9,Virtanen Ville,O' });
  assert.equal(asemanKiekot(kortit, 'Virtanen Ville', '1'), null);
});

test('onkoRyhmaKortteja: ryhmärivi MOBIILI_RYHMAT-välilehdellä', () => {
  assert.equal(onkoRyhmaKortteja('RYHMÄ\n\n3'), true);
  assert.equal(onkoRyhmaKortteja('RYHMÄ'), false);
  assert.equal(onkoRyhmaKortteja(''), false);
});
