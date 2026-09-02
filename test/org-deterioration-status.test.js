import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCurrentDeteriorationStatus } from '../lib/deterioration/buildCurrentDeteriorationStatus.js';
import { parseDeteriorationStatusInput } from '../lib/deterioration/deteriorationStatusInput.js';
import { listCustomGptActions } from '../lib/custom-gpt-router.js';

function row(unitId, month, sales, baseline, error, percentile) {
  return {
    unit_id: unitId,
    unit_label: `Tienda ${unitId}`,
    baseline: 'moving_average_12',
    month,
    sales,
    baseline_value: baseline,
    deviations: {
      error,
      historical_percentile: percentile,
      relative: baseline ? error / baseline : null,
      scaled_mad: null,
      error_history_available: 12,
    },
  };
}

function unit(id, values) {
  return {
    unit_id: String(id),
    unit_label: `Tienda ${id}`,
    months: new Map(values),
  };
}

test('status input fixes the certified store rule and rejects laboratory knobs', () => {
  const parsed = parseDeteriorationStatusInput(
    { cutoff_month: '2026-07' },
    new Date('2026-09-02T12:00:00Z'),
  );
  assert.equal(parsed.grain, 'tienda');
  assert.deepEqual(parsed.baselines, ['moving_average_12']);
  assert.deepEqual(parsed.deviations, ['historical_percentile']);
  assert.deepEqual(parsed.persistence, ['deepening_2']);
  assert.throws(() => parseDeteriorationStatusInput({
    cutoff_month: '2026-07', grain: 'vendedor',
  }, new Date('2026-09-02T12:00:00Z')));
  assert.throws(() => parseDeteriorationStatusInput(
    { cutoff_month: '2026-09' },
    new Date('2026-09-02T12:00:00Z'),
  ));
});

test('confirmed episode remains active while current observation stays adverse', () => {
  const rows = [
    row(3, '2026-01', 15, 20, -5, 0.30),
    row(3, '2026-02', 10, 20, -10, 0.20),
    row(3, '2026-03', 12, 20, -8, 0.25),
  ];
  const units = new Map([['3', unit(3, [
    ['2026-01', 15], ['2026-02', 10], ['2026-03', 12],
  ])]]);
  const result = buildCurrentDeteriorationStatus(rows, units, '2026-03');
  assert.equal(result.statuses[0].status, 'DETERIORATING');
  assert.equal(result.statuses[0].onset_month, '2026-01');
  assert.equal(result.statuses[0].confirmation_month, '2026-02');
  assert.deepEqual(result.statuses[0].persistence_rows.map((item) => item.month), [
    '2026-01', '2026-02',
  ]);
});

test('non-adverse observation ends active episode and UNKNOWN is never zero-filled', () => {
  const rows = [
    row(3, '2026-01', 15, 20, -5, 0.30),
    row(3, '2026-02', 10, 20, -10, 0.20),
    row(3, '2026-03', 25, 20, 5, 0.80),
  ];
  const units = new Map([
    ['3', unit(3, [['2026-01', 15], ['2026-02', 10], ['2026-03', 25]])],
    ['4', unit(4, [['2026-01', 8], ['2026-02', 9]])],
  ]);
  const result = buildCurrentDeteriorationStatus(rows, units, '2026-03');
  const store3 = result.statuses.find((item) => String(item.unit_id) === '3');
  const store4 = result.statuses.find((item) => String(item.unit_id) === '4');
  assert.equal(store3.status, 'NOT_DETERIORATING');
  assert.equal(store3.onset_month, null);
  assert.equal(store4.status, 'UNKNOWN');
  assert.equal(store4.status_reason, 'UNKNOWN_ACTUAL');
  assert.equal(store4.current, null);
});

test('observed month without evaluable baseline is UNKNOWN, not healthy', () => {
  const units = new Map([['7', unit(7, [['2026-03', 4]])]]);
  const result = buildCurrentDeteriorationStatus([], units, '2026-03');
  assert.equal(result.statuses[0].status, 'UNKNOWN');
  assert.equal(result.statuses[0].status_reason, 'BASELINE_UNAVAILABLE');
  assert.equal(result.statuses[0].observation_state, 'OBSERVED_POSITIVE');
});

test('productive deterioration status action is registered for custom gpt', () => {
  assert.ok(listCustomGptActions().includes('org_sales_deterioration_status_v01'));
});
