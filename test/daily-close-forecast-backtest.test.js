import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDailyCloseForecastBacktest } from '../lib/motors/daily-close-forecast-backtest-v01.js';

function sale(id, date) {
  return {
    id,
    nro_vin_chasis: `VIN-${id}`,
    fecha_factura: date,
    id_sucursal_vta: '10',
    desc_sucursal_vta: 'Store A',
    nombre_usuario: 'SELLER1',
  };
}

const rows = [
  sale(1, '01/05/2026'), sale(2, '01/10/2026'),
  sale(3, '01/20/2026'), sale(4, '01/25/2026'),
  sale(5, '02/10/2026'), sale(6, '02/20/2026'),
  sale(7, '02/21/2026'), sale(8, '02/25/2026'),
  sale(9, '03/05/2026'), sale(10, '03/10/2026'), sale(11, '03/15/2026'),
  sale(12, '03/20/2026'), sale(13, '03/25/2026'), sale(14, '03/30/2026'),
];

const identityMaps = {
  stores: new Map([['10', {
    canonical_id: 1,
    nombre_canonico: 'Store A',
    tipo_canal: 'CIDEF',
    match_count: 1,
  }]]),
  sellers: new Map([['SELLER1', {
    canonical_id: 101,
    nombre_canonico: 'Seller One',
    validated: true,
    match_count: 1,
  }]]),
  vendedorCidef: new Map([['101', [{
    sucursal_id: 1,
    valid_from: null,
    valid_to: null,
    vigente: true,
  }]]]),
};

const now = new Date('2026-09-02T12:00:00.000Z');

test('median completion walk-forward produces compact company and pooled-store error rows', () => {
  const result = calculateDailyCloseForecastBacktest(
    rows,
    identityMaps,
    { start_month: '2026-03', end_month: '2026-03' },
    now,
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.candidate_results.length, 93);
  const company15 = result.candidate_results.find(
    (row) => row.grain === 'CIDEF_PROPIO' && row.day_of_month === 15,
  );
  const store15 = result.candidate_results.find(
    (row) => row.grain === 'TIENDA_PROPIA_POOLED' && row.day_of_month === 15,
  );
  const seller15 = result.candidate_results.find(
    (row) => row.grain === 'VENDEDOR_CIDEF_POOLED' && row.day_of_month === 15,
  );
  assert.equal(company15.targets_evaluable, 1);
  assert.equal(company15.training_observations_min, 2);
  assert.ok(Math.abs(company15.mape_pct - 33.33333333333333) < 1e-9);
  assert.ok(Math.abs(store15.median_ape_pct - 33.33333333333333) < 1e-9);
  assert.ok(Math.abs(seller15.median_ape_pct - 33.33333333333333) < 1e-9);
  assert.equal(result.coverage.seller_targets_evaluable, 27);
  assert.equal(result.validation.seller_uses_certified_vendedor_cidef, true);
  assert.equal(result.validation.training_precedes_target, true);
  assert.equal(result.validation.forecast_formula_reconciles, true);
});

test('zero median completion stays not evaluable without epsilon', () => {
  const result = calculateDailyCloseForecastBacktest(
    rows,
    identityMaps,
    { start_month: '2026-03', end_month: '2026-03' },
    now,
  );
  const day1 = result.candidate_results.find(
    (row) => row.grain === 'CIDEF_PROPIO' && row.day_of_month === 1,
  );
  assert.equal(day1.target_observations, 1);
  assert.equal(day1.targets_evaluable, 0);
  assert.equal(day1.mape_pct, null);
});

test('open target month is rejected', () => {
  assert.throws(
    () => calculateDailyCloseForecastBacktest(
      rows,
      identityMaps,
      { start_month: '2026-09', end_month: '2026-09' },
      now,
    ),
    /end_month must be a closed month/,
  );
});
