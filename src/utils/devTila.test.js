import test from 'node:test';
import assert from 'node:assert/strict';

import { onkoDevTila } from './devTila.js';

test('?dev=1 kytkee kehitystilan päälle', () => {
  assert.equal(onkoDevTila('?dev=1'), true);
  assert.equal(onkoDevTila('?kisa=5&dev=true'), true);
});

test('ilman parametria kehitystila on pois, ellei ympäristömuuttuja kytke sitä', () => {
  assert.equal(onkoDevTila(''), false);
  assert.equal(onkoDevTila('?dev=jotain'), false);
  assert.equal(onkoDevTila('', '1'), true);
});

test('?dev=0 voittaa ympäristömuuttujan', () => {
  assert.equal(onkoDevTila('?dev=0', '1'), false);
});
