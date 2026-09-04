import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONGITUDINAL_ACTION_BY_DOMAIN,
  runCustomGptActionWithContext,
} from '../lib/custom-gpt-router.js';

const base = Object.freeze({
  metric: 'VIN_SALES',
  grain: 'TOTAL',
  filters: {},
  date_from: '2026-01-01',
  date_to: '2026-03-31',
  time_grain: 'MONTH',
});

function executorLog() {
  const calls = [];
  return {
    calls,
    executor: async (action, input) => {
      calls.push({ action, input });
      return { action, input, preserved: true };
    },
  };
}

for (const [domain, expectedAction] of Object.entries(LONGITUDINAL_ACTION_BY_DOMAIN)) {
  test(`${domain} + requires_longitudinal_context=true selects only its domain motor`, async () => {
    const log = executorLog();
    const longitudinal = domain === 'CRM'
      ? { ...base, domain, metric: 'SOLD', mode: 'COHORT', cohort_axis: 'CREATED_AT' }
      : domain === 'RVM'
        ? { ...base, domain, metric: 'MARKET_SIZE' }
        : { ...base, domain };
    await runCustomGptActionWithContext({
      action: 'analytical_motor_v01', input: { keep: 'analytical input' },
      requires_longitudinal_context: true, longitudinal_context: longitudinal,
    }, log.executor);
    assert.equal(log.calls.length, 2);
    assert.equal(log.calls[1].action, expectedAction);
    assert.equal(log.calls[1].input.domain, undefined);
  });
}

test('flag=false preserves legacy execution and does not run longitudinal motor', async () => {
  const log = executorLog();
  const result = await runCustomGptActionWithContext({
    action: 'analytical_motor_v01', input: { original: true },
    requires_longitudinal_context: false,
    longitudinal_context: { domain: 'INVALID' },
  }, log.executor);
  assert.equal(log.calls.length, 1);
  assert.deepEqual(result, { action: 'analytical_motor_v01', input: { original: true }, preserved: true });
});

test('absent flag preserves legacy execution and does not run longitudinal motor', async () => {
  const log = executorLog();
  await runCustomGptActionWithContext({ action: 'analytical_motor_v01', input: {} }, log.executor);
  assert.equal(log.calls.length, 1);
});

test('invalid domain fails deterministically before any motor executes', async () => {
  const log = executorLog();
  await assert.rejects(() => runCustomGptActionWithContext({
    action: 'analytical_motor_v01', input: {}, requires_longitudinal_context: true,
    longitudinal_context: { ...base, domain: 'FINANCE' },
  }, log.executor), (error) => error.code === 'INVALID_LONGITUDINAL_DOMAIN');
  assert.equal(log.calls.length, 0);
});

test('missing longitudinal parameters fail deterministically', async () => {
  const log = executorLog();
  await assert.rejects(() => runCustomGptActionWithContext({
    action: 'analytical_motor_v01', input: {}, requires_longitudinal_context: true,
    longitudinal_context: { domain: 'VENTAS', metric: 'VIN_SALES' },
  }, log.executor), (error) => error.code === 'MISSING_LONGITUDINAL_CONTEXT_FIELD'
    && /grain/.test(error.message));
  assert.equal(log.calls.length, 0);
});

test('unsupported longitudinal fields are never ignored silently', async () => {
  const log = executorLog();
  await assert.rejects(() => runCustomGptActionWithContext({
    action: 'analytical_motor_v01', input: {}, requires_longitudinal_context: true,
    longitudinal_context: { ...base, domain: 'VENTAS', infer_from_keywords: true },
  }, log.executor), (error) => error.code === 'UNSUPPORTED_LONGITUDINAL_CONTEXT_FIELD');
  assert.equal(log.calls.length, 0);
});

test('CRM activation requires explicit mode and matching axis field', async () => {
  const log = executorLog();
  await assert.rejects(() => runCustomGptActionWithContext({
    action: 'analytical_motor_v01', input: {}, requires_longitudinal_context: true,
    longitudinal_context: { ...base, domain: 'CRM', metric: 'SOLD' },
  }, log.executor), /MISSING_LONGITUDINAL_CONTEXT_FIELD: mode/);
  await assert.rejects(() => runCustomGptActionWithContext({
    action: 'analytical_motor_v01', input: {}, requires_longitudinal_context: true,
    longitudinal_context: { ...base, domain: 'CRM', metric: 'SOLD', mode: 'COHORT' },
  }, log.executor), /MISSING_LONGITUDINAL_CONTEXT_FIELD: cohort_axis/);
});

test('composed output preserves analytical_result and longitudinal_context unchanged', async () => {
  const analytical = { answer: 42, rows: [1, 2] };
  const longitudinal = { series: [{ period: '2026-01', value: 10 }] };
  const executor = async (action) => action === 'analytical_motor_v01' ? analytical : longitudinal;
  const result = await runCustomGptActionWithContext({
    action: 'analytical_motor_v01', input: {}, requires_longitudinal_context: true,
    longitudinal_context: { ...base, domain: 'VENTAS' },
  }, executor);
  assert.strictEqual(result.analytical_result, analytical);
  assert.strictEqual(result.longitudinal_context, longitudinal);
});
