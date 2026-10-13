import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { luoValimuisti, luoYhdistaja } from './valimuisti.js';
import { pyyntoUudelleenyrittaen } from './googleAuth.js';

test('välimuisti säilyy tiedostossa uudelle prosessille (vercel dev)', async () => {
  const hakemisto = await mkdtemp(path.join(tmpdir(), 'scoringui-testi-'));
  const a = luoValimuisti('x', { hakemisto });
  assert.equal(await a.hae('k'), null);
  await a.aseta('k', { csv: 'a,b' }, 123);
  const b = luoValimuisti('x', { hakemisto });
  assert.deepEqual(await b.hae('k'), { arvo: { csv: 'a,b' }, tallennettu: 123 });
  await b.tyhjenna();
  assert.equal(await luoValimuisti('x', { hakemisto }).hae('k'), null);
});

test('samanaikaiset samat haut yhdistetään', async () => {
  const yhdista = luoYhdistaja();
  let kutsut = 0;
  const tehtava = async () => { kutsut++; await new Promise((r) => setTimeout(r, 5)); return kutsut; };
  const [x, y] = await Promise.all([yhdista('a', tehtava), yhdista('a', tehtava)]);
  assert.equal(x, 1);
  assert.equal(y, 1);
  assert.equal(await yhdista('a', tehtava), 2);
});

test('429 yritetään kerran uudelleen, muut virheet heitetään heti', async () => {
  let kerrat = 0;
  const kiintio = async () => {
    kerrat++;
    if (kerrat === 1) { const e = new Error('quota'); e.response = { status: 429 }; throw e; }
    return 'ok';
  };
  assert.equal(await pyyntoUudelleenyrittaen(kiintio, {}, { viive: 1 }), 'ok');
  assert.equal(kerrat, 2);

  let muut = 0;
  const kielletty = async () => { muut++; const e = new Error('no'); e.response = { status: 403 }; throw e; };
  await assert.rejects(pyyntoUudelleenyrittaen(kielletty, {}, { viive: 1 }), /no/);
  assert.equal(muut, 1);
});

test('tiedostosta luetut merkinnät eivät kasvata muistia rajan yli', async () => {
  const hakemisto = await mkdtemp(path.join(tmpdir(), 'scoringui-testi-'));
  const kirjoittaja = luoValimuisti('y', { hakemisto });
  for (let i = 0; i < 205; i++) await kirjoittaja.aseta(`k${i}`, i);
  const lukija = luoValimuisti('y', { hakemisto });
  for (let i = 0; i < 205; i++) assert.equal((await lukija.hae(`k${i}`)).arvo, i);
  // Ensimmäinen luettu on poistunut muistista, mutta löytyy yhä tiedostosta.
  assert.equal((await lukija.hae('k0')).arvo, 0);
});
