import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChangeContributionInput } from '../lib/product-change-contribution/parseInput.js';
import { calculateVentasOrganizationalContext } from '../lib/ventas-org/buildVentasOrganizationalContext.js';

test('requires ordered closed months in America/Santiago', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  assert.deepEqual(parseChangeContributionInput({ period_a: '2026-06', period_b: '2026-07' }, now), {
    periodA: '2026-06', periodB: '2026-07', cutoffMonth: '2026-07',
  });
  assert.throws(() => parseChangeContributionInput({ period_a: '2026-07', period_b: '2026-07' }, now), /before/);
  assert.throws(() => parseChangeContributionInput({ period_a: '2026-08', period_b: '2026-07' }, now), /before/);
  assert.throws(() => parseChangeContributionInput({ period_a: '2026-07', period_b: '2026-09' }, now), /closed/);
});

test('organizational context propagates real channel, identity and cutoff evidence', () => {
  const ventas = {
    cutoff_month: '2026-07',
    recognizedSales: [
      { source_id: '1', mes_venta: '2026-06', sucursal_source_key: '10' },
      { source_id: '2', mes_venta: '2026-06', sucursal_source_key: '20' },
    ],
    monthlySales: [{ month: '2026-06', sales: 2 }],
    coverage: { rows_inside_cutoff: 2, rows_excluded_by_cutoff: 1 },
    validation: { ok: true }, warnings: [],
  };
  const identities = {
    stores: new Map([
      ['10', { canonical_id: '1', nombre_canonico: 'PROPIA', tipo_canal: 'CIDEF', match_count: 1 }],
      ['20', { canonical_id: '99', nombre_canonico: 'DEALER', tipo_canal: 'DEALER', match_count: 1 }],
    ]),
    sellers: new Map(), vendedorCidef: new Map(),
  };
  const result = calculateVentasOrganizationalContext(
    ventas, identities, { startMonth: '2026-06', endMonth: '2026-07' },
  );
  assert.deepEqual(result.store_monthly.map((row) => row.tipo_canal), ['CIDEF', 'DEALER']);
  assert.deepEqual(result.store_identity_monthly.map((row) => row.tipo_canal), ['CIDEF', 'DEALER']);
  assert.equal(result.identity_metadata.stores[0].tipo_canal, 'CIDEF');
  assert.equal(result.temporal_evidence.recognized_sales_after_cutoff, 0);
});

test('store motor reuses organizational context with period_b cutoff', () => {
  const source = readFileSync(new URL('../lib/motors/ventas-store-change-contribution-v01.js', import.meta.url), 'utf8');
  assert.match(source, /buildVentasOrganizationalContext\(scope, \{ cutoffMonth: parsed\.periodB \}\)/);
  assert.doesNotMatch(source, /loadOrganizationalIdentityMaps|enrichRecognizedSales|sucursales_master/);
});
