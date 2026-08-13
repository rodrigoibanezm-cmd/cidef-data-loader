import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonalityInput, seasonalityParams } from '../lib/seasonality-input.js';

test('scope is required and unknown fields are rejected', () => {
  assert.throws(() => seasonalityInput({}), /scope is required/);
  assert.throws(() => seasonalityInput({ scope: 'MARKET', limit: 2 }), /Unknown input/);
});

test('MARKET supports only TOTAL, MARCA and MODELO', () => {
  for (const group_by of ['TOTAL', 'MARCA', 'MODELO']) {
    assert.equal(seasonalityInput({ scope: 'market', group_by }).group_by, group_by);
  }
  assert.throws(() => seasonalityInput({ scope: 'MARKET', group_by: 'SUCURSAL' }), /not valid/);
  assert.throws(() => seasonalityInput({ scope: 'MARKET', seller: 'A' }), /require scope CIDEF/);
});

test('CIDEF supports branch and seller dimensions without equating brands', () => {
  for (const group_by of ['TOTAL', 'MARCA', 'MODELO', 'SUCURSAL', 'VENDEDOR']) {
    assert.equal(seasonalityInput({ scope: 'CIDEF', group_by }).group_by, group_by);
  }
  const input = seasonalityInput({ scope: 'CIDEF', brand: 'dfm', branch: 'centro', seller: 'ana' });
  assert.equal(input.brand, 'DFM');
  assert.equal(input.branch, 'CENTRO');
  assert.equal(input.seller, 'ANA');
});

test('month range is rigid, inclusive and converted to an exclusive SQL bound', () => {
  const input = seasonalityInput({ scope: 'MARKET', date_from: '2025-03', date_to: '2026-07' });
  assert.deepEqual(seasonalityParams(input).slice(0, 2), ['2025-03-01', '2026-08-01']);
  assert.throws(() => seasonalityInput({ scope: 'MARKET', date_from: '03-2025' }), /YYYY-MM/);
  assert.throws(() => seasonalityInput({ scope: 'MARKET', date_from: '2026-02', date_to: '2026-01' }), /exceed/);
});

test('group pagination is explicit and bounded while TOTAL stays complete', () => {
  const grouped = seasonalityInput({ scope: 'CIDEF', group_by: 'VENDEDOR', page: 2, page_size: 100 });
  assert.deepEqual([grouped.page, grouped.page_size], [2, 100]);
  assert.throws(() => seasonalityInput({ scope: 'CIDEF', group_by: 'VENDEDOR', page_size: 101 }));
  const total = seasonalityInput({ scope: 'MARKET', page: 9, page_size: 99 });
  assert.deepEqual([total.page, total.page_size], [1, 1]);
});
