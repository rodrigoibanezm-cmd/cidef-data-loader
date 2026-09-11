import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIntramonthHistoryRequest, orchestrateQuestion,
} from '../lib/intake-orchestrator/orchestrateQuestion.js';
import { parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';
import { parseVentasLongitudinalInput } from '../lib/longitudinal/ventas.js';
import { parseHistoryRange } from '../lib/intramonth-sales-history/historyRange.js';
import { parseChangeContributionInput } from '../lib/product-change-contribution/parseInput.js';
import { parseCrmContextInput } from '../lib/crm-context/buildCrmContext.js';
import { parseLiveCutoff } from '../lib/current-month-forecast/parseLiveCutoff.js';
import { parseRvmBrandShareTrajectoryInput } from '../lib/rvm-brand-share-trajectory/buildRvmBrandShareTrajectory.js';

const options = Object.freeze({
  now: '2026-09-11T09:00:00-03:00', timezone: 'America/Santiago',
});
const decide = (question) => orchestrateQuestion(question, options);
const onlyPlan = (decision) => {
  assert.equal(decision.plans.length, 1);
  return decision.plans[0];
};

test('RVM brand share growth routes to monthly SHARE_TRAJECTORY without reconstructed model ids', () => {
  const decision = decide('¿Cuánto creció el share de Foton el último trimestre?');
  const plan = onlyPlan(decision);
  assert.equal(decision.status, 'READY');
  assert.deepEqual(decision.intent.domains, ['RVM']);
  assert.deepEqual(decision.entity, { type: 'BRAND', value: 'FOTON', identity_resolution: 'BACKEND' });
  assert.equal(plan.route.capability, 'SHARE_TRAJECTORY');
  assert.deepEqual(plan.request, {
    capability: 'SHARE_TRAJECTORY',
    input: {
      date_from: '2026-04-01', date_to: '2026-06-30', time_grain: 'MONTH',
      cutoff_mode: 'FULL_PERIOD', organization_scope: 'ALL', entity: { brand: 'FOTON' },
    },
  });
  assert.equal('target_model_ids' in plan.request.input, false);
  assert.equal(decision.trace.discovery_required, false);
  assert.doesNotThrow(() => parseRvmBrandShareTrajectoryInput(plan.request.input));
});

test('last three closed months do not collapse into last closed quarter', () => {
  const decision = decide('¿Cuánto cambió el share de Foton en los últimos 3 meses?');
  assert.deepEqual([decision.temporal.semantic_type, decision.temporal.date_from, decision.temporal.date_to],
    ['LAST_N_CLOSED_CALENDAR_MONTHS', '2026-06-01', '2026-08-31']);
});

test('CRM conversion change routes to longitudinal cohort semantics, not CONTEXT', () => {
  const decision = decide('¿Mejoró la conversión CRM el último trimestre?');
  const plan = onlyPlan(decision);
  assert.equal(plan.route.capability, 'LONGITUDINAL_CONTEXT');
  assert.equal(plan.metric, 'CONVERSION_RATE');
  assert.equal(plan.request.input.time_grain, 'MONTH');
  assert.equal(plan.request.input.mode, 'COHORT');
  assert.equal(plan.request.input.cohort_axis, 'ASSIGNED_AT');
  assert.doesNotThrow(() => parseCrmLongitudinalInput(plan.request.input));
});

test('CRM present-state question starts with CONTEXT BIG_PICTURE', () => {
  const plan = onlyPlan(decide('¿Cómo está la gestión de leads?'));
  assert.equal(plan.analytical_need, 'BIG_PICTURE');
  assert.equal(plan.route.capability, 'CONTEXT');
  assert.equal(plan.scope.state_semantics, 'CURRENT_STATE');
  assert.doesNotThrow(() => parseCrmContextInput(plan.request.input));
});

test('current-month sales uses the certified open-period forecast contract', () => {
  const plan = onlyPlan(decide('¿Cómo vienen las ventas este mes?'));
  assert.equal(plan.analytical_need, 'CURRENT_OPEN_PERIOD');
  assert.equal(plan.route.capability, 'CURRENT_MONTH_CLOSE_FORECAST');
  assert.deepEqual(plan.request.input, { cutoff_date: '2026-09-11' });
  assert.doesNotThrow(() => parseLiveCutoff(plan.request.input, new Date(options.now)));
});

test('monthly sales evolution routes through VENTAS longitudinal with a schema-valid input', () => {
  const decision = decide('¿Cómo evolucionaron las ventas entre junio y agosto?');
  const plan = onlyPlan(decision);
  assert.equal(plan.route.transport_domain, 'LONGITUDINAL');
  assert.equal(plan.route.transport_capability, 'VENTAS');
  assert.deepEqual([plan.request.input.date_from, plan.request.input.date_to, plan.request.input.time_grain],
    ['2026-06-01', '2026-08-31', 'MONTH']);
  assert.doesNotThrow(() => parseVentasLongitudinalInput(plan.request.input));
});

test('store explanation selects deterministic contribution and requests missing periods', () => {
  const decision = decide('¿Qué sucursal explica la caída de ventas?');
  const plan = onlyPlan(decision);
  assert.equal(decision.status, 'NEEDS_CLARIFICATION');
  assert.equal(plan.analytical_need, 'CHANGE_CONTRIBUTION');
  assert.equal(plan.grain, 'STORE');
  assert.equal(plan.route.capability, 'STORE_CHANGE_CONTRIBUTION');
  assert.deepEqual(plan.missing_inputs, ['period_a', 'period_b']);
  assert.equal(plan.scope.interpretation, 'CONTRIBUTION_NOT_CAUSALITY');
});

test('store contribution builds its closed physical contract when dates are explicit', () => {
  const plan = onlyPlan(decide('¿Qué sucursal explica la caída de ventas entre junio y agosto?'));
  assert.deepEqual(plan.request.input, { period_a: '2026-06', period_b: '2026-08' });
  assert.doesNotThrow(() => parseChangeContributionInput(plan.request.input, new Date(options.now)));
});

test('multi-domain RVM plus VENTAS plan keeps independent evidence and no causal claim', () => {
  const decision = decide('Foton perdió share, ¿también bajaron nuestras ventas?');
  assert.deepEqual(decision.intent.domains, ['RVM', 'VENTAS']);
  assert.equal(decision.integration.mode, 'INDEPENDENT_DOMAIN_EVIDENCE_THEN_SEMANTIC_INTEGRATION');
  assert.equal(decision.integration.causal_interpretation, 'PROHIBITED');
});

test('multi-domain RVM plus CRM plan remains independent', () => {
  const decision = decide('Foton perdió share, ¿qué pasó con los leads?');
  assert.deepEqual(decision.intent.domains, ['RVM', 'CRM']);
  assert.equal(decision.trace.discovery_required, false);
});

test('orchestrator can plan RVM, VENTAS and CRM together', () => {
  const decision = decide('Foton perdió share, ¿también bajaron ventas y conversión de leads?');
  assert.deepEqual(decision.intent.domains, ['RVM', 'VENTAS', 'CRM']);
  assert.deepEqual(decision.trace.selected_capabilities, [
    'RVM/SHARE_TRAJECTORY', 'VENTAS/LONGITUDINAL_CONTEXT', 'CRM/LONGITUDINAL_CONTEXT',
  ]);
  assert.equal(decision.trace.discovery_required, false);
  assert.equal(decision.status, 'NEEDS_CLARIFICATION');
});

test('schema-aware intramonth adapter emits only runtime-supported fields', () => {
  const temporal = decide('¿Cómo evolucionaron las ventas entre junio y agosto?').temporal;
  const request = buildIntramonthHistoryRequest(temporal, {
    outputMode: 'MONTHLY_MILESTONES', commercial_universe: 'COMPANY', grain: 'MONTH',
  });
  assert.deepEqual(request, {
    capability: 'INTRAMONTH_HISTORY',
    input: { start_month: '2026-06', end_month: '2026-08', output_mode: 'MONTHLY_MILESTONES' },
  });
  assert.doesNotThrow(() => parseHistoryRange(request.input, new Date(options.now)));
});

test('DISCOVERY is not selected for encapsulated public questions', () => {
  const questions = [
    '¿Cuánto creció el share de Foton el último trimestre?',
    '¿Mejoró la conversión CRM el último trimestre?',
    '¿Cómo evolucionaron las ventas entre junio y agosto?',
    '¿Qué sucursal explica la caída de ventas entre junio y agosto?',
  ];
  for (const question of questions) assert.equal(decide(question).trace.discovery_required, false);
});
