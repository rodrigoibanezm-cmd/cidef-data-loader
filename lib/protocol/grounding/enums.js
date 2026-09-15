export const SemanticFieldStatus = Object.freeze([
  'BOUND', 'OMITTED', 'UNRESOLVED', 'AUTHORITY_PENDING', 'DEFERRED_SELECTION',
]);

export const SemanticOperation = Object.freeze(['OBSERVE', 'PROJECT', 'COMPARE', 'ASSESS', 'EXPLAIN']);
export const SemanticConcept = Object.freeze([
  'RESULT', 'COMMERCIAL_CONDITION', 'EXPECTATION', 'TEMPORAL_BEHAVIOR', 'RELATIVE_REFERENCE', 'MARKET_POSITION',
  'RISK', 'CHANGE_CONTRIBUTION', 'CONCENTRATION', 'SIGNAL', 'ASSOCIATION', 'FLOW', 'LEAKAGE',
]);

export const ProvenanceKind = Object.freeze([
  'USER_EXPLICIT', 'LINGUISTICALLY_INFERRED', 'CONVERSATION_CARRIED', 'DEFAULT_POLICY',
  'USER_CLARIFIED', 'AUTHORITY_RESOLVED',
]);

export const GROUNDING_PROVENANCE = Object.freeze(ProvenanceKind.filter((value) => value !== 'AUTHORITY_RESOLVED'));

export const ConstraintAxis = Object.freeze([
  'SUBJECT', 'PERIOD', 'COMMERCIAL_UNIVERSE', 'ORGANIZATION_SCOPE', 'MARKET_UNIVERSE',
  'GEOGRAPHY', 'COMPARISON', 'SEMANTIC_CONCEPT', 'EVIDENCE_SOURCE', 'RESPONSE_DETAIL',
]);
export const ConstraintOperator = Object.freeze(['REQUIRE', 'ALLOW_ONLY', 'EXCLUDE', 'FORBID']);
export const ClarificationIssueKind = Object.freeze([
  'MATERIAL_AMBIGUITY', 'MISSING_REQUIRED_SEMANTIC', 'CONTRADICTORY_CONSTRAINTS', 'UNRESOLVED_REFERENCE',
]);

export const DRAFT_FORBIDDEN_FIELDS = new Set([
  'canonical_id', 'alias', 'alias_mapping', 'certified_membership', 'capability', 'capability_id',
  'capability_name', 'motor', 'sql', 'table', 'availability', 'applicability', 'evidencerecord',
  'evidence_record', 'proof', 'proof_expression', 'question_family', 'decision_plan', 'goal_instance',
]);

export const MATERIAL_AXES = Object.freeze([
  'subject', 'temporal', 'scope.commercial_universe', 'scope.organization_scope',
  'scope.market_universe', 'scope.geography', 'comparison', 'grain',
  'semantic_intent.operation', 'semantic_intent.expressed_concepts', 'explicit_constraints',
]);
