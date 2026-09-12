import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_VERSIONS } from '../lib/agent-architecture/contracts.js';
import { analyzeIntent } from '../lib/analyze/analyzeIntent.js';
import {
  issueContinuationToken,
  verifyContinuationToken,
} from '../lib/analyze/continuationToken.js';
import { containsForbiddenArchitecture } from '../lib/analyze/publicSanitizer.js';
import { decideIntent } from '../lib/decide/decideIntent.js';
import { verifyResolutionToken } from '../lib/resolve/resolutionToken.js';
import { resolveSemanticParse } from '../lib/resolve/resolveSemanticParse.js';
import { resolveExecutionRequirement } from '../lib/analyze/executionRegistry.js';

const NOW = new Date('2026-09-11T16:00:00Z');
const NOW_MS = NOW.getTime();
const SECRET = 'test-incremental-secret';

const entityResolver = async ({ type, value }) => ({
  status: 'UNIQUE',
  resolved: true,
  type,
  display_name: type === 'COMPANY' ? 'CIDEF' : String(value).toUpperCase(),
  canonical_id: type === 'COMPANY' ? 'COMPANY' : '999',
});
const availabilityProvider = async () => ({
  current_result: { available: true, through: '2026-09-11' },
  market_comparison: { available: true, through: '2026-08-31' },
  historical_comparison: { available: true, through: '2026-08-31' },
});

function semanticParse(questionType, entityType = 'COMPANY', entityValue = 'CIDEF') {
  return {
    version: CONTRACT_VERSIONS.semantic_parse,
    question_type: questionType,
    entity: { type: entityType, value: entityValue },
    period: { expression: 'este mes' },
    comparison: null,
    scope: null,
    depth: null,
  };
}

async function resolve(
  questionType = 'STATUS',
  entityType = 'COMPANY',
  entityValue = 'CIDEF',
  question = 'test question',
) {
  return resolveSemanticParse({
    question,
    semantic_parse: semanticParse(questionType, entityType, entityValue),
  }, {
    entityResolver,
    availabilityProvider,
    tokenSecret: SECRET,
    now: NOW,
    nowMs: NOW_MS,
  });
}

function intentFrom(bundle, overrides = {}) {
  return {
    version: CONTRACT_VERSIONS.intent,
    question_type: overrides.question_type ?? bundle.understood.question_type,
    entity: overrides.entity ?? {
      type: bundle.resolved.entity.type,
      value: bundle.resolved.entity.display_name,
    },
    period: overrides.period ?? {
      type: bundle.resolved.period.type,
      date_from: bundle.resolved.period.date_from,
      date_to: bundle.resolved.period.date_to,
    },
    comparison: overrides.comparison ?? bundle.defaults.comparison?.value
      ?? bundle.understood.comparison ?? 'NONE',
    scope: overrides.scope ?? {
      organization_scope: bundle.defaults.scope.organization_scope,
      commercial_universe: bundle.defaults.scope.commercial_universe,
    },
    depth: overrides.depth ?? bundle.defaults.depth?.value ?? 'STANDARD',
    semantic_provenance: {
      question_type: 'LLM_PARSED',
      entity: 'BACKEND_RESOLVED',
      period: 'BACKEND_RESOLVED',
    },
  };
}

async function analyze(bundle, intent, executor, extra = {}) {
  return analyzeIntent({
    resolution_id: bundle.resolution_id,
    intent,
    ...(extra.continuation_id ? { continuation_id: extra.continuation_id } : {}),
  }, {
    tokenSecret: SECRET,
    nowMs: extra.nowMs ?? NOW_MS,
    continuationTtlMs: extra.continuationTtlMs,
    executor,
    includePrivateTrace: extra.includePrivateTrace,
  });
}

test('COMPANY current result is explicitly not evaluable and never executes own-store forecast', async () => {
  const resolution = await resolve('STATUS', 'COMPANY', 'CIDEF', '¿Cómo va CIDEF este mes?');
  const intent = intentFrom(resolution, {
    scope: { organization_scope: 'CIDEF', commercial_universe: 'COMPANY' },
  });
  const calls = [];
  const out = await analyze(resolution, intent, async (spec) => {
    calls.push(spec);
    return { cidef_propio: { observed_to_date: 260 } };
  }, { includePrivateTrace: true });
  const iteration = out.analysis_iteration;
  assert.equal(calls.length, 0);
  assert.equal(iteration.status, 'STOP');
  assert.equal(iteration.response_payload.status, 'NOT_EVALUABLE');
  assert.equal(iteration.response_payload.reason_code, 'NO_CERTIFIED_EXECUTION_MAPPING');
  assert.equal(iteration.response_payload.scope.commercial_universe, 'COMPANY');
  assert.equal(iteration.response_payload.scope.organization_scope, 'CIDEF');
  assert.equal('data' in iteration.response_payload, false);
  assert.deepEqual(iteration.context_payload, { status: 'NOT_REQUIRED', items: [] });
  assert.equal(iteration.sufficiency.status, 'INSUFFICIENT');
  assert.equal('continuation_id' in iteration, false);
  assert.deepEqual(out._private.decision_plan.evidence_requirements,
    [{ type: 'CURRENT_RESULT', requirement: 'REQUIRED' }]);
});

test('own-store forecast evidence keeps OWN_STORES and organization scope separate', async () => {
  const resolution = await resolve('STATUS');
  const intent = intentFrom(resolution, {
    scope: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' },
  });
  const calls = [];
  const raw = { cidef_propio: { observed_to_date: 260, forecast_close: 1537.52 } };
  const out = await analyze(resolution, intent, async (spec) => {
    calls.push(spec);
    return raw;
  });
  assert.deepEqual(calls, [{ domain: 'SALES', capability: 'CURRENT_MONTH_CLOSE_FORECAST',
    input: { cutoff_date: intent.period.date_to } }]);
  assert.equal(out.analysis_iteration.response_payload.status, 'AVAILABLE');
  assert.deepEqual(out.analysis_iteration.response_payload.scope,
    { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' });
  assert.deepEqual(out.analysis_iteration.response_payload.data, raw);
});

test('forecast mappings honor the requested or default commercial universe', () => {
  const authority = { entity: { type: 'COMPANY', display_name: 'CIDEF' },
    defaults: { scope: { commercial_universe: 'COMPANY' } } };
  for (const commercial_universe of ['COMPANY', 'DEALERS', null]) {
    const plan = { temporal: { type: 'CURRENT_MTD', date_to: '2026-09-12' },
      scope_requirements: { organization_scope: 'CIDEF', commercial_universe } };
    for (const type of ['CURRENT_RESULT', 'CLOSE_EXPECTATION']) {
      assert.equal(resolveExecutionRequirement({ type }, plan, authority), null);
    }
  }
  const ownPlan = { temporal: { type: 'CURRENT_MTD', date_to: '2026-09-12' },
    scope_requirements: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' } };
  assert.equal(resolveExecutionRequirement({ type: 'CLOSE_EXPECTATION' }, ownPlan, authority)
    .capability, 'CURRENT_MONTH_CLOSE_FORECAST');
  const closedPlan = { ...ownPlan,
    temporal: { type: 'LAST_CLOSED_MONTH', date_from: '2026-08-01', date_to: '2026-08-31' },
    scope_requirements: { organization_scope: 'CIDEF', commercial_universe: 'COMPANY' } };
  const closed = resolveExecutionRequirement({ type: 'CURRENT_RESULT' }, closedPlan, authority);
  assert.equal(closed.capability, 'VENTAS');
  assert.equal(closed.input.commercial_universe, 'COMPANY');
});

test('STATUS own stores current month executes one required investigation and skips optional SALES_CONTEXT', async () => {
  const resolution = await resolve('STATUS', 'COMPANY', 'CIDEF', '¿Cómo va CIDEF este mes?');
  const intent = intentFrom(resolution, { scope: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' } });
  const authority = verifyResolutionToken(resolution.resolution_id, {
    secret: SECRET, nowMs: NOW_MS,
  });
  const plan = decideIntent(intent, authority);
  assert.deepEqual(plan.evidence_requirements, [
    { type: 'CURRENT_RESULT', requirement: 'REQUIRED' },
  ]);
  assert.deepEqual(plan.context_requirements, [
    { type: 'SALES_CONTEXT', requirement: 'OPTIONAL' },
  ]);

  const calls = [];
  const executor = async (spec) => {
    calls.push(spec);
    if (spec.capability === 'COMMERCIAL_CONTEXT') {
      return { sales: Array.from({ length: 20000 }, (_, index) => ({ vin: `VIN${index}` })) };
    }
    return { status: 'ok', observed_to_date: 41, forecast_close: 180 };
  };
  const out = await analyze(resolution, intent, executor);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].capability, 'CURRENT_MONTH_CLOSE_FORECAST');
  assert.equal(out.analysis_iteration.status, 'STOP');
  assert.equal(out.analysis_iteration.sufficiency.status, 'COMPLETE');
  assert.deepEqual(out.analysis_iteration.context_payload, {
    status: 'NOT_REQUIRED', items: [],
  });
  assert.equal('continuation_id' in out.analysis_iteration, false);
  assert.equal(JSON.stringify(out.analysis_iteration).includes('VIN19999'), false);
});

test('one required investigation runs per call and completed work is not repeated', async () => {
  const resolution = await resolve('PERFORMANCE');
  const intent = intentFrom(resolution, { scope: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' } });
  const calls = [];
  const executor = async (spec) => {
    calls.push(`${spec.domain}/${spec.capability}`);
    return { status: 'ok', value: calls.length };
  };

  const first = await analyze(resolution, intent, executor);
  assert.equal(first.analysis_iteration.status, 'CONTINUE');
  assert.equal(first.analysis_iteration.sufficiency.status, 'PARTIAL');
  assert.equal(typeof first.analysis_iteration.continuation_id, 'string');
  assert.equal(calls.length, 1);

  const second = await analyze(resolution, intent, executor, {
    continuation_id: first.analysis_iteration.continuation_id,
  });
  assert.equal(second.analysis_iteration.status, 'STOP');
  assert.equal(second.analysis_iteration.sufficiency.status, 'COMPLETE');
  assert.equal('continuation_id' in second.analysis_iteration, false);
  assert.equal(calls.length, 2);
  assert.equal(new Set(calls).size, 2);
});

test('equivalent physical executions satisfy multiple required evidence requirements once', async () => {
  const resolution = await resolve('EXPECTATION');
  const intent = intentFrom(resolution, { scope: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' } });
  const calls = [];
  const out = await analyze(resolution, intent, async (spec) => {
    calls.push(spec);
    return { status: 'ok', forecast_close: 180 };
  });

  assert.equal(calls.length, 1);
  assert.equal(out.analysis_iteration.status, 'STOP');
  assert.equal(out.analysis_iteration.sufficiency.status, 'COMPLETE');
  assert.deepEqual(out.analysis_iteration.response_payload.kinds,
    ['current_result', 'expectation']);
});

test('required context executes only with its associated investigation', async () => {
  const resolution = await resolve('PERFORMANCE', 'BRAND', 'Foton');
  const intent = intentFrom(resolution);
  const calls = [];
  const executor = async (spec) => {
    calls.push(spec.capability);
    return { status: 'ok', value: 1 };
  };
  const first = await analyze(resolution, intent, executor);
  assert.deepEqual(first.analysis_iteration.context_payload, {
    status: 'NOT_REQUIRED', items: [],
  });
  assert.deepEqual(calls, ['VENTAS']);

  const second = await analyze(resolution, intent, executor, {
    continuation_id: first.analysis_iteration.continuation_id,
  });
  assert.deepEqual(calls, ['VENTAS', 'SHARE_TRAJECTORY', 'COMPETITIVE_CONTEXT']);
  assert.equal(second.analysis_iteration.context_payload.status, 'AVAILABLE');
  assert.equal(second.analysis_iteration.context_payload.items.length, 1);
  assert.equal(second.analysis_iteration.status, 'STOP');
});

test('final sufficiency is PARTIAL when some required evidence is unavailable', async () => {
  const resolution = await resolve('PERFORMANCE');
  const intent = intentFrom(resolution, { scope: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' } });
  const executor = async (spec) => {
    if (spec.capability === 'VENTAS') {
      throw Object.assign(new Error('unavailable'), { code: 'EVIDENCE_UNAVAILABLE' });
    }
    return { status: 'ok', value: 1 };
  };
  const first = await analyze(resolution, intent, executor);
  const second = await analyze(resolution, intent, executor, {
    continuation_id: first.analysis_iteration.continuation_id,
  });
  assert.equal(second.analysis_iteration.status, 'STOP');
  assert.equal(second.analysis_iteration.sufficiency.status, 'PARTIAL');
  assert.ok(second.analysis_iteration.sufficiency.reason_codes
    .includes('REQUIRED_EVIDENCE_NOT_EVALUABLE'));
});

test('final sufficiency is INSUFFICIENT when no required evidence is available', async () => {
  const resolution = await resolve('PERFORMANCE');
  const intent = intentFrom(resolution);
  const executor = async () => {
    throw Object.assign(new Error('unavailable'), { code: 'EVIDENCE_UNAVAILABLE' });
  };
  const first = await analyze(resolution, intent, executor);
  assert.equal(first.analysis_iteration.status, 'CONTINUE');
  const second = await analyze(resolution, intent, executor, {
    continuation_id: first.analysis_iteration.continuation_id,
  });
  assert.equal(second.analysis_iteration.status, 'STOP');
  assert.equal(second.analysis_iteration.sufficiency.status, 'INSUFFICIENT');
});

test('continuation token rejects tampering and expiry', async () => {
  const resolution = await resolve('PERFORMANCE');
  const intent = intentFrom(resolution);
  const executor = async () => ({ status: 'ok' });
  const first = await analyze(resolution, intent, executor, { continuationTtlMs: 1 });
  const token = first.analysis_iteration.continuation_id;
  const parts = token.split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  await assert.rejects(() => analyze(resolution, intent, executor, {
    continuation_id: parts.join('.'),
  }), /INVALID_CONTINUATION_ID_SIGNATURE/);
  await assert.rejects(() => analyze(resolution, intent, executor, {
    continuation_id: token,
    nowMs: NOW_MS + 2,
  }), /CONTINUATION_ID_EXPIRED/);
});

test('continuation token is bound to resolution, decision plan and intent', async () => {
  const resolution = await resolve('PERFORMANCE');
  const intent = intentFrom(resolution);
  const executor = async () => ({ status: 'ok' });
  const first = await analyze(resolution, intent, executor);
  const decoded = verifyContinuationToken(first.analysis_iteration.continuation_id, {
    secret: SECRET, nowMs: NOW_MS,
  });

  for (const [field, expected] of [
    ['resolution_hash', 'CONTINUATION_RESOLUTION_MISMATCH'],
    ['plan_hash', 'CONTINUATION_PLAN_MISMATCH'],
    ['intent_hash', 'CONTINUATION_INTENT_MISMATCH'],
  ]) {
    const token = issueContinuationToken({ ...decoded, [field]: 'different' }, {
      secret: SECRET, nowMs: NOW_MS,
    });
    await assert.rejects(() => analyze(resolution, intent, executor, {
      continuation_id: token,
    }), new RegExp(expected));
  }

  const otherResolution = await resolve('PERFORMANCE');
  await assert.rejects(() => analyze(otherResolution, intentFrom(otherResolution), executor, {
    continuation_id: first.analysis_iteration.continuation_id,
  }), /CONTINUATION_RESOLUTION_MISMATCH/);
});

test('individual capability payload remains intact and arrays are not truncated', async () => {
  const resolution = await resolve('STATUS');
  const intent = intentFrom(resolution, { scope: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' } });
  const raw = {
    rows: Array.from({ length: 1000 }, (_, index) => ({ index, values: [index, index + 1] })),
    nested: { alpha: { beta: 'preserved' } },
  };
  const out = await analyze(resolution, intent, async () => raw);
  assert.deepEqual(out.analysis_iteration.response_payload.data, raw);
  assert.equal(out.analysis_iteration.response_payload.data.rows.length, 1000);
});

test('public iteration strips all private execution vocabulary', async () => {
  const resolution = await resolve('STATUS');
  const intent = intentFrom(resolution, { scope: { organization_scope: 'CIDEF', commercial_universe: 'OWN_STORES' } });
  const out = await analyze(resolution, intent, async () => ({
    domain: 'SALES', capability: 'PRIVATE', motor: 'x', table: 'raw', sql: 'select 1',
    target_model_ids: [1], question_family: 'PRIVATE', dependency_graph: { x: 1 }, value: 7,
  }));
  const serialized = JSON.stringify(out.analysis_iteration);
  assert.equal(containsForbiddenArchitecture(out.analysis_iteration), false);
  for (const forbidden of ['domain', 'capability', 'motor', 'table', 'sql',
    'target_model_ids', 'question_family', 'dependency_graph']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(out.analysis_iteration.response_payload.data.value, 7);
});
