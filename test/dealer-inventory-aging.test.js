import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDealerAgingQuery } from '../lib/motors/dealer-inventory-aging.js';
import { getMotor, listMotors } from '../lib/motors/index.js';

test('dealer_inventory_aging is registered', () => {
  assert.equal(typeof getMotor('dealer_inventory_aging'), 'function');
  assert.ok(listMotors().includes('dealer_inventory_aging'));
});

test('dealer aging uses validated stock rules', () => {
  const { query, params } = buildDealerAgingQuery();
  assert.match(query, /es_dealer IS TRUE/);
  assert.match(query, /vigente::text = '1'/);
  assert.match(query, /fecha_ingreso_stk/);
  assert.match(query, /aging_dias > \$1::integer/);
  assert.doesNotMatch(query, /fecha_eta/);
  assert.deepEqual(params, [60, null, null]);
});

test('dealer aging supports dealer and as-of filters', () => {
  const { query, params } = buildDealerAgingQuery({
    minDays: 90,
    dealer: 'AUTOMOTRIZ ROSSELOT S.A.',
    asOf: '2026-08-15',
  });
  assert.match(query, /\$2::text IS NULL/);
  assert.match(query, /COALESCE\(\$3::date, CURRENT_DATE\)/);
  assert.deepEqual(params, [90, 'AUTOMOTRIZ ROSSELOT S.A.', '2026-08-15']);
});
