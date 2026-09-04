import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleRvmLongitudinal, buildRvmLongitudinalQuery, parseRvmLongitudinalInput } from '../lib/longitudinal/rvm.js';

function parsed(extra = {}) {
  return parseRvmLongitudinalInput({ metric: 'MARKET_SIZE', grain: 'TOTAL', date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH', ...extra });
}
const totals = [
  { period: '2026-01', row_type: 'TOTAL', bucket_key: null, numerator: '20', denominator: '100', value: '100' },
  { period: '2026-02', row_type: 'TOTAL', bucket_key: null, numerator: '0', denominator: '0', value: '0' },
];

test('MARKET_SIZE produces dense vehicle series and temporal change', () => {
  const result = assembleRvmLongitudinal(parsed(), totals);
  assert.deepEqual(result.series.map((row) => row.value), [100, 0]);
  assert.equal(result.series[1].absoluteChange, -100);
});

test('ENTITY_VIN accepts explicit brand/model entity and segment universe', () => {
  const scope = parsed({ metric: 'ENTITY_VIN', grain: 'MODEL', entity: { brand: 'DONGFENG', model: 'MAGE' }, universe_filters: { segment: ['SUV'] } });
  const query = buildRvmLongitudinalQuery(scope);
  assert.match(query.sql, /identity_resolution/);
  assert.ok(query.params.some((value) => Array.isArray(value) && value.includes('SUV')));
});

test('MARKET_SHARE always exposes numerator and denominator including empty period', () => {
  const scope = parsed({ metric: 'MARKET_SHARE', grain: 'BRAND', entity: { brand: 'DONGFENG' } });
  const rows = totals.map((row, index) => ({ ...row, value: index ? null : '0.2' }));
  const result = assembleRvmLongitudinal(scope, rows);
  assert.deepEqual(result.series[0], { period: '2026-01', numerator: 20, denominator: 100, value: 0.2, absoluteChange: null, pctChange: null });
  assert.equal(result.series[1].value, null);
});

test('RANK requires an identified entity at the requested grain', () => {
  assert.throws(() => parsed({ metric: 'RANK', grain: 'MODEL', entity: { brand: 'DONGFENG' } }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
  const scope = parsed({ metric: 'RANK', grain: 'MODEL', entity: { model: 'MAGE' } });
  const result = assembleRvmLongitudinal(scope, [{ ...totals[0], value: '3' }, { ...totals[1], value: null }]);
  assert.equal(result.series[0].value, 3);
  assert.equal(result.series[1].value, null);
});

test('brand and model breakdown remain explicit including unresolved', () => {
  for (const breakdown of ['BRAND', 'MODEL']) {
    const scope = parsed({ breakdown });
    const rows = [...totals, { ...totals[0], row_type: 'BREAKDOWN', bucket_key: '1', bucket_label: 'A', value: '80' }, { ...totals[0], row_type: 'BREAKDOWN', bucket_key: 'UNRESOLVED', bucket_label: 'UNRESOLVED', value: '20' }];
    const result = assembleRvmLongitudinal(scope, rows);
    assert.equal(result.seriesByBreakdown.length, 2);
    assert.equal(result.seriesByBreakdown.find((row) => row.key === 'UNRESOLVED').identityStatus, 'UNRESOLVED');
  }
});

test('invalid metric and invalid universe filter are rejected', () => {
  assert.throws(() => parsed({ metric: 'WINNERS' }), /INVALID_METRIC/);
  assert.throws(() => parsed({ universe_filters: { automatic_competitors: true } }), /UNSUPPORTED_FILTER/);
});
