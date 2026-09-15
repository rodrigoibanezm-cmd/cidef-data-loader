import { createSignalRule, createTransitionRule } from './contracts.js';

// No production signal/transition is currently justified by the sole OBSERVED_VALUE target claim.
export const TARGET_SIGNAL_RULES=Object.freeze([]);
export const TARGET_TRANSITION_RULES=Object.freeze([]);

// Test-only registry certifies mechanics without claiming production business semantics.
export const SYNTHETIC_SIGNAL_RULES=Object.freeze([createSignalRule({
  rule_id:'fixture.observed_numeric_gate',version:'1',accepted_source_goal_types:['OBSERVED_RESULT'],required_claim_types:['OBSERVED_VALUE'],
  output_signal_type:'RULE_STATUS',predicate:{operator:'NUMERIC_GTE',threshold:0},payload_schema:{status:'MATCHED'},provenance_requirements:{admitted:true,current:true},
})]);
export const SYNTHETIC_TRANSITION_RULES=Object.freeze([createTransitionRule({
  transition_rule_id:'fixture.rule_status_to_trajectory',version:'1',source_goal_type:'OBSERVED_RESULT',source_signal_type:'RULE_STATUS',
  signal_predicate:{status_equals:'MATCHED'},preconditions:['SOURCE_GOAL_SATISFIED'],target_goal_type:'TEMPORAL_TRAJECTORY',target_evidence_class:'CONDITIONAL',
  binding_rules:[{target:'semantic_binding',operator:'INHERIT_EXACT',source:'signal.semantic_binding'}],expected_contribution:['TEMPORAL_TRAJECTORY'],progress_type:'TEST_PERSISTENCE',depth_cost:1,priority:10,
})]);
