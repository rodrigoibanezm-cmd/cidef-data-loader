import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConcentration } from '../lib/product-concentration/buildConcentration.js';
import { parseConcentrationInput } from '../lib/product-concentration/parseConcentrationInput.js';

const catalog = [
  { modelo_id: 1, marca: 'A', modelo: 'UNO' },
  { modelo_id: 2, marca: 'A', modelo: 'DOS' },
  { modelo_id: 3, marca: 'B', modelo: 'TRES' },
  { modelo_id: 4, marca: 'B', modelo: 'CUATRO' },
];

function sales(month, modeloId, count, status = 'RESOLVED') {
  return Array.from({ length: count }, () => ({
    mes_venta: month,
    modelo_id: status === 'RESOLVED' ? modeloId : null,
    product_identity_status: status,
  }));
}

test('finds the models required to cross the requested Pareto threshold', () => {
  const rows = [
    ...sales('2026-06', 1, 50), ...sales('2026-06', 2, 30),
    ...sales('2026-06', 3, 15), ...sales('2026-06', 4, 5),
  ];
  const result = buildConcentration(rows, catalog, {
    startMonth: '2026-06', endMonth: '2026-06', thresholdPct: 80,
  });
  assert.equal(result.period.pareto_model_count, 2);
  assert.equal(result.period.pareto_sales_share_pct, 80);
  assert.deepEqual(result.period.pareto_models.map((row) => row.modelo), ['UNO', 'DOS']);
});

test('threshold is parameterized and monthly concentration can change', () => {
  const rows = [
    ...sales('2026-05', 1, 70), ...sales('2026-05', 2, 20), ...sales('2026-05', 3, 10),
    ...sales('2026-06', 1, 40), ...sales('2026-06', 2, 30), ...sales('2026-06', 3, 20), ...sales('2026-06', 4, 10),
  ];
  const result = buildConcentration(rows, catalog, {
    startMonth: '2026-05', endMonth: '2026-06', thresholdPct: 70,
  });
  assert.equal(result.monthly[0].pareto_model_count, 1);
  assert.equal(result.monthly[1].pareto_model_count, 2);
  assert.equal(result.monthly[0].pareto_model_share_pct, 33.33);
  assert.equal(result.monthly[1].pareto_model_share_pct, 50);
});

test('unresolved and ambiguous sales stay outside the Pareto denominator', () => {
  const rows = [
    ...sales('2026-06', 1, 8), ...sales('2026-06', 2, 2),
    ...sales('2026-06', null, 3, 'UNRESOLVED'), ...sales('2026-06', null, 1, 'AMBIGUOUS'),
  ];
  const result = buildConcentration(rows, catalog, {
    startMonth: '2026-06', endMonth: '2026-06', thresholdPct: 80,
  });
  assert.equal(result.period.recognized_sales, 14);
  assert.equal(result.period.resolved_product_sales, 10);
  assert.equal(result.period.product_unresolved, 3);
  assert.equal(result.period.product_ambiguous, 1);
  assert.equal(result.period.pareto_model_count, 1);
  assert.equal(result.coverage.resolved_share_pct, 71.43);
});

test('input defaults to 80 but accepts other thresholds and rejects open months', () => {
  const parsed = parseConcentrationInput(
    { start_month: '2026-01', end_month: '2026-07' }, new Date('2026-09-02T12:00:00Z'),
  );
  assert.equal(parsed.thresholdPct, 80);
  assert.equal(parseConcentrationInput(
    { start_month: '2026-01', end_month: '2026-07', pareto_threshold_pct: 90 },
    new Date('2026-09-02T12:00:00Z'),
  ).thresholdPct, 90);
  assert.throws(() => parseConcentrationInput(
    { start_month: '2026-01', end_month: '2026-09' }, new Date('2026-09-02T12:00:00Z'),
  ));
});
