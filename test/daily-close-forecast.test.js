import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDailyCloseForecastV01 } from '../lib/motors/daily-close-forecast-v01.js';

function sale(id, date, store = '10') {
  return {
    id,
    nro_vin_chasis: `VIN-${id}`,
    fecha_factura: date,
    id_sucursal_vta: store,
    desc_sucursal_vta: store === '10' ? 'Store A' : 'Store B',
  };
}

const rows = [
  sale(1, '01/05/2026'), sale(2, '01/10/2026'), sale(3, '01/20/2026'), sale(4, '01/25/2026'),
  sale(5, '02/10/2026'), sale(6, '02/20/2026'), sale(7, '02/21/2026'), sale(8, '02/25/2026'),
  sale(9, '03/05/2026'), sale(10, '03/10/2026'), sale(11, '03/15/2026'),
  sale(12, '03/20/2026'), sale(13, '03/25/2026'), sale(14, '03/30/2026'),
  sale(15, '04/05/2026'), sale(16, '04/10/2026'),
];

const identityMaps = {
  stores: new Map([
    ['10', { canonical_id: 1, nombre_canonico: 'Store A', tipo_canal: 'CIDEF', match_count: 1 }],
    ['20', { canonical_id: 2, nombre_canonico: 'Store B', tipo_canal: 'CIDEF', match_count: 1 }],
  ]),
  sellers: new Map(),
};

const now = new Date('2026-04-15T16:00:00.000Z');

test('forecasts current company and observed stores from prior closed completion only', () => {
  const result = calculateDailyCloseForecastV01(
    rows,
    identityMaps,
    { cutoff_date: '2026-04-15' },
    now,
  );

  assert.equal(result.engine, 'daily_close_forecast_v01');
  assert.equal(result.version, '0.1');
  assert.equal(result.status, 'ok');
  assert.equal(result.training.end_month, '2026-03');
  assert.equal(result.forecast.company.observed_to_date, 2);
  assert.equal(result.forecast.company.learned_completion, 0.5);
  assert.equal(result.forecast.company.forecast_close, 4);
  assert.equal(result.forecast.stores.length, 1);
  assert.equal(result.forecast.stores[0].sucursal_id, 1);
  assert.equal(result.forecast.stores[0].forecast_close, 4);
  assert.ok(result.historical_accuracy.company.targets_evaluable > 0);
  assert.ok(result.historical_accuracy.stores_pooled.targets_evaluable > 0);
  assert.equal(result.validation.target_actual_close_not_used, true);
  assert.equal(result.validation.company_formula_reconciles, true);
  assert.equal(result.validation.store_formula_reconciles, true);
});

test('does not forecast unobserved stores as zero', () => {
  const result = calculateDailyCloseForecastV01(
    rows,
    identityMaps,
    { cutoff_date: '2026-04-15' },
    now,
  );
  assert.equal(result.forecast.stores.some((row) => row.sucursal_id === 2), false);
  assert.equal(result.validation.stores_positive_observed_only, true);
});

test('rejects a cutoff outside the current open month', () => {
  assert.throws(
    () => calculateDailyCloseForecastV01(
      rows,
      identityMaps,
      { cutoff_date: '2026-03-31' },
      now,
    ),
    /current open month/,
  );
});
