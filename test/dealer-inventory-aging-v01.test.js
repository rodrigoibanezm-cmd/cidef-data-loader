import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDealerAgingInput } from '../lib/dealer-aging/dealerAgingInput.js';
import {
  buildDealerAgingSummaryQuery,
  buildDealerAgingByDealerQuery,
  buildDealerAgingDetailQuery,
} from '../lib/dealer-aging/dealerAgingQuery.js';
import { buildDealerAgingResult } from '../lib/dealer-aging/buildDealerAgingResult.js';
import { listCustomGptActions } from '../lib/custom-gpt-router.js';

test('dealer aging preserves validated defaults and canonical filters', () => {
  const input = parseDealerAgingInput({});
  assert.equal(input.minDays, 60);
  assert.equal(input.asOf, null);
  const { query, params } = buildDealerAgingByDealerQuery(input);
  assert.match(query, /vehiculo_canonico/);
  assert.match(query, /vc\.vigente IS TRUE/);
  assert.match(query, /vc\.canal_salida = 'DEALER'/);
  assert.match(query, /vc\.fecha_ingreso_stock/);
  assert.match(query, /> \$1::integer/);
  assert.doesNotMatch(query, /fecha_eta/);
  assert.doesNotMatch(query, /factura IS NULL/);
  assert.deepEqual(params, [60, null, null, null]);
});

test('dealer aging supports canonical identity, as-of and bounded detail', () => {
  const input = parseDealerAgingInput({
    min_days: 90,
    as_of: '2026-08-15',
    dealer_id: 12,
    dealer_group_id: 4,
    detail_limit: 25,
  });
  const summary = buildDealerAgingSummaryQuery(input);
  const detail = buildDealerAgingDetailQuery(input);
  assert.deepEqual(summary.params, [90, '2026-08-15', 12, 4]);
  assert.deepEqual(detail.params, [90, '2026-08-15', 12, 4, 25]);
  assert.match(detail.query, /LIMIT \$5::integer/);
});

test('dealer aging rejects unsupported knobs and invalid dates', () => {
  assert.throws(() => parseDealerAgingInput({ min_days: 90.5 }), /non-negative integer/);
  assert.throws(() => parseDealerAgingInput({ as_of: '2026-02-30' }), /valid calendar date/);
  assert.throws(() => parseDealerAgingInput({ date_column: 'fecha_eta' }), /Unsupported/);
});

test('dealer aging result preserves unresolved dealer stock and reconciles', () => {
  const result = buildDealerAgingResult({
    input: { minDays: 60, detailLimit: 10 },
    summaryRow: {
      dealer_stock_current: 10, with_fecha_ingreso: 9, missing_fecha_ingreso: 1,
      over_min_days: 4, aged_unresolved_dealer: 1, aging_min: 61, aging_max: 150, aging_avg: 92.5,
    },
    dealerRows: [
      { dealer_id: null, dealer: 'NO_RESUELTO', dealer_group_id: null, dealer_group: 'NO_RESUELTO', vins: 1, aging_min: 80, aging_max: 80, aging_promedio: 80 },
      { dealer_id: 12, dealer: 'Dealer A', dealer_group_id: 4, dealer_group: 'Grupo A', vins: 3, aging_min: 61, aging_max: 150, aging_promedio: 96.7 },
    ],
    detailRows: [{ vin: '12345678901234567', aging_days: 150 }],
  });
  assert.equal(result.validation.coverage_reconciles, true);
  assert.equal(result.validation.unresolved_dealer_stock_preserved, true);
  assert.equal(result.validation.detail_all_over_threshold, true);
});

test('dealer aging v0.1 is registered in Custom GPT router', () => {
  assert.ok(listCustomGptActions().includes('dealer_inventory_aging_v01'));
});
