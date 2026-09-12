import { CONTRACT_VERSIONS } from '../agent-architecture/contracts.js';
import { PUBLIC_EVIDENCE_KIND } from '../decide/semanticPools.js';
import { validateDecisionPlan } from '../decide/decisionContracts.js';
import { buildInvestigationSteps } from './executionRegistry.js';
import { sanitizePublicValue } from './publicSanitizer.js';

async function defaultExecutor(spec) {
  const { runCustomGptCapability } = await import('../custom-gpt-router.js');
  return runCustomGptCapability({
    domain: spec.domain,
    capability: spec.capability,
    input: spec.input,
  });
}

function scopeFor(intent) {
  return {
    organization_scope: intent.scope.organization_scope ?? null,
    commercial_universe: intent.scope.commercial_universe ?? null,
  };
}

function initialState() {
  return { next_index: 0, evidence_statuses: {}, context_statuses: {} };
}

function validateState(value, investigationCount) {
  const state = value ?? initialState();
  const validStatusMap = (statuses) => statuses
    && typeof statuses === 'object'
    && !Array.isArray(statuses)
    && Object.values(statuses).every((status) =>
      ['AVAILABLE', 'NOT_EVALUABLE'].includes(status));
  if (!Number.isInteger(state.next_index)
    || state.next_index < 0
    || state.next_index >= investigationCount
    || !validStatusMap(state.evidence_statuses)
    || !validStatusMap(state.context_statuses)) {
    throw Object.assign(new Error('INVALID_CONTINUATION_STATE'), {
      code: 'INVALID_CONTINUATION_STATE',
    });
  }
  return {
    next_index: state.next_index,
    evidence_statuses: { ...state.evidence_statuses },
    context_statuses: { ...state.context_statuses },
  };
}

function contextKind(type) {
  return String(type ?? 'ANALYTICAL_CONTEXT').toLowerCase();
}

function evaluateProgress(plan, state) {
  const requiredEvidence = [...new Set(plan.sufficiency_contract.required_evidence)];
  const requiredContexts = [...new Set(plan.sufficiency_contract.required_contexts ?? [])];
  const evidenceStatuses = requiredEvidence.map((type) =>
    state.evidence_statuses[type] ?? 'PENDING');
  const contextStatuses = requiredContexts.map((type) =>
    state.context_statuses[type] ?? 'PENDING');
  const statuses = [...evidenceStatuses, ...contextStatuses];
  const requiredRemaining = statuses.filter((status) => status === 'PENDING').length;
  const requiredCompleted = statuses.length - requiredRemaining;
  const availableEvidence = evidenceStatuses.filter((status) => status === 'AVAILABLE').length;
  const complete = statuses.every((status) => status === 'AVAILABLE');

  let sufficiency;
  if (complete) sufficiency = 'COMPLETE';
  else if (requiredRemaining > 0 || availableEvidence > 0) sufficiency = 'PARTIAL';
  else sufficiency = 'INSUFFICIENT';

  const reasonCodes = [];
  if (!complete && evidenceStatuses.includes('PENDING')) reasonCodes.push('REQUIRED_EVIDENCE_PENDING');
  if (!complete && contextStatuses.includes('PENDING')) reasonCodes.push('REQUIRED_CONTEXT_PENDING');
  if (!complete && evidenceStatuses.includes('NOT_EVALUABLE')) reasonCodes.push('REQUIRED_EVIDENCE_NOT_EVALUABLE');
  if (!complete && contextStatuses.includes('NOT_EVALUABLE')) reasonCodes.push('REQUIRED_CONTEXT_NOT_EVALUABLE');

  return {
    progress: {
      required_completed: requiredCompleted,
      required_total: statuses.length,
      required_remaining: requiredRemaining,
    },
    sufficiency: { status: sufficiency, reason_codes: reasonCodes },
  };
}

async function executeEvidence(investigation, executor, plan, intent, internalTrace) {
  const kinds = investigation.requirements.map((requirement) =>
    PUBLIC_EVIDENCE_KIND[requirement.type] ?? 'supporting_evidence');
  const base = {
    kinds,
    period: { date_from: plan.temporal.date_from, date_to: plan.temporal.date_to },
    scope: scopeFor(intent),
  };
  if (!investigation.execution) {
    internalTrace.push({
      step_id: investigation.step_id,
      requirements: investigation.requirements.map((requirement) => requirement.type),
      status: 'NOT_EVALUABLE',
      error_code: 'NO_CERTIFIED_EXECUTION_MAPPING',
    });
    return {
      ...base,
      status: 'NOT_EVALUABLE',
      reason_code: 'NO_CERTIFIED_EXECUTION_MAPPING',
      coverage: { status: 'NOT_EVALUABLE' },
    };
  }
  try {
    const raw = await executor(investigation.execution);
    internalTrace.push({
      step_id: investigation.step_id,
      requirements: investigation.requirements.map((requirement) => requirement.type),
      execution: investigation.execution,
      status: 'AVAILABLE',
    });
    return {
      ...base,
      status: 'AVAILABLE',
      coverage: { status: 'AVAILABLE' },
      data: sanitizePublicValue(raw),
    };
  } catch (error) {
    internalTrace.push({
      step_id: investigation.step_id,
      requirements: investigation.requirements.map((requirement) => requirement.type),
      execution: investigation.execution,
      status: 'ERROR',
      error_code: error?.code ?? null,
    });
    return {
      ...base,
      status: 'NOT_EVALUABLE',
      reason_code: error?.code || 'EXECUTION_ERROR',
      coverage: { status: 'NOT_EVALUABLE' },
    };
  }
}

async function executeContexts(investigation, executor, internalTrace) {
  if (!investigation.contexts.length) return { status: 'NOT_REQUIRED', items: [] };
  const items = [];
  for (const step of investigation.contexts) {
    if (!step.execution) {
      items.push({
        kind: contextKind(step.requirement.type),
        status: 'NOT_EVALUABLE',
        reason_code: 'NO_CERTIFIED_CONTEXT_MAPPING',
      });
      internalTrace.push({
        step_id: step.step_id,
        context_type: step.requirement.type,
        status: 'NOT_EVALUABLE',
        error_code: 'NO_CERTIFIED_CONTEXT_MAPPING',
      });
      continue;
    }
    try {
      const raw = await executor(step.execution);
      items.push({
        kind: contextKind(step.requirement.type),
        status: 'AVAILABLE',
        data: sanitizePublicValue(raw),
      });
      internalTrace.push({
        step_id: step.step_id,
        context_type: step.requirement.type,
        execution: step.execution,
        status: 'AVAILABLE',
      });
    } catch (error) {
      items.push({
        kind: contextKind(step.requirement.type),
        status: 'NOT_EVALUABLE',
        reason_code: error?.code || 'EXECUTION_ERROR',
      });
      internalTrace.push({
        step_id: step.step_id,
        context_type: step.requirement.type,
        execution: step.execution,
        status: 'ERROR',
        error_code: error?.code ?? null,
      });
    }
  }
  return {
    status: items.every((item) => item.status === 'AVAILABLE') ? 'AVAILABLE' : 'NOT_EVALUABLE',
    items,
  };
}

export async function executeDecisionPlan(plan, authority, intent, options = {}) {
  validateDecisionPlan(plan);
  const investigations = buildInvestigationSteps(plan, authority);
  if (!investigations.length) {
    throw Object.assign(new Error('NO_REQUIRED_INVESTIGATION'), {
      code: 'NO_REQUIRED_INVESTIGATION',
    });
  }
  const state = validateState(options.continuationState, investigations.length);
  const executor = options.executor ?? defaultExecutor;
  const investigation = investigations[state.next_index];
  const internalTrace = [];

  const responsePayload = await executeEvidence(
    investigation,
    executor,
    plan,
    intent,
    internalTrace,
  );
  for (const requirement of investigation.requirements) {
    state.evidence_statuses[requirement.type] = responsePayload.status;
  }

  const contextPayload = await executeContexts(investigation, executor, internalTrace);
  for (const [index, item] of contextPayload.items.entries()) {
    state.context_statuses[investigation.contexts[index].requirement.type] = item.status;
  }

  state.next_index += 1;
  const evaluation = evaluateProgress(plan, state);
  const hasNext = state.next_index < investigations.length;
  const status = evaluation.sufficiency.status === 'COMPLETE' || !hasNext
    ? 'STOP'
    : 'CONTINUE';
  const analysisIteration = {
    version: CONTRACT_VERSIONS.analysis_iteration,
    status,
    response_payload: responsePayload,
    context_payload: contextPayload,
    progress: evaluation.progress,
    sufficiency: evaluation.sufficiency,
  };

  const result = { analysis_iteration: analysisIteration };
  Object.defineProperty(result, '_continuation_state', { value: state, enumerable: false });
  if (options.includePrivateTrace) {
    result._private = {
      decision_plan: plan,
      execution_trace: internalTrace,
      investigation_count: investigations.length,
    };
  }
  return result;
}
