import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onkoCsvVirheellinen } from './csv.js';

test('onkoCsvVirheellinen hylkää puuttuvan ja liian lyhyen CSV:n', () => {
  assert.equal(onkoCsvVirheellinen(undefined, 10), true);
  assert.equal(onkoCsvVirheellinen('', 10), true);
  assert.equal(onkoCsvVirheellinen('a,b\n', 10), true);
  assert.equal(onkoCsvVirheellinen('a,b', 2), false);
});

test('onkoCsvVirheellinen hylkää HTML-sivun', () => {
  assert.equal(onkoCsvVirheellinen('<!DOCTYPE html><html><body>Sign in</body></html>', 10), true);
  assert.equal(onkoCsvVirheellinen('\n  <html><head></head></html>', 10), true);
});

test('onkoCsvVirheellinen hyväksyy datan, jossa on #ERROR!-solu tai html-linkki', () => {
  assert.equal(onkoCsvVirheellinen('Nimi,Tulos\nMatti,#ERROR!\n', 10), false);
  assert.equal(onkoCsvVirheellinen('Avain,Arvo\nKutsu,https://example.com/kutsu.html\n', 10), false);
});
