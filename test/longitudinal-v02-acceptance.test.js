import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasLongitudinal, parseVentasLongitudinalInput } from '../lib/longitudinal/ventas.js';
import { assembleRvmLongitudinal, parseRvmLongitudinalInput } from '../lib/longitudinal/rvm.js';
import { assembleCrmLongitudinal, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

const dates = { date_from: '2026-01-01', date_to: '2026-08-31', time_grain: 'MONTH', cutoff_mode: 'SAME_DAY' };

test('acceptance: VENTAS, RVM and CRM outputs are structurally alignable without shared cutoff inference', () => {
  const ventas = calculateVentasLongitudinal([
    { fecha_venta_iso: '2026-07-20T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', store_identity_status: 'RESUELTA', eligible_vendedor_cidef: true, persona_id: 10, persona_nombre: 'ANA', seller_identity_status: 'RESUELTA', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 11, modelo_nombre: 'MAGE', product_identity_status: 'RESOLVED' },
    { fecha_venta_iso: '2026-08-26T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', store_identity_status: 'RESUELTA', eligible_vendedor_cidef: true, persona_id: 10, persona_nombre: 'ANA', seller_identity_status: 'RESUELTA', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 11, modelo_nombre: 'MAGE', product_identity_status: 'RESOLVED' },
  ], parseVentasLongitudinalInput({ ...dates, metric: 'VIN_SALES', grain: 'STORE', filters: { store: 'BELLAVISTA', brand: 'DONGFENG' } }));
  const rvmScope = parseRvmLongitudinalInput({ ...dates, metric: 'MARKET_SHARE', grain: 'BRAND', filters: {}, universe_filters: { segment: 'SUV' }, entity: { brand: 'DONGFENG' } });
  const rvm = assembleRvmLongitudinal(rvmScope, [{ period: '2026-08', row_type: 'TOTAL', numerator: '200', denominator: '1000', value: '0.2', last_observed_date: '2026-08-25', effective_date_to: '2026-08-25', comparison_day: '25', identity_resolved: '990', identity_unresolved: '8', identity_ambiguous: '2', identity_total: '1000' }]);
  const crmScope = parseCrmLongitudinalInput({ ...dates, metric: 'MANAGEMENT_COVERAGE', grain: 'STORE', filters: { store: 'BELLAVISTA', brand: 'DONGFENG' }, mode: 'COHORT', cohort_axis: 'CREATED_AT' });
  const crm = assembleCrmLongitudinal(crmScope, [{ period: '2026-08', row_type: 'TOTAL', numerator: '8', denominator: '10', value: '0.8', last_observed_date: '2026-08-24', effective_date_to: '2026-08-24', comparison_day: '24', source_records: '10', valid_axis_records: '10', missing_or_invalid_axis_records: '0', store_resolved: '10', seller_resolved: '8', seller_not_applicable: '2', identity_total: '10' }]);

  for (const result of [ventas, rvm, crm]) {
    assert.equal(result.version, '0.2');
    assert.ok(Array.isArray(result.series));
    assert.ok(result.temporalSemantics);
    assert.ok(Array.isArray(result.coverage.dimensionCoverage));
    assert.ok(Array.isArray(result.warnings));
  }
  assert.deepEqual([ventas.temporalSemantics.effectiveDateTo, rvm.temporalSemantics.effectiveDateTo, crm.temporalSemantics.effectiveDateTo], ['2026-08-26', '2026-08-25', '2026-08-24']);
});
