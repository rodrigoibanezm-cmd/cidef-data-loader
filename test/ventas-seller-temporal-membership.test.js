import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasOrganizationalContext } from '../lib/ventas-org/buildVentasOrganizationalContext.js';
import { calculateSellerChangeContribution } from '../lib/motors/ventas-seller-change-contribution-v01.js';
import { enrichRecognizedSale } from '../lib/ventas-org/enrichRecognizedSales.js';

const parsed = { periodA: '2026-06', periodB: '2026-07', cutoffMonth: '2026-07' };
const sale = (id, month, day, store) => ({
  source_id: String(id),
  mes_venta: month,
  fecha_venta_iso: `${month}-${day}T00:00:00.000Z`,
  sucursal_source_key: store,
  vendedor_source_key: 'ANGELICA',
});

function organizationalContext() {
  const ventas = {
    cutoff_month: '2026-07',
    recognizedSales: [
      sale(1, '2026-06', '10', 'SUR'), sale(2, '2026-06', '11', 'NORTE'),
      sale(3, '2026-07', '10', 'NORTE'), sale(4, '2026-07', '11', 'SUR'),
    ],
    monthlySales: [{ month: '2026-06', sales: 2 }, { month: '2026-07', sales: 2 }],
    coverage: { rows_inside_cutoff: 4, rows_excluded_by_cutoff: 0 },
    validation: { ok: true },
    warnings: [],
  };
  const maps = {
    stores: new Map([
      ['SUR', { canonical_id: '1', nombre_canonico: 'Mall Plaza Sur', tipo_canal: 'CIDEF', match_count: 1 }],
      ['NORTE', { canonical_id: '2', nombre_canonico: 'Mall Plaza Norte', tipo_canal: 'CIDEF', match_count: 1 }],
    ]),
    sellers: new Map([['ANGELICA', {
      canonical_id: '16', nombre_canonico: 'ANGELICA MARIA MORENO DE MATOS',
      validated: true, match_count: 1,
    }]]),
    vendedorCidef: new Map([['16', [
      { sucursal_id: '1', valid_from: null, valid_to: '2026-06-30', vigente: false },
      { sucursal_id: '2', valid_from: '2026-07-01', valid_to: null, vigente: true },
    ]]]),
  };
  return calculateVentasOrganizationalContext(
    ventas, maps, { startMonth: '2026-06', endMonth: '2026-07' },
  );
}

test('persona 16 keeps June Mall Plaza Sur and never rewrites history to current North', () => {
  const context = organizationalContext();
  assert.deepEqual(context.seller_monthly.map((row) =>
    [row.month, row.sucursal_id, row.persona_id, row.sales]), [
    ['2026-06', '1', '16', 1],
    ['2026-07', '2', '16', 1],
  ]);
  assert.deepEqual(context.seller_attribution_monthly.filter((row) =>
    row.seller_attribution_status === 'VENDEDOR_CIDEF_STORE_MISMATCH').map((row) =>
    [row.month, row.sucursal_id, row.sales]), [
    ['2026-06', '2', 1],
    ['2026-07', '1', 1],
  ]);
  const result = calculateSellerChangeContribution(context, parsed);
  const sur = result.stores.find((row) => row.sucursal_id === 1);
  const norte = result.stores.find((row) => row.sucursal_id === 2);
  assert.deepEqual(sur.sellers.map((row) =>
    [row.persona_id, row.sales_period_a, row.sales_period_b]), [[16, 1, 0]]);
  assert.deepEqual(norte.sellers.map((row) =>
    [row.persona_id, row.sales_period_a, row.sales_period_b]), [[16, 0, 1]]);
  assert.equal(sur.seller_residual.sales_period_b, 1);
  assert.equal(norte.seller_residual.sales_period_a, 1);
  assert.ok(result.stores.flatMap((row) => row.sellers)
    .every((row) => row.contribution_pct_of_store_delta === null
      && row.contribution_pct_of_cidef_delta === null));
  assert.equal(result.validation.temporal_membership_verified, true);
  assert.equal(result.validation.observed_store_assignment_matches, true);
  assert.equal(result.validation.ok, true);
});

test('supervisor and dealer evidence never qualify for the seller surface', () => {
  const maps = {
    stores: new Map([
      ['OWN', { canonical_id: '1', nombre_canonico: 'PROPIA', tipo_canal: 'CIDEF', match_count: 1 }],
      ['DEALER', { canonical_id: '9', nombre_canonico: 'DEALER', tipo_canal: 'DEALER', match_count: 1 }],
    ]),
    sellers: new Map([
      ['SUPERVISOR', { canonical_id: '90', nombre_canonico: 'SUPERVISOR', match_count: 1 }],
      ['SELLER', { canonical_id: '91', nombre_canonico: 'VENDEDOR', match_count: 1 }],
    ]),
    vendedorCidef: new Map([['91', [{
      sucursal_id: '1', valid_from: null, valid_to: null, vigente: true,
    }]]]),
  };
  const event = (storeKey, sellerKey) => enrichRecognizedSale({
    source_id: '1', mes_venta: '2026-06', fecha_venta_iso: '2026-06-15T00:00:00.000Z',
    sucursal_source_key: storeKey, vendedor_source_key: sellerKey,
  }, maps);
  assert.equal(event('OWN', 'SUPERVISOR').eligible_vendedor_cidef, false);
  assert.equal(event('OWN', 'SUPERVISOR').seller_eligibility_status,
    'RESOLVED_NOT_VENDEDOR_CIDEF');
  assert.equal(event('DEALER', 'SELLER').eligible_vendedor_cidef, false);
});
