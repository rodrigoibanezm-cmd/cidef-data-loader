import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateProductChangeContribution } from '../lib/motors/ventas-product-change-contribution-v01.js';
import { parseProductChangeInput } from '../lib/product-change-contribution/parseInput.js';

const parsed = { periodA: '2026-06', periodB: '2026-07', cutoffMonth: '2026-07' };
const catalog = [
  { modelo_id: 1, marca: 'A', modelo: 'UNO' },
  { modelo_id: 2, marca: 'A', modelo: 'DOS' },
  { modelo_id: 4, marca: 'B', modelo: 'CUATRO' },
  { modelo_id: 5, marca: 'B', modelo: 'CINCO' },
];

function sales(month, modeloId, count, status = 'RESOLVED') {
  return Array.from({ length: count }, () => ({
    mes_venta: month,
    modelo_id: status === 'RESOLVED' ? modeloId : null,
    product_identity_status: status,
  }));
}

function calculate(rows, modelCatalog = catalog) {
  return calculateProductChangeContribution({
    cutoff_month: '2026-07',
    ventas_validation: { ok: true },
    resolvedSales: rows,
    modelCatalog,
  }, parsed);
}

test('reconciles both periods, identity residual and rising CIDEF delta exactly', () => {
  const result = calculate([
    ...sales('2026-06', 1, 2), ...sales('2026-06', 2, 2),
    ...sales('2026-06', 4, 1), ...sales('2026-06', 5, 1),
    ...sales('2026-06', null, 2, 'UNRESOLVED'), ...sales('2026-06', null, 1, 'AMBIGUOUS'),
    ...sales('2026-07', 1, 5), ...sales('2026-07', 2, 1),
    ...sales('2026-07', 3, 2), ...sales('2026-07', 4, 1),
    ...sales('2026-07', null, 2, 'AMBIGUOUS'),
    ...sales('2026-08', 1, 99),
  ]);

  assert.deepEqual(result.cidef, { period_a_sales: 9, period_b_sales: 11, delta_sales: 2 });
  assert.deepEqual(result.models.map((row) => [row.modelo_id, row.sales_period_a, row.sales_period_b]), [
    [1, 2, 5], [3, 0, 2], [2, 2, 1], [5, 1, 0], [4, 1, 1],
  ]);
  assert.deepEqual(result.models.map((row) => [row.modelo_id, row.support_rank, row.drag_rank]), [
    [1, 1, null], [3, 2, null], [2, null, 1], [5, null, 2], [4, null, null],
  ]);
  assert.equal(result.models[0].contribution_pct_of_cidef_delta, 150);
  assert.equal(result.models[1].contribution_pct_of_cidef_delta, 100);
  assert.equal(result.models[2].contribution_pct_of_cidef_delta, -50);
  assert.deepEqual(result.identity_residual.unresolved, {
    sales_period_a: 2, sales_period_b: 0, delta_sales: -2,
  });
  assert.deepEqual(result.identity_residual.ambiguous, {
    sales_period_a: 1, sales_period_b: 2, delta_sales: 1,
  });
  assert.deepEqual(result.identity_residual.total, {
    sales_period_a: 3, sales_period_b: 2, delta_sales: -1,
  });
  assert.ok(Object.values(result.validation).every(Boolean));
});

test('keeps missing catalog metadata without dropping the resolved model', () => {
  const result = calculate([...sales('2026-06', 3, 1), ...sales('2026-07', 3, 2)]);
  assert.equal(result.models[0].modelo_id, 3);
  assert.equal(result.models[0].marca, null);
  assert.equal(result.models[0].modelo, null);
  assert.deepEqual(result.coverage.missing_catalog_model_ids, [3]);
  assert.match(result.warnings.at(-1), /catalog metadata/);
});

test('supports falling CIDEF while a model rises and another model falls', () => {
  const result = calculate([
    ...sales('2026-06', 1, 2), ...sales('2026-06', 2, 5),
    ...sales('2026-07', 1, 3), ...sales('2026-07', 2, 2),
  ]);
  assert.equal(result.cidef.delta_sales, -2);
  assert.equal(result.models.find((row) => row.modelo_id === 1).contribution_pct_of_cidef_delta, -50);
  assert.equal(result.models.find((row) => row.modelo_id === 2).contribution_pct_of_cidef_delta, 150);
});

test('returns null contribution percentages when total CIDEF delta is zero', () => {
  const result = calculate([
    ...sales('2026-06', 1, 1), ...sales('2026-06', 2, 3),
    ...sales('2026-07', 1, 3), ...sales('2026-07', 2, 1),
  ]);
  assert.equal(result.cidef.delta_sales, 0);
  assert.ok(result.models.every((row) => row.contribution_pct_of_cidef_delta === null));
  assert.equal(result.validation.cidef_delta_reconciles, true);
});

test('orders equal absolute deltas deterministically by modelo_id', () => {
  const result = calculate([
    ...sales('2026-06', 5, 2), ...sales('2026-06', 2, 2),
    ...sales('2026-07', 5, 1), ...sales('2026-07', 2, 1),
  ]);
  assert.deepEqual(result.models.map((row) => row.modelo_id), [2, 5]);
  assert.deepEqual(result.models.map((row) => row.drag_rank), [1, 2]);
});

test('validates ordering and closed-month inputs in America/Santiago', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  assert.deepEqual(parseProductChangeInput({ period_a: '2026-06', period_b: '2026-07' }, now), parsed);
  assert.throws(() => parseProductChangeInput({ period_a: '2026-07', period_b: '2026-07' }, now), /before/);
  assert.throws(() => parseProductChangeInput({ period_a: '2026-08', period_b: '2026-07' }, now), /before/);
  assert.throws(() => parseProductChangeInput({ period_a: '2026-07', period_b: '2026-09' }, now), /closed/);
});

test('orchestrator reuses the certified shared product resolution context', () => {
  const source = readFileSync(new URL('../lib/motors/ventas-product-change-contribution-v01.js', import.meta.url), 'utf8');
  assert.match(source, /buildProductModelResolutionContext\(\{ cutoffMonth: parsed\.periodB \}\)/);
  assert.doesNotMatch(source, /loadSkuEvidence|buildVentasContext|resolveSalesModels/);
});
