import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialDateForDay } from '../lib/ventas/commercialMonth.js';
import { calculateSalesPaceChange, candidateWindows, classifyScaleEvidence } from '../lib/sales-pace-change/calculateSalesPaceChange.js';

function cumulativeRows(month, daily, storeId = null) {
  let accumulated = 0;
  return daily.map((value, index) => {
    accumulated += value;
    return {
      target_month: month,
      cutoff_date: commercialDateForDay(month, index + 1),
      day_of_month: index + 1,
      ...(storeId == null ? {} : { sucursal_id: storeId }),
      accumulated_sales: accumulated,
      actual_close: null,
    };
  });
}

function history(companyDaily, { month = '2026-09', storeDaily = [] } = {}) {
  return {
    engine: 'intramonth_sales_history_context_v01', version: '0.1', status: 'ok',
    cidef_daily: cumulativeRows(month, companyDaily), store_daily: storeDaily,
  };
}

function run(daily, day = daily.length) {
  const month = '2026-09';
  return calculateSalesPaceChange(
    history(daily, { month }),
    { cutoff_date: commercialDateForDay(month, day), grain: 'COMPANY' },
    commercialDateForDay(month, day),
  );
}

test('candidate windows are exactly 3..floor(d/2)', () => {
  assert.deepEqual(candidateWindows(7), [3]);
  assert.deepEqual(candidateWindows(8), [3, 4]);
  assert.deepEqual(candidateWindows(12), [3, 4, 5, 6]);
});

test('explicit multiscale disagreements +,+,0,+ and +,+,-,+ are NOT_EVALUABLE', () => {
  const candidates = [3, 4, 5, 6];
  const make = (sign) => ({ window_days: 3, direction: sign, robust: true });
  const zeroDisagreement = classifyScaleEvidence(candidates, ['POSITIVE','POSITIVE','ZERO','POSITIVE'].map(make));
  const negativeDisagreement = classifyScaleEvidence(candidates, ['POSITIVE','POSITIVE','NEGATIVE','POSITIVE'].map(make));
  assert.equal(zeroDisagreement.movement, 'NOT_EVALUABLE');
  assert.equal(zeroDisagreement.consensus_direction, 'NONE');
  assert.equal(negativeDisagreement.movement, 'NOT_EVALUABLE');
  assert.equal(negativeDisagreement.consensus_direction, 'NONE');
});

test('all robust positive scales classify ACCELERATING', () => {
  const result = run([1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.equal(result.movement, 'ACCELERATING');
  assert.equal(result.consensus_direction, 'POSITIVE');
  assert.deepEqual(result.robust_windows, result.candidate_windows);
});

test('all robust negative scales classify DECELERATING', () => {
  const result = run([12,11,10,9,8,7,6,5,4,3,2,1]);
  assert.equal(result.movement, 'DECELERATING');
  assert.equal(result.consensus_direction, 'NEGATIVE');
});

test('all zero scales, including zero sales, classify STABLE with narrow semantics', () => {
  const result = run(Array(12).fill(0));
  assert.equal(result.movement, 'STABLE');
  assert.equal(result.consensus_direction, 'ZERO');
  assert.equal(result.scale_evidence.every((row) => row.recent_pace === 0 && row.previous_pace === 0), true);
  assert.match(result.stable_semantics, /does not imply good performance/);
});

test('fewer than two candidate windows is NOT_EVALUABLE', () => {
  const result = run([1,2,3,4,5,6,7], 7);
  assert.equal(result.movement, 'NOT_EVALUABLE');
  assert.deepEqual(result.candidate_windows, [3]);
  assert.ok(result.warnings.includes('INSUFFICIENT_CANDIDATE_WINDOWS'));
});

test('fragile scale cannot be ignored to obtain consensus', () => {
  const result = run([0,0,0,0,0,0,0,1]);
  assert.equal(result.movement, 'NOT_EVALUABLE');
  assert.ok(result.robust_windows.length < result.evaluated_windows.length || result.consensus_direction === 'NONE');
});

test('STORE sparse-positive absence is not treated as zero', () => {
  const month = '2026-09';
  const complete = cumulativeRows(month, [1,1,1,1,1,1,1,1,1,1], 10);
  const sparse = complete.filter((row) => row.day_of_month !== 6);
  const result = calculateSalesPaceChange(
    history(Array(10).fill(1), { month, storeDaily: sparse }),
    { cutoff_date: commercialDateForDay(month, 10), grain: 'STORE', store_id: 10 },
    commercialDateForDay(month, 10),
  );
  assert.equal(result.movement, 'NOT_EVALUABLE');
  assert.ok(result.warnings.includes('STORE_SPARSE_EVIDENCE'));
});

test('cutoff on calendar day 1 belongs to previous commercial month', () => {
  const month = '2026-09';
  const daily = Array(30).fill(1);
  const result = calculateSalesPaceChange(
    history(daily, { month }),
    { cutoff_date: '2026-10-01', grain: 'COMPANY' },
    '2026-10-01',
  );
  assert.equal(result.target_month, '2026-09');
  assert.equal(result.commercial_day, 30);
});

test('February and leap-year commercial days reuse certified calendar semantics', () => {
  const feb2024 = Array(29).fill(0);
  const leap = calculateSalesPaceChange(
    history(feb2024, { month: '2024-02' }),
    { cutoff_date: '2024-03-01', grain: 'COMPANY' },
    '2024-03-01',
  );
  assert.equal(leap.target_month, '2024-02');
  assert.equal(leap.commercial_day, 29);

  const feb2026 = Array(28).fill(0);
  const normal = calculateSalesPaceChange(
    history(feb2026, { month: '2026-02' }),
    { cutoff_date: '2026-03-01', grain: 'COMPANY' },
    '2026-03-01',
  );
  assert.equal(normal.commercial_day, 28);
});

test('no post-cutoff rows affect classification', () => {
  const month = '2026-09';
  const base = [1,2,3,4,5,6,7,8,9,10];
  const withFuture = [...base, 1000, 0, 1000];
  const result = calculateSalesPaceChange(
    history(withFuture, { month }),
    { cutoff_date: commercialDateForDay(month, 10), grain: 'COMPANY' },
    commercialDateForDay(month, 13),
  );
  const expected = calculateSalesPaceChange(
    history(base, { month }),
    { cutoff_date: commercialDateForDay(month, 10), grain: 'COMPANY' },
    commercialDateForDay(month, 13),
  );
  assert.equal(result.movement, expected.movement);
  assert.deepEqual(result.scale_evidence, expected.scale_evidence);
});

test('historical context is descriptive and does not change movement', () => {
  const month = '2026-09';
  const current = cumulativeRows(month, [1,2,3,4,5,6,7,8,9,10]);
  const prior = cumulativeRows('2026-08', Array(10).fill(50));
  const baseHistory = { engine: 'intramonth_sales_history_context_v01', version: '0.1', status: 'ok', cidef_daily: current, store_daily: [] };
  const richHistory = { ...baseHistory, cidef_daily: [...prior, ...current] };
  const input = { cutoff_date: commercialDateForDay(month, 10), grain: 'COMPANY' };
  const a = calculateSalesPaceChange(baseHistory, input, input.cutoff_date);
  const b = calculateSalesPaceChange(richHistory, input, input.cutoff_date);
  assert.equal(a.movement, b.movement);
  assert.ok(b.historical_equivalent_context.by_window.every((row) => row.historical_months.includes('2026-08')));
});

test('first evaluable cutoff after non-evaluable cutoff starts persistence at one with NON_EVALUABLE_GAP', () => {
  const month = '2026-09';
  const result = calculateSalesPaceChange(
    history([1,2,3,4,5,6,7,8], { month }),
    { cutoff_date: commercialDateForDay(month, 8), grain: 'COMPANY' },
    commercialDateForDay(month, 8),
  );
  assert.equal(result.movement, 'ACCELERATING');
  assert.equal(result.persistence.previous_movement, 'NOT_EVALUABLE');
  assert.equal(result.persistence.persistence_days, 1);
  assert.equal(result.persistence.onset_cutoff_date, commercialDateForDay(month, 8));
  assert.equal(result.persistence.continuity_break_reason, 'NON_EVALUABLE_GAP');
});

test('input contract rejects unsupported grain and caller tuning knobs', () => {
  assert.throws(() => calculateSalesPaceChange(history(Array(10).fill(1)), { cutoff_date: '2026-09-10', grain: 'BRAND' }, '2026-09-10'), /grain/);
  assert.throws(() => calculateSalesPaceChange(history(Array(10).fill(1)), { cutoff_date: '2026-09-10', grain: 'COMPANY', window_days: 3 }, '2026-09-10'), /Unsupported input/);
  assert.throws(() => calculateSalesPaceChange(history(Array(10).fill(1)), { cutoff_date: '2026-09-10', grain: 'COMPANY', threshold: 1 }, '2026-09-10'), /Unsupported input/);
});
