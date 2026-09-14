import {
  createEvidenceRecord, createGoalInstance, createQuestionContract, createUniverseResolution,
} from '../contracts.js';
import { clone } from '../primitives.js';
import { LONGITUDINAL_VENTAS_CAPABILITY } from '../longitudinalVentas.js';
import {
  admitObservedValue, authorizeExecution, buildSynthesisPacket, evaluateApplicability,
  evaluateObservedResultSufficiency, issueObservedResultAction,
} from '../kernel.js';

export const SYNTHETIC_OBSERVED_VIN_VALUE = 424242;

const PERIOD = Object.freeze({
  date_from: '2026-08-01', date_to: '2026-08-31', period_status: 'CLOSED',
  timezone: 'America/Santiago', anchor_timestamp: '2026-09-01T12:00:00.000Z',
  temporal_policy_ref: 'calendar_month.closed.v1', quantity: 1, unit: 'MONTH', alignment: 'CALENDAR',
});

function materializedPeriod() {
  const output = clone(PERIOD);
  delete output.quantity; delete output.unit; delete output.alignment;
  return output;
}

export function buildObservedResultFixture() {
  const question = createQuestionContract({
    contract_version: 'question_contract.v1', question_id: 'question_fixture_001', version: 1,
    original_question: '¿Cuántos VIN Foton vendió CIDEF completo en agosto de 2026?',
    subject: { expression: 'Foton', type_constraints: ['BRAND'], reference_kind: 'DIRECT', authority_resolution_required: true },
    period: {
      semantic: { anchor: 'EXPLICIT', quantity: 1, unit: 'MONTH', closure: 'CLOSED', alignment: 'CALENDAR' },
      materialized: materializedPeriod(),
    },
    scope: {
      commercial_universe: 'COMPANY',
      organization_scope: { status: 'BOUND', value: 'CIDEF', authority_required: true },
      market_universe: { status: 'NOT_APPLICABLE' },
      geography: { status: 'BOUND', value: 'CHILE', authority_required: true },
    },
    comparison: { relation: 'NONE', reference_expression: null }, grain: 'BRAND',
    semantic_intent: { operation: 'OBSERVE', breadth: 'FOCUSED', expressed_concepts: ['RESULT'], explicit_conjunction: false },
    explicit_constraints: [], deferred_choice_axes: [],
    field_provenance: { subject: 'USER_EXPRESSION', period: 'USER_EXPRESSION_PLUS_TEMPORAL_POLICY', scope: 'USER_EXPRESSION' },
    applied_policy_refs: ['calendar_month.closed.v1'],
  });

  const resolution = createUniverseResolution({
    contract_version: 'universe_resolution.v1', resolution_id: 'resolution_fixture_001',
    question_contract_ref: question.question_contract_hash,
    subject: { entity_type: 'BRAND', canonical_id: 'brand_fixture_foton', canonical_label: 'Foton', resolution_status: 'RESOLVED', authority_ref: 'product_master.fixture.v1' },
    membership: {
      commercial_universe: 'COMPANY',
      organization_scope: { status: 'BOUND', value: 'CIDEF', authority_required: true },
      market_universe: { status: 'NOT_APPLICABLE' },
      geography: { status: 'BOUND', value: 'CHILE', authority_required: true },
    },
    temporal: { effective_period: materializedPeriod() },
    coverage: { identity: 'CERTIFIED', membership: 'CERTIFIED' },
    authority: { identity_ref: 'product_master.fixture.v1', membership_ref: 'ventas_universe.fixture.v1' },
  });

  const goal = createGoalInstance({
    contract_version: 'goal_instance.v1', goal_id: 'goal_fixture_observed_001',
    question_contract_ref: question.question_contract_hash, universe_resolution_ref: resolution.resolution_fingerprint,
    goal_type: 'OBSERVED_RESULT', evidence_class: 'REQUIRED', origin: 'USER_EXPRESSED', status: 'PENDING',
    bindings: {
      subject: clone(resolution.subject), measure: 'VIN_SALES', commercial_universe: 'COMPANY',
      organization_scope: 'CIDEF', period: clone(PERIOD), grain: 'BRAND',
    },
  });

  const availability = Object.freeze({
    snapshot_id: 'availability_fixture_001', status: 'AVAILABLE', through: '2026-08-31',
    coverage_ratio: 1, authority_refs: ['ventas_universe.fixture.v1'],
  });
  const capability = LONGITUDINAL_VENTAS_CAPABILITY;
  const decision = evaluateApplicability({ decision_id: 'decision_fixture_001', goal, capability, resolution, availability });
  const action = issueObservedResultAction({ action_id: 'action_fixture_001', protocol_id: 'protocol_fixture_001', issued_state_version: 1, goal });
  const authorization = authorizeExecution({ execution_id: 'execution_fixture_001', action, goal, capability, decision, resolution, availability });
  const evidence = admitObservedValue({ evidence_id: 'evidence_fixture_001', authorization, action, goal, capability, resolution, value: SYNTHETIC_OBSERVED_VIN_VALUE });
  const sufficiency = evaluateObservedResultSufficiency({ evaluation_id: 'evaluation_fixture_001', goal, resolution, evidence_records: [evidence] });
  const synthesis = buildSynthesisPacket({ question, goal, evaluation: sufficiency, evidence_records: [evidence] });
  return Object.freeze({ question, resolution, goal, capability, availability, decision, action, authorization, evidence, sufficiency, synthesis });
}

export function negativeFixtureDrafts() {
  const fixture = buildObservedResultFixture();
  const wrongUniverseGoal = clone(fixture.goal); delete wrongUniverseGoal.goal_fingerprint;
  wrongUniverseGoal.goal_id = 'goal_wrong_universe'; wrongUniverseGoal.bindings.commercial_universe = 'OWN_STORES';
  const wrongPeriodGoal = clone(fixture.goal); delete wrongPeriodGoal.goal_fingerprint;
  wrongPeriodGoal.goal_id = 'goal_wrong_period'; wrongPeriodGoal.bindings.period.period_status = 'PARTIAL';
  const wrongEntityGoal = clone(fixture.goal); delete wrongEntityGoal.goal_fingerprint;
  wrongEntityGoal.goal_id = 'goal_wrong_entity'; wrongEntityGoal.bindings.subject.entity_type = 'MODEL';
  const wrongGrainGoal = clone(fixture.goal); delete wrongGrainGoal.goal_fingerprint;
  wrongGrainGoal.goal_id = 'goal_wrong_grain'; wrongGrainGoal.bindings.grain = 'MODEL';
  const unresolvedResolution = clone(fixture.resolution); delete unresolvedResolution.resolution_fingerprint;
  unresolvedResolution.resolution_id = 'resolution_unresolved'; unresolvedResolution.subject.resolution_status = 'UNRESOLVED'; unresolvedResolution.coverage.identity = 'UNCERTIFIED';
  const leakingAction = clone(fixture.action); delete leakingAction.action_fingerprint;
  leakingAction.capability_id = 'LONGITUDINAL/VENTAS';
  const missingProvenanceEvidence = clone(fixture.evidence); delete missingProvenanceEvidence.evidence_fingerprint; delete missingProvenanceEvidence.provenance;
  const wrongBindingEvidence = clone(fixture.evidence); delete wrongBindingEvidence.evidence_fingerprint;
  wrongBindingEvidence.evidence_id = 'evidence_wrong_binding'; wrongBindingEvidence.semantic_binding.commercial_universe = 'OWN_STORES';
  const successWithoutClaim = clone(fixture.evidence); delete successWithoutClaim.evidence_fingerprint;
  successWithoutClaim.evidence_id = 'evidence_success_no_claim'; successWithoutClaim.claims = [];
  return {
    wrongUniverseGoal, wrongPeriodGoal, wrongEntityGoal, wrongGrainGoal, unresolvedResolution,
    leakingAction, missingProvenanceEvidence, wrongBindingEvidence, successWithoutClaim,
  };
}

export function finalizeNegativeGoal(draft) { return createGoalInstance(draft); }
export function finalizeNegativeResolution(draft) { return createUniverseResolution(draft); }
export function finalizeNegativeEvidence(draft) { return createEvidenceRecord(draft); }
