import assert from 'node:assert/strict';
import test from 'node:test';
import { applyObservationSemantics } from '../lib/deterioration/applyObservationSemantics.js';
import { buildSparseOrgBacktestRows } from '../lib/deterioration/buildSparseOrgBacktestRows.js';
import { evaluateOrgCandidates } from '../lib/deterioration/evaluateOrgCandidates.js';
import { calculateBaseline } from '../lib/deterioration/orgBaselines.js';

const unit = (months) => ({
  unit_id: 1,
  unit_label: 'Tienda A',
  identity_validated: true,
  months: new Map(months),
});

test('productive sparse baseline does not zero-fill missing history months', () => {
  const history = unit([['2026-01', 10], ['2026-03', 8]]);
  const options = { zeroFillMissing: false };
  assert.equal(calculateBaseline('moving_average_3', history, '2026-04', options), null);
  assert.equal(calculateBaseline('median_3', history, '2026-04', options), null);
});

test('legacy baseline mode remains available for OLD audit compatibility', () => {
  const history = unit([['2026-01', 10], ['2026-03', 8]]);
  assert.equal(calculateBaseline('moving_average_3', history, '2026-04').value, 6);
});

test('UNKNOWN actual is skipped while explicit observed zero is evaluable', () => {
  const history = unit([['2025-03', 10]]);
  const unknownActual = unit([['2025-03', 10]]);
  const zeroActual = unit([['2025-03', 10], ['2026-03', 0]]);
  const parsed = {
    grain: 'tienda', startMonth: '2026-03', endMonth: '2026-03', baselines: ['last_year'],
  };
  const base = (actual) => ({
    first_data_month: '2026-03',
    snapshots: new Map([
      ['2026-02', { units: new Map([['1', history]]) }],
      ['2026-03', { units: new Map([['1', actual]]) }],
    ]),
  });
  const unknown = buildSparseOrgBacktestRows(base(unknownActual), parsed);
  const zero = buildSparseOrgBacktestRows(base(zeroActual), parsed);
  assert.equal(unknown.rows.length, 0);
  assert.equal(unknown.skippedUnknown.last_year, 1);
  assert.equal(zero.rows.length, 1);
  assert.equal(zero.rows[0].sales, 0);
});

test('UNKNOWN gap resets episode state and allows a later distinct episode', () => {
  const row = (month, error) => ({
    unit_id: 1, unit_label: 'Tienda A', baseline: 'last_year', month,
    deviations: { relative: error / 10, error },
  });
  const rows = [
    row('2026-01', -1), row('2026-02', -2),
    row('2026-04', -1), row('2026-05', -2),
  ];
  const result = evaluateOrgCandidates(rows, {
    startMonth: '2026-01', endMonth: '2026-05', baselines: ['last_year'],
    deviations: ['relative'], persistence: ['deepening_2'],
  });
  assert.deepEqual(result.episodes.map((episode) => episode.confirmation_month), ['2026-02', '2026-05']);
});

test('seller semantics stay conservative without invented ACTIVE_ZERO', async () => {
  const snapshots = { snapshots: new Map(), cutoffs: [] };
  const result = await applyObservationSemantics(snapshots, { grain: 'vendedor' });
  assert.equal(result.snapshots, snapshots);
  assert.equal(result.audit.mode, 'POSITIVE_ONLY_UNKNOWN');
  assert.equal(result.audit.active_zero_supported, false);
});
