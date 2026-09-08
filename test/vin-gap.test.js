import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateVinGap } from '../lib/vin-gap/calculateVinGap.js';
import { parseVinGapInput } from '../lib/vin-gap/parseVinGapInput.js';
import { vinGapV01 } from '../lib/motors/vin-gap-v01.js';
import { ventasContextFromUniverse } from '../lib/ventas-universe/buildVentasMonthlyAnalyticalContext.js';
import { runCustomGptCapability } from '../lib/custom-gpt-router.js';
import { handleDomainCapabilityRequest } from '../lib/custom-gpt/domainEndpoint.js';

const STORE_ID = 3;
const BRAND_ID = 89;
const TARGET = '2026-08';
const REFERENCE_CUTOFF = '2026-07';
const NOW = new Date('2026-09-08T12:00:00Z');

function shift(month, offset) {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function eventsThrough(endMonth, targetSales = 10, futureSales = 0, historyValue = null) {
  const events = [];
  for (let index = 0; index < 32; index += 1) {
    const month = shift('2024-01', index);
    if (month > endMonth) break;
    const sales = month === TARGET ? targetSales : historyValue ?? 8 + (index % 7);
    for (let vin = 0; vin < sales; vin += 1) events.push({
      vin: `${month}-${vin}`,
      mes_venta: month,
      certified_store_id: STORE_ID,
      certified_store_name: 'BELLAVISTA',
      marca_id: BRAND_ID,
      marca_nombre: 'FOTON',
    });
  }
  for (let vin = 0; vin < futureSales; vin += 1) events.push({
    vin: `future-${vin}`, mes_venta: '2026-09', certified_store_id: STORE_ID,
    certified_store_name: 'BELLAVISTA', marca_id: BRAND_ID, marca_nombre: 'FOTON',
  });
  return events;
}

function universe(events, cutoffMonth) {
  return {
    universe: 'ventas_universe_v01', commercial_universe: 'OWN_STORES',
    commercial_scope: { universe: 'OWN_STORES' },
    period: { cutoff_month: cutoffMonth, cutoff_date: `${cutoffMonth}-28` },
    analytical_events: events.filter((row) => row.mes_venta <= cutoffMonth),
    recognition_version: 'test', recognition_policy: { certified: true },
    source_validation: { ok: true }, warnings: ['CERTIFIED_TEST_WARNING'],
    coverage: {
      recognition: { recognized: events.length }, commercial: { included_sales: events.length },
      resolution: {
        store: { resolved: events.length, unresolved: 0, ambiguous: 0, total: events.length },
        product_model: { resolved: events.length, unresolved: 0, ambiguous: 0, total: events.length },
      },
    },
  };
}

function context(events, cutoffMonth, storeId = STORE_ID, brandId = BRAND_ID) {
  return ventasContextFromUniverse(universe(events, cutoffMonth), {
    commercial_universe: 'OWN_STORES', store_id: storeId, brand_id: brandId,
  });
}

function parsed(overrides = {}) {
  return parseVinGapInput({
    commercial_universe: 'OWN_STORES', store_id: STORE_ID, brand_id: BRAND_ID,
    month: TARGET, ...overrides,
  }, NOW);
}

function calculate(targetSales = 10, options = {}) {
  const all = eventsThrough(TARGET, targetSales, options.futureSales ?? 0, options.historyValue ?? null);
  return calculateVinGap({
    observedContext: context(all, TARGET, options.storeId, options.brandId),
    referenceContext: context(all, REFERENCE_CUTOFF, options.storeId, options.brandId),
  }, parsed(options.parsed));
}

test('valid closed OWN_STORES STORE x BRAND month returns an auditable VIN gap', () => {
  const result = calculate(10);
  assert.equal(result.evaluability.status, 'EVALUABLE');
  assert.equal(result.scope.grain, 'STORE_BRAND_MONTH');
  assert.equal(result.scope.store.name, 'BELLAVISTA');
  assert.equal(result.scope.brand.name, 'FOTON');
  assert.equal(result.observed.vin, 10);
  assert.ok(Number.isFinite(result.reference.vin));
  assert.ok(result.reference.method);
  assert.equal(result.gap.vin, result.reference.vin - result.observed.vin);
});

test('observed VIN authority is ventas_universe_v01 analytical_events', () => {
  const result = calculate(17);
  assert.equal(result.observed.vin, 17);
  assert.equal(result.observed.source, 'ventas_universe_v01.analytical_events');
  assert.equal(result.metadata.unit, 'VIN');
});

test('reference reuses certified candidates, backtest winner, and stability without a new threshold', () => {
  const result = calculate(10);
  assert.match(result.reference.source, /expected_monthly_candidates_v01/);
  assert.equal(result.reference.method, result.reference.stability.global_winner);
  assert.ok(result.reference.coverage.backtest.months_evaluated > 0);
  assert.ok(['ok', 'warning'].includes(result.reference.stability.status));
});

test('positive, zero and negative gaps preserve REFERENCE_MINUS_OBSERVED', () => {
  const positive = calculate(9, { historyValue: 10 });
  const zero = calculate(10, { historyValue: 10 });
  const negative = calculate(11, { historyValue: 10 });
  assert.ok(positive.gap.vin > 0);
  assert.equal(zero.gap.vin, 0);
  assert.ok(negative.gap.vin < 0);
  assert.equal(zero.gap.sign_convention, 'REFERENCE_MINUS_OBSERVED');
});

test('insufficient history and nominal winner without evaluable months produce no reference', () => {
  const short = eventsThrough(TARGET, 4).filter((row) => row.mes_venta >= '2026-06');
  const result = calculateVinGap({
    observedContext: context(short, TARGET), referenceContext: context(short, REFERENCE_CUTOFF),
  }, parsed());
  assert.equal(result.evaluability.status, 'NOT_EVALUABLE');
  assert.ok(result.evaluability.reasons.includes('INSUFFICIENT_HISTORY'));
  assert.equal(result.reference.vin, null);
  assert.equal(result.reference.method, null);
  assert.equal(result.gap.vin, null);
});

test('open month is NOT_EVALUABLE and does not emit observed/reference/gap semantics', () => {
  const openParsed = parseVinGapInput({ commercial_universe: 'OWN_STORES', store_id: STORE_ID, brand_id: BRAND_ID, month: '2026-09' }, NOW);
  const all = eventsThrough('2026-09', 10);
  const result = calculateVinGap({ observedContext: context(all, '2026-09'), referenceContext: context(all, '2026-08') }, openParsed);
  assert.ok(result.evaluability.reasons.includes('PERIOD_NOT_CLOSED'));
  assert.equal(result.evaluability.status, 'NOT_EVALUABLE');
  assert.equal(result.reference.vin, null);
  assert.equal(result.gap.vin, null);
});

test('unresolved store and brand remain absent rather than becoming zero', () => {
  const store = calculate(10, { storeId: 999 });
  const brand = calculate(10, { brandId: 999 });
  assert.ok(store.evaluability.reasons.includes('STORE_NOT_RESOLVED'));
  assert.ok(brand.evaluability.reasons.includes('BRAND_NOT_RESOLVED'));
  assert.equal(store.observed.vin, null);
  assert.equal(brand.observed.vin, null);
});

test('confirmed zero observed VIN is preserved when identities exist elsewhere in certified universe', () => {
  const all = eventsThrough(REFERENCE_CUTOFF, 0);
  all.push({ vin: 'other-target', mes_venta: TARGET, certified_store_id: 4, certified_store_name: 'OTHER', marca_id: BRAND_ID, marca_nombre: 'FOTON' });
  const result = calculateVinGap({ observedContext: context(all, TARGET), referenceContext: context(all, REFERENCE_CUTOFF) }, parsed());
  assert.equal(result.observed.vin, 0);
  assert.equal(result.observed.coverage.status, 'CONFIRMED_ZERO');
  assert.equal(result.evaluability.status, 'EVALUABLE');
});

test('a certified zero reference remains zero and is not treated as absence', () => {
  const reference = context(eventsThrough(REFERENCE_CUTOFF), REFERENCE_CUTOFF);
  const zeroMonths = new Set([
    '2025-05', '2025-06', '2025-07', '2025-08',
    '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
  ]);
  reference.monthlySales = reference.monthlySales.map((row) => ({
    ...row, sales: zeroMonths.has(row.month) ? 0 : row.sales,
  }));
  const zero = calculateVinGap({ observedContext: context(eventsThrough(TARGET, 0), TARGET), referenceContext: reference }, parsed());
  assert.equal(zero.evaluability.status, 'EVALUABLE');
  assert.equal(zero.reference.vin, 0);
  assert.equal(zero.gap.vin, 0);
});

test('reference cutoff prevents target and future leakage', () => {
  const withoutFuture = calculate(10);
  const withFuture = calculate(999, { futureSales: 500 });
  assert.equal(withoutFuture.reference.vin, withFuture.reference.vin);
  assert.equal(withoutFuture.reference.method, withFuture.reference.method);
  assert.equal(withFuture.validation.no_target_month_used_for_reference, true);
  assert.equal(withFuture.validation.no_future_month_used_for_reference, true);
  assert.equal(withFuture.validation.reference_cutoff_precedes_target, true);
});

test('coverage and warnings from certified contexts are preserved', () => {
  const result = calculate(10);
  assert.ok(result.coverage.commercial_universe);
  assert.equal(result.coverage.store_identity.status, 'RESOLVED');
  assert.equal(result.coverage.brand_identity.status, 'RESOLVED');
  assert.ok(result.warnings.includes('CERTIFIED_TEST_WARNING'));
});

test('unsupported scope and grain are explicit and do not invoke the universe adapter', async () => {
  let calls = 0;
  const buildContext = async () => { calls += 1; };
  const scope = await vinGapV01({ commercial_universe: 'COMPANY', store_id: 3, brand_id: 89, month: TARGET }, { now: NOW, buildContext });
  const grain = await vinGapV01({ commercial_universe: 'OWN_STORES', store_id: 3, brand_id: 89, month: TARGET, grain: 'MODEL' }, { now: NOW, buildContext });
  assert.ok(scope.evaluability.reasons.includes('UNSUPPORTED_SCOPE'));
  assert.ok(grain.evaluability.reasons.includes('UNSUPPORTED_GRAIN'));
  assert.equal(calls, 0);
});

test('motor integration requests target and prior cutoffs then calculates from prepared contexts', async () => {
  const all = eventsThrough(TARGET, 13);
  const requested = [];
  const result = await vinGapV01({ commercial_universe: 'OWN_STORES', store_id: STORE_ID, brand_id: BRAND_ID, month: TARGET }, {
    now: NOW,
    buildContext: async (input) => {
      requested.push(input);
      return context(all, input.cutoff_month);
    },
  });
  assert.deepEqual(requested.map((row) => row.cutoff_month).sort(), [REFERENCE_CUTOFF, TARGET]);
  assert.equal(result.observed.vin, 13);
  assert.equal(result.evaluability.status, 'EVALUABLE');
});

test('vin_gap implementation has no direct RAW, MASTER, CRM, or RVM dependency', () => {
  const files = ['../lib/motors/vin-gap-v01.js', '../lib/vin-gap/calculateVinGap.js'];
  const source = files.map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  for (const forbidden of ['customGptDb', 'ventas_raw', 'vehiculos_raw', 'MASTER', '/crm', '/rvm']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /buildVentasMonthlyAnalyticalContext/);
  assert.match(source, /calculateExpectedMonthlyCandidates/);
});

test('router resolves public SALES VIN_GAP capability', async () => {
  let received;
  await runCustomGptCapability({ domain: 'SALES', capability: 'VIN_GAP', input: { marker: true } }, async (action, input) => {
    received = { action, input };
  });
  assert.deepEqual(received, { action: 'vin_gap_v01', input: { marker: true } });
});

test('sales endpoint preserves VIN_GAP input', async () => {
  const input = { commercial_universe: 'OWN_STORES', store_id: 3, brand_id: 89, month: TARGET };
  const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return value; } };
  let received;
  await handleDomainCapabilityRequest('SALES', { method: 'POST', body: { capability: 'VIN_GAP', input } }, res, async (request) => { received = request; return { ok: true }; });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, { domain: 'SALES', capability: 'VIN_GAP', input });
});

test('OpenAPI exposes a closed explicit VIN_GAP input and keeps the Actions root object-compatible', () => {
  const schema = JSON.parse(readFileSync(new URL('../rom/schema.json', import.meta.url), 'utf8'));
  const sales = schema.components.schemas.SalesRequest;
  const input = schema.components.schemas.VinGapInput;
  assert.equal(sales.type, 'object');
  assert.ok(sales.properties.capability.enum.includes('VIN_GAP'));
  assert.equal(sales.properties.input.$ref, '#/components/schemas/SalesInput');
  assert.ok(schema.components.schemas.SalesInput.properties.month);
  assert.deepEqual(input.required, ['commercial_universe', 'store_id', 'brand_id', 'month']);
  assert.equal(input.properties.commercial_universe.const, 'OWN_STORES');
  assert.equal(input.additionalProperties, false);
  assert.equal('grain' in input.properties, false);
});
