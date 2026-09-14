import {
  bindingEquals, cloneBinding, createAction, createApplicabilityDecision, createEvidenceRecord,
  createExecutionAuthorization, createSufficiencyEvaluation, createSynthesisPacket,
  validateAction, validateApplicabilityDecision, validateAvailabilitySnapshot, validateCapabilityContract,
  validateEvidenceRecord, validateExecutionAuthorization, validateGoalInstance, validateQuestionContract,
  validateSufficiencyEvaluation, validateUniverseResolution,
} from './contracts.js';
import { ApplicabilityStatus, GoalStatus } from './enums.js';
import { clone, fingerprint, invariant, ProtocolValidationError } from './primitives.js';
import { projectLongitudinalVentasRequest } from './longitudinalVentas.js';

function includes(list, value) { return Array.isArray(list) && list.includes(value); }
function axisValue(axis) { return axis?.status === 'BOUND' ? axis.value : null; }
function publicBindings(goal) {
  return {
    subject: goal.bindings.subject.canonical_label,
    measure: goal.bindings.measure,
    commercial_universe: goal.bindings.commercial_universe,
    organization_scope: goal.bindings.organization_scope,
    period: clone(goal.bindings.period),
    grain: goal.bindings.grain,
  };
}
function actionMatchesGoal(action, goal) {
  return action.goal_id === goal.goal_id && action.goal_type === goal.goal_type
    && action.evidence_class === goal.evidence_class
    && bindingEquals(action.public_bindings, publicBindings(goal));
}

export function evaluateApplicability({ decision_id, goal, capability, resolution, availability }) {
  validateGoalInstance(goal); validateCapabilityContract(capability); validateUniverseResolution(resolution); validateAvailabilitySnapshot(availability);
  const reasons = [];
  const support = capability.supports;
  if (!includes(support.goal_types, goal.goal_type)) reasons.push('UNSUPPORTED_GOAL_TYPE');
  if (!includes(support.entity_types, goal.bindings.subject.entity_type)) reasons.push('UNSUPPORTED_ENTITY_TYPE');
  if (!includes(support.measures, goal.bindings.measure)) reasons.push('UNSUPPORTED_MEASURE');
  if (!includes(support.commercial_universes, goal.bindings.commercial_universe)) reasons.push('UNIVERSE_MISMATCH');
  if (!includes(support.organization_scopes, goal.bindings.organization_scope)) reasons.push('UNSUPPORTED_ORGANIZATION_SCOPE');
  if (!includes(support.period_units, goal.bindings.period.unit)) reasons.push('UNSUPPORTED_PERIOD_UNIT');
  if (!includes(support.period_statuses, goal.bindings.period.period_status)) reasons.push('UNSUPPORTED_PERIOD_STATUS');
  if (!includes(support.period_alignments, goal.bindings.period.alignment)) reasons.push('UNSUPPORTED_PERIOD_ALIGNMENT');
  if (!includes(support.comparisons, 'NONE')) reasons.push('UNSUPPORTED_COMPARISON');
  if (!includes(support.grains, goal.bindings.grain)) reasons.push('UNSUPPORTED_GRAIN');
  if (goal.question_contract_ref !== resolution.question_contract_ref || goal.universe_resolution_ref !== resolution.resolution_fingerprint) reasons.push('AUTHORITY_REFERENCE_MISMATCH');
  if (resolution.subject.resolution_status !== 'RESOLVED' || resolution.coverage.identity !== 'CERTIFIED') reasons.push('UNRESOLVED_IDENTITY_AUTHORITY');
  if (resolution.coverage.membership !== 'CERTIFIED') reasons.push('UNRESOLVED_MEMBERSHIP_AUTHORITY');
  if (goal.bindings.subject.canonical_id !== resolution.subject.canonical_id) reasons.push('SUBJECT_BINDING_MISMATCH');
  if (goal.bindings.commercial_universe !== resolution.membership.commercial_universe) reasons.push('UNIVERSE_BINDING_MISMATCH');
  if (goal.bindings.organization_scope !== axisValue(resolution.membership.organization_scope)) reasons.push('ORGANIZATION_BINDING_MISMATCH');
  if (goal.bindings.period.date_from !== resolution.temporal.effective_period.date_from || goal.bindings.period.date_to !== resolution.temporal.effective_period.date_to || goal.bindings.period.period_status !== resolution.temporal.effective_period.period_status) reasons.push('PERIOD_BINDING_MISMATCH');
  if (availability.status !== capability.availability_requirements.status) reasons.push('AVAILABILITY_UNMET');
  if (capability.availability_requirements.through_period_end && availability.through < goal.bindings.period.date_to) reasons.push('PERIOD_COVERAGE_UNMET');
  if (availability.coverage_ratio < capability.availability_requirements.minimum_coverage_ratio) reasons.push('COVERAGE_THRESHOLD_UNMET');
  const claims = capability.permitted_claim_types.filter((claim) => claim === 'OBSERVED_VALUE');
  if (!claims.length) reasons.push('EMPTY_CLAIM_INTERSECTION');
  return createApplicabilityDecision({
    contract_version: 'applicability_decision.v1', decision_id,
    goal_ref: goal.goal_fingerprint, capability_contract_ref: capability.capability_fingerprint,
    universe_resolution_ref: resolution.resolution_fingerprint, availability_snapshot_ref: availability.snapshot_id,
    status: reasons.length ? ApplicabilityStatus.NOT_APPLICABLE : ApplicabilityStatus.APPLICABLE,
    reason_codes: reasons,
    authorized_claim_types: reasons.length ? [] : claims,
  });
}

export function issueObservedResultAction({ action_id, protocol_id, issued_state_version, goal }) {
  validateGoalInstance(goal);
  return createAction({
    contract_version: 'action.v1', action_id, protocol_id, issued_state_version,
    goal_id: goal.goal_id, goal_type: goal.goal_type, evidence_class: goal.evidence_class,
    semantic_label: 'OBSERVE_SALES_RESULT',
    description: 'Observe the certified VIN sales result for the bound subject, universe and closed period.',
    public_bindings: publicBindings(goal), expected_contribution: ['OBSERVED_VALUE'], limitations: [],
  });
}

export function authorizeExecution({ execution_id, action, goal, capability, decision, resolution, availability }) {
  validateAction(action); validateGoalInstance(goal); validateCapabilityContract(capability); validateApplicabilityDecision(decision); validateUniverseResolution(resolution); validateAvailabilitySnapshot(availability);
  invariant(actionMatchesGoal(action, goal), 'ACTION_GOAL_MISMATCH', '$.source_action_id');
  invariant([ApplicabilityStatus.APPLICABLE, ApplicabilityStatus.APPLICABLE_WITH_LIMITED_COVERAGE].includes(decision.status), 'APPLICATION_NOT_AUTHORIZED', '$.applicability_decision_ref');
  invariant(decision.goal_ref === goal.goal_fingerprint && decision.capability_contract_ref === capability.capability_fingerprint, 'APPLICABILITY_REFERENCE_MISMATCH', '$.applicability_decision_ref');
  invariant(decision.universe_resolution_ref === resolution.resolution_fingerprint && decision.availability_snapshot_ref === availability.snapshot_id, 'APPLICABILITY_CONTEXT_MISMATCH', '$.applicability_decision_ref');
  invariant(goal.universe_resolution_ref === resolution.resolution_fingerprint, 'RESOLUTION_REFERENCE_MISMATCH', '$.universe_resolution_ref');
  invariant(resolution.coverage.identity === 'CERTIFIED' && resolution.coverage.membership === 'CERTIFIED', 'REQUIRED_AUTHORITY_MISSING', '$.universe_resolution_ref');
  const authorized = decision.authorized_claim_types.filter((claim) => capability.permitted_claim_types.includes(claim) && action.expected_contribution.includes(claim));
  invariant(authorized.length > 0, 'EMPTY_CLAIM_INTERSECTION', '$.authorized_claim_types');
  const physicalRequest = projectLongitudinalVentasRequest(goal, resolution);
  return createExecutionAuthorization({
    contract_version: 'execution_authorization.v1', execution_id, protocol_id: action.protocol_id,
    source_action_id: action.action_id, issued_state_version: action.issued_state_version, goal_id: goal.goal_id,
    capability_contract_ref: capability.capability_fingerprint, applicability_decision_ref: decision.decision_fingerprint,
    effective_binding: cloneBinding(goal.bindings), universe_resolution_ref: resolution.resolution_fingerprint,
    availability_snapshot_ref: availability.snapshot_id, authorized_claim_types: authorized,
    physical_request: clone(physicalRequest), physical_request_fingerprint: fingerprint(physicalRequest), status: 'AUTHORIZED',
  });
}

function claimBinding(claim) {
  return {
    subject: claim.subject, measure: claim.unit === 'VIN' ? 'VIN_SALES' : claim.unit,
    commercial_universe: claim.scope.commercial_universe, organization_scope: claim.scope.organization_scope,
    period: claim.period, grain: claim.grain,
  };
}

export function admitObservedValue({ evidence_id, authorization, action, goal, capability, resolution, value }) {
  validateExecutionAuthorization(authorization); validateAction(action); validateGoalInstance(goal); validateCapabilityContract(capability); validateUniverseResolution(resolution);
  invariant(authorization.source_action_id === action.action_id && authorization.goal_id === goal.goal_id, 'EXECUTION_LINEAGE_MISMATCH', '$.execution_id');
  invariant(authorization.capability_contract_ref === capability.capability_fingerprint, 'CAPABILITY_REFERENCE_MISMATCH', '$.capability_contract_ref');
  invariant(bindingEquals(authorization.effective_binding, goal.bindings), 'BINDING_DIVERGENCE', '$.semantic_binding');
  invariant(authorization.authorized_claim_types.includes('OBSERVED_VALUE') && capability.permitted_claim_types.includes('OBSERVED_VALUE'), 'UNAUTHORIZED_CLAIM_TYPE', '$.claims');
  const claim = {
    claim_type: 'OBSERVED_VALUE', value, unit: 'VIN', subject: clone(goal.bindings.subject),
    period: clone(goal.bindings.period), scope: { commercial_universe: goal.bindings.commercial_universe, organization_scope: goal.bindings.organization_scope },
    grain: goal.bindings.grain,
  };
  return createEvidenceRecord({
    contract_version: 'evidence_record.v1', evidence_id, execution_id: authorization.execution_id,
    action_id: action.action_id, goal_ids: [goal.goal_id], capability_contract_ref: capability.capability_fingerprint,
    semantic_binding: cloneBinding(goal.bindings), execution_status: 'SUCCESS', claims: [claim],
    coverage: { status: 'CERTIFIED', ratio: 1, threshold_met: true },
    authority: { identity_ref: resolution.authority.identity_ref, membership_ref: resolution.authority.membership_ref },
    provenance: { source_kind: 'SYNTHETIC_CONTRACT_FIXTURE', evidence_projector_ref: capability.evidence_projector_ref, synthetic: true },
    execution_fingerprint: authorization.execution_fingerprint,
  });
}

export function evaluateObservedResultSufficiency({ evaluation_id, goal, resolution, evidence_records = [] }) {
  validateGoalInstance(goal); validateUniverseResolution(resolution);
  const admitted = []; const rejected = []; const reasons = new Set();
  if (resolution.coverage.identity !== 'CERTIFIED' || resolution.coverage.membership !== 'CERTIFIED') reasons.add('AUTHORITY_MATCH_FAILED');
  for (const evidence of evidence_records) {
    try { validateEvidenceRecord(evidence); } catch (error) {
      if (evidence?.evidence_id) rejected.push(evidence.evidence_id);
      reasons.add(error instanceof ProtocolValidationError ? error.code : 'INVALID_EVIDENCE');
      continue;
    }
    if (!evidence.goal_ids.includes(goal.goal_id)) { rejected.push(evidence.evidence_id); reasons.add('GOAL_LINK_MISMATCH'); continue; }
    if (evidence.execution_status !== 'SUCCESS') { rejected.push(evidence.evidence_id); reasons.add('EXECUTION_NOT_SUCCESSFUL'); continue; }
    if (!evidence.claims.some((claim) => claim.claim_type === 'OBSERVED_VALUE')) { rejected.push(evidence.evidence_id); reasons.add('OBSERVATION_MISSING'); continue; }
    if (!bindingEquals(evidence.semantic_binding, goal.bindings) || evidence.claims.some((claim) => !bindingEquals(claimBinding(claim), goal.bindings))) { rejected.push(evidence.evidence_id); reasons.add('EXACT_BINDING_MISMATCH'); continue; }
    if (evidence.authority.identity_ref !== resolution.authority.identity_ref || evidence.authority.membership_ref !== resolution.authority.membership_ref) { rejected.push(evidence.evidence_id); reasons.add('AUTHORITY_MATCH_FAILED'); continue; }
    if (!evidence.coverage.threshold_met) { rejected.push(evidence.evidence_id); reasons.add('COVERAGE_THRESHOLD_NOT_MET'); continue; }
    admitted.push(evidence.evidence_id);
  }
  const satisfied = admitted.length > 0 && !reasons.has('AUTHORITY_MATCH_FAILED');
  if (!satisfied && reasons.size === 0) reasons.add('OBSERVATION_MISSING');
  return createSufficiencyEvaluation({
    contract_version: 'sufficiency_evaluation.v1', evaluation_id, goal_id: goal.goal_id,
    goal_status: satisfied ? GoalStatus.SATISFIED : GoalStatus.PENDING,
    admitted_evidence_ids: satisfied ? admitted : [], rejected_evidence_ids: rejected,
    reason_codes: satisfied ? [] : [...reasons].sort(), authorized_claim_types: satisfied ? ['OBSERVED_VALUE'] : [],
  });
}

function publicClaim(claim) {
  return {
    claim_type: claim.claim_type, value: claim.value, unit: claim.unit,
    subject: { entity_type: claim.subject.entity_type, label: claim.subject.canonical_label },
    period: clone(claim.period), scope: clone(claim.scope), grain: claim.grain,
  };
}

export function buildSynthesisPacket({ question, goal, evaluation, evidence_records = [] }) {
  validateQuestionContract(question); validateGoalInstance(goal); validateSufficiencyEvaluation(evaluation);
  invariant(evaluation.goal_id === goal.goal_id, 'EVALUATION_GOAL_MISMATCH', '$.goal_id');
  const admitted = new Set(evaluation.admitted_evidence_ids);
  const claims = [];
  const provenance = [];
  for (const evidence of evidence_records.filter((item) => admitted.has(item.evidence_id))) {
    validateEvidenceRecord(evidence);
    for (const claim of evidence.claims) {
      invariant(evaluation.authorized_claim_types.includes(claim.claim_type), 'UNAUTHORIZED_SYNTHESIS_CLAIM', '$.authorized_claims');
      claims.push(publicClaim(claim));
    }
    provenance.push({ evidence_id: evidence.evidence_id, source_kind: evidence.provenance.source_kind, synthetic: evidence.provenance.synthetic === true });
  }
  invariant(claims.length === 0 || evaluation.goal_status === GoalStatus.SATISFIED, 'CLAIMS_FROM_UNSATISFIED_GOAL', '$.authorized_claims');
  return createSynthesisPacket({
    contract_version: 'synthesis_packet.v1',
    question_contract_public_view: {
      original_question: question.original_question, subject: clone(question.subject), period: clone(question.period),
      scope: clone(question.scope), comparison: clone(question.comparison), grain: question.grain,
      semantic_intent: clone(question.semantic_intent),
    },
    outcome: evaluation.goal_status === GoalStatus.SATISFIED ? 'COMPLETE' : 'INSUFFICIENT',
    satisfied_goals: evaluation.goal_status === GoalStatus.SATISFIED ? [goal.goal_id] : [],
    unresolved_goals: evaluation.goal_status === GoalStatus.SATISFIED ? [] : [goal.goal_id],
    authorized_claims: claims,
    limitations: provenance.some((item) => item.synthetic) ? ['SYNTHETIC_FIXTURE_NOT_BUSINESS_DATA'] : [],
    provenance_summary: provenance,
    forbidden_inferences: ['TEMPORAL_CHANGE','TRAJECTORY','RELATIVE_PERFORMANCE','MARKET_POSITION','RISK','CAUSALITY'],
    response_constraints: { synthesis_only_from_authorized_claims: true, arithmetic_forbidden: true },
  });
}
