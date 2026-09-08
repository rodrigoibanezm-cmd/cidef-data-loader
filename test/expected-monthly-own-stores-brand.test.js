import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ventasContextFromUniverse } from '../lib/ventas-universe/buildVentasMonthlyAnalyticalContext.js';
import { calculateExpectedMonthlyCandidates } from '../lib/motors/expected-monthly-candidates-v01.js';
import { calculateExpectedMonthlyBacktest } from '../lib/motors/expected-monthly-backtest-v01.js';
import { calculateExpectedMonthlyStability } from '../lib/motors/expected-monthly-stability-v01.js';

function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function repeatedEvents({ startMonth, months, storeId, brandId, base = 10, increment = 1 }) {
  const events = [];
  for (let index = 0; index < months; index += 1) {
    const month = shiftMonth(startMonth, index);
    const sales = base + index * increment;
    for (let vin = 0; vin < sales; vin += 1) {
      events.push({
        vin: `${storeId}-${brandId}-${month}-${vin}`,
        mes_venta: month,
        certified_store_id: storeId,
        marca_id: brandId,
      });
    }
  }
  return events;
}

function ownStoresUniverse(events, cutoffMonth = '2026-06') {
  return {
    universe: 'ventas_universe_v01',
    commercial_universe: 'OWN_STORES',
    commercial_scope: { universe: 'OWN_STORES' },
    period: { cutoff_month: cutoffMonth, cutoff_date: `${cutoffMonth}-30` },
    analytical_events: events,
    recognition_version: 'test',
    recognition_policy: { test: true },
    source_validation: { ok: true },
    coverage: {
      recognition: { recognized: events.length },
      commercial: { included_sales: events.length },
      resolution: {
        store: { resolved: events.length, unresolved: 2, ambiguous: 1, total: events.length + 3 },
        product_model: { resolved: events.length, unresolved: 3, ambiguous: 2, total: events.length + 5 },
      },
    },
    warnings: ['TEST_WARNING'],
  };
}

function scopedContext(events, storeId = 11, brandId = 101, cutoffMonth = '2026-06') {
  return ventasContextFromUniverse(
    ownStoresUniverse(events, cutoffMonth),
    { commercial_universe: 'OWN_STORES', store_id: storeId, brand_id: brandId },
  );
}

test('OWN_STORES STORE x BRAND monthly series is sourced only from ventas_universe_v01 analytical_events', () => {
  const events = [
    ...repeatedEvents({ startMonth: '2026-04', months: 3, storeId: 11, brandId: 101, base: 2, increment: 1 }),
    ...repeatedEvents({ startMonth: '2026-04', months: 3, storeId: 12, brandId: 101, base: 20, increment: 1 }),
    ...repeatedEvents({ startMonth: '2026-04', months: 3, storeId: 11, brandId: 202, base: 30, increment: 1 }),
  ];
  const context = scopedContext(events);

  assert.deepEqual(context.monthlySales, [
    { month: '2026-04', sales: 2 },
    { month: '2026-05', sales: 3 },
    { month: '2026-06', sales: 4 },
  ]);
  assert.equal(context.commercial_universe, 'OWN_STORES');
  assert.equal(context.store_id, 11);
  assert.equal(context.brand_id, 101);
  assert.equal(context.metric, 'VIN_SALES');
  assert.equal(context.lineage.universe, 'ventas_universe_v01');
  assert.equal(context.lineage.source, 'ventas_universe_v01.analytical_events');
  assert.equal(context.scope_coverage.analytical_events, 9);
  assert.equal(context.scope_coverage.source_analytical_events, events.length);
});

test('different store_id and brand_id scopes produce distinct exact series and exclude out-of-scope events', () => {
  const events = [
    ...repeatedEvents({ startMonth: '2026-05', months: 2, storeId: 11, brandId: 101, base: 2, increment: 1 }),
    ...repeatedEvents({ startMonth: '2026-05', months: 2, storeId: 12, brandId: 101, base: 5, increment: 1 }),
    ...repeatedEvents({ startMonth: '2026-05', months: 2, storeId: 11, brandId: 202, base: 8, increment: 1 }),
  ];

  assert.deepEqual(scopedContext(events, 11, 101).monthlySales, [
    { month: '2026-05', sales: 2 }, { month: '2026-06', sales: 3 },
  ]);
  assert.deepEqual(scopedContext(events, 12, 101).monthlySales, [
    { month: '2026-05', sales: 5 }, { month: '2026-06', sales: 6 },
  ]);
  assert.deepEqual(scopedContext(events, 11, 202).monthlySales, [
    { month: '2026-05', sales: 8 }, { month: '2026-06', sales: 9 },
  ]);
});

test('COMPANY context remains backward compatible', () => {
  const events = repeatedEvents({ startMonth: '2026-05', months: 2, storeId: 11, brandId: 101, base: 2, increment: 1 });
  const universe = {
    ...ownStoresUniverse(events),
    commercial_universe: 'COMPANY',
    commercial_scope: { universe: 'COMPANY' },
  };
  const context = ventasContextFromUniverse(universe);

  assert.deepEqual(context.monthlySales, [
    { month: '2026-05', sales: 2 }, { month: '2026-06', sales: 3 },
  ]);
  assert.equal('commercial_universe' in context, false);
  assert.equal('scope_coverage' in context, false);
  assert.equal('lineage' in context, false);
});

test('coverage keeps unresolved and ambiguous identity evidence from the certified universe', () => {
  const context = scopedContext(repeatedEvents({ startMonth: '2026-01', months: 6, storeId: 11, brandId: 101 }));
  assert.equal(context.identity_coverage.store.unresolved, 2);
  assert.equal(context.identity_coverage.store.ambiguous, 1);
  assert.equal(context.identity_coverage.brand.unresolved, 3);
  assert.equal(context.identity_coverage.brand.ambiguous, 2);
  assert.deepEqual(context.warnings, ['TEST_WARNING']);
});

test('all existing expectation formulas work unchanged on STORE x BRAND history', () => {
  const events = repeatedEvents({ startMonth: '2025-04', months: 15, storeId: 11, brandId: 101, base: 100, increment: 20 });
  const context = scopedContext(events, 11, 101, '2026-06');
  const result = calculateExpectedMonthlyCandidates(context, {
    cutoff_month: '2026-06',
    target_month: '2026-07',
  });
  const monthly = new Map(context.monthlySales.map((row) => [row.month, row.sales]));
  const recent = (monthly.get('2026-06') + monthly.get('2026-05') + monthly.get('2026-04')) / 3;
  const prior = (monthly.get('2025-06') + monthly.get('2025-05') + monthly.get('2025-04')) / 3;

  assert.equal(result.expectations.last_year, monthly.get('2025-07'));
  assert.equal(result.expectations.moving_average_3, recent);
  assert.equal(result.expectations.moving_average_6,
    ['2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01']
      .reduce((sum, month) => sum + monthly.get(month), 0) / 6);
  assert.equal(result.expectations.adjusted_last_year, monthly.get('2025-07') * (recent / prior));
  assert.equal(result.candidates.length, 4);
  assert.ok(result.candidates.every((row) => row.history_available === true));
  assert.equal(result.scope.grain, 'STORE_BRAND_MONTH');
});

test('insufficient STORE x BRAND history remains null and explicitly non-evaluable', () => {
  const events = repeatedEvents({ startMonth: '2026-04', months: 3, storeId: 11, brandId: 101, base: 5, increment: 1 });
  const context = scopedContext(events, 11, 101, '2026-06');
  const result = calculateExpectedMonthlyCandidates(context, {
    cutoff_month: '2026-06',
    target_month: '2026-07',
  });

  assert.equal(result.expectations.last_year, null);
  assert.equal(result.expectations.moving_average_3, 6);
  assert.equal(result.expectations.moving_average_6, null);
  assert.equal(result.expectations.adjusted_last_year, null);
  assert.equal(result.status, 'warning');
  assert.equal(result.candidates.find((row) => row.method === 'last_year').evaluability,
    'NOT_EVALUABLE_INSUFFICIENT_HISTORY');
});

test('target month and future months never participate in STORE x BRAND candidates', () => {
  const history = repeatedEvents({ startMonth: '2025-04', months: 15, storeId: 11, brandId: 101, base: 10, increment: 2 });
  const targetAndFuture = [
    ...repeatedEvents({ startMonth: '2026-07', months: 1, storeId: 11, brandId: 101, base: 2000, increment: 0 }),
    ...repeatedEvents({ startMonth: '2026-08', months: 1, storeId: 11, brandId: 101, base: 3000, increment: 0 }),
  ];
  const context = scopedContext([...history, ...targetAndFuture], 11, 101, '2026-06');
  const result = calculateExpectedMonthlyCandidates(context, {
    cutoff_month: '2026-06',
    target_month: '2026-07',
  });
  const historyOnly = calculateExpectedMonthlyCandidates(scopedContext(history, 11, 101, '2026-06'), {
    cutoff_month: '2026-06', target_month: '2026-07',
  });

  assert.deepEqual(result.expectations, historyOnly.expectations);
  assert.equal(result.validation.no_target_month_used, true);
  assert.equal(result.validation.no_future_month_used, true);
  assert.equal(result.coverage.last_source_month, '2026-06');
});

test('STORE x BRAND backtest remains walk-forward and uses existing WAPE/bias/MAE ranking', () => {
  const events = repeatedEvents({ startMonth: '2024-01', months: 32, storeId: 11, brandId: 101, base: 50, increment: 2 });
  const context = scopedContext(events, 11, 101, '2026-08');
  const result = calculateExpectedMonthlyBacktest(context);

  assert.equal(result.status, 'ok');
  assert.ok(result.coverage.months_evaluated > 0);
  assert.equal(result.policy.method, 'walk-forward monthly backtest');
  assert.equal(result.policy.ranking, 'WAPE asc, absolute bias asc, MAE asc, candidate name asc');
  assert.ok(result.ranking.every((row) => 'wape' in row && 'bias' in row && 'mae' in row));
  assert.ok(result.winner);
  assert.equal(result.scope.store_id, 11);
  assert.equal(result.scope.brand_id, 101);
});

test('future STORE x BRAND observations do not alter earlier walk-forward expectations', () => {
  const baseEvents = repeatedEvents({ startMonth: '2024-01', months: 32, storeId: 11, brandId: 101, base: 50, increment: 2 });
  const changedEvents = [
    ...baseEvents,
    ...repeatedEvents({ startMonth: '2026-09', months: 1, storeId: 11, brandId: 101, base: 5000, increment: 0 }),
  ];
  const first = calculateExpectedMonthlyBacktest(scopedContext(baseEvents, 11, 101, '2026-08'));
  const second = calculateExpectedMonthlyBacktest(scopedContext(changedEvents, 11, 101, '2026-09'));
  const month = first.coverage.first_evaluable_month;

  assert.deepEqual(
    first.monthly_backtest.find((row) => row.month === month).expected,
    second.monthly_backtest.find((row) => row.month === month).expected,
  );
});

test('STORE x BRAND stability reuses unchanged windows and backtest ranking', () => {
  const events = repeatedEvents({ startMonth: '2023-01', months: 44, storeId: 11, brandId: 101, base: 40, increment: 1 });
  const result = calculateExpectedMonthlyStability(scopedContext(events, 11, 101, '2026-08'));

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.policy.rolling_windows, ['2023-latest', '2024-latest', '2025-latest']);
  assert.equal(result.policy.formulas, 'unchanged');
  assert.ok(result.global_winner);
  assert.equal(result.validation.backtest_ok, true);
  assert.equal(result.scope.grain, 'STORE_BRAND_MONTH');
});

test('adapted expected families do not access RAW, MASTER, DB, or identity resolvers directly', async () => {
  const files = [
    'lib/motors/expected-monthly-candidates-v01.js',
    'lib/motors/expected-monthly-backtest-v01.js',
    'lib/motors/expected-monthly-stability-v01.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /_raw\b/i);
    assert.doesNotMatch(source, /master/i);
    assert.doesNotMatch(source, /customGptDb|\.query\s*\(/);
    assert.doesNotMatch(source, /loadOrganizationalIdentityMaps|loadProductIdentityMap|resolveSales/);
    assert.match(source, /buildVentasMonthlyAnalyticalContext|calculateExpectedMonthlyBacktest/);
  }
});
