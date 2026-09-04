import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAIN_CAPABILITY_REGISTRY,
  listCapabilityDomains,
  listCustomGptActions,
  listDomainCapabilities,
  resolveDomainCapability,
  runCustomGptCapability,
} from '../lib/custom-gpt-router.js';

const EXPECTED_COUNTS = Object.freeze({
  SALES: 15,
  MARKET: 5,
  DISCOVERY: 4,
  LONGITUDINAL: 3,
});

test('registry exposes exactly the four designed public domains', () => {
  assert.deepEqual(listCapabilityDomains(), ['SALES', 'MARKET', 'DISCOVERY', 'LONGITUDINAL']);
});
for (const [domain, count] of Object.entries(EXPECTED_COUNTS)) {
  test(`${domain} exposes the expected capability count`, () => assert.equal(listDomainCapabilities(domain).length, count));
}
test('registry exposes exactly 27 public capabilities', () => {
  const total = Object.values(DOMAIN_CAPABILITY_REGISTRY).reduce((sum, registry) => sum + Object.keys(registry).length, 0);
  assert.equal(total, 27);
});
test('every public capability maps to an action that exists in the legacy executor', () => {
  const actions = new Set(listCustomGptActions());
  for (const registry of Object.values(DOMAIN_CAPABILITY_REGISTRY)) for (const { action } of Object.values(registry)) assert.equal(actions.has(action), true, `missing action ${action}`);
});
test('SALES resolves VIN_GROWTH_DIAGNOSTIC to vin_growth_diagnostic_v01', () => {
  assert.deepEqual(resolveDomainCapability('sales', 'vin_growth_diagnostic'), { domain: 'SALES', capability: 'VIN_GROWTH_DIAGNOSTIC', action: 'vin_growth_diagnostic_v01' });
});
test('SALES resolves STORE_CHANGE_CONTRIBUTION to the existing physical action', () => {
  assert.deepEqual(resolveDomainCapability('sales', 'store_change_contribution'), { domain: 'SALES', capability: 'STORE_CHANGE_CONTRIBUTION', action: 'ventas_store_change_contribution_v01' });
});
test('MARKET cannot route a SALES capability', () => assert.throws(() => resolveDomainCapability('MARKET', 'STORE_CHANGE_CONTRIBUTION'), (error) => error.code === 'UNSUPPORTED_CAPABILITY_FOR_DOMAIN'));
test('unknown domain fails closed', () => assert.throws(() => resolveDomainCapability('FINANCE', 'MONTHLY_ACTUAL'), (error) => error.code === 'INVALID_CAPABILITY_DOMAIN'));
test('internal support actions are not public capabilities', () => {
  const publicActions = new Set(Object.values(DOMAIN_CAPABILITY_REGISTRY).flatMap((registry) => Object.values(registry).map(({ action }) => action)));
  for (const action of ['ventas_identity_coverage_v01','competitive_signal_backtest_v01','org_sales_deterioration_backtest_v01','dealer_inventory_aging_v01']) assert.equal(publicActions.has(action), false, `${action} leaked into public registry`);
});
test('runCustomGptCapability delegates only the resolved physical action and preserves input', async () => {
  const calls = []; const executor = async (action, input) => { calls.push({ action, input }); return { ok: true }; }; const input = { period: '2026-08', store_id: 'STORE_1' };
  const result = await runCustomGptCapability({ domain: 'SALES', capability: 'MONTHLY_ACTUAL', input }, executor);
  assert.deepEqual(result, { ok: true }); assert.deepEqual(calls, [{ action: 'ventas_monthly_actual_v01', input }]);
});
test('runCustomGptCapability rejects invalid input before executing a motor', async () => {
  let executed = false; const executor = async () => { executed = true; };
  await assert.rejects(() => runCustomGptCapability({ domain: 'SALES', capability: 'MONTHLY_ACTUAL', input: [] }, executor), (error) => error.code === 'INVALID_CAPABILITY_INPUT');
  assert.equal(executed, false);
});
