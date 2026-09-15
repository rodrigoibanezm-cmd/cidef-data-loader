import {
  EvidenceAdmissionPredicate, EvidenceAdmissionReason, EvidenceAdmissionStatus,
  ExecutionAttemptStatus, TechnicalErrorClass, ClaimType,
} from '../enums.js';
import {
  clone, finalizeWithHash, invariant, rejectKeysDeep, rejectUnknown, requireArray,
  requireEnum, requireObject, requireString, verifyHash,
} from '../primitives.js';
import { createGoalInstance } from '../contracts.js';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RAW_FIELDS = new Set(['raw', 'raw_payload', 'motor_payload', 'response_payload', 'context_payload', 'sql', 'debug']);

function integer(value, path, minimum = 0) {
  invariant(Number.isInteger(value) && value >= minimum, 'INVALID_INTEGER', path);
}
function instant(value, path, optional = false) {
  if (optional && value == null) return;
  invariant(TIMESTAMP.test(value || ''), 'INVALID_TIMESTAMP', path);
}
function strings(value, path, { nonEmpty = false } = {}) {
  requireArray(value, path, { nonEmpty });
  value.forEach((item, index) => requireString(item, `${path}[${index}]`));
  invariant(new Set(value).size === value.length, 'DUPLICATE_VALUE', path);
}
function ref(value, keys, path) {
  rejectUnknown(value, keys, path);
  keys.forEach(key => requireString(value[key], `${path}.${key}`));
}
function semanticBinding(value, path) {
  requireObject(value, path);
  const bindings = clone(value); const comparison = bindings.comparison; const explicit_constraints = bindings.explicit_constraints;
  delete bindings.comparison; delete bindings.explicit_constraints;
  createGoalInstance({ contract_version:'goal_instance.v1', goal_id:'evidence_binding_validation', question_contract_ref:'evidence_binding_validation', universe_resolution_ref:'evidence_binding_validation', goal_type:'OBSERVED_RESULT', evidence_class:'REQUIRED', origin:'USER_EXPRESSED', status:'PENDING', bindings, comparison, explicit_constraints });
}
function finite(value,path,{nullable=false}={}){if(nullable&&value==null)return;invariant(typeof value==='number'&&Number.isFinite(value),'INVALID_CLAIM_VALUE',path);}
function bool(value,path){invariant(typeof value==='boolean','INVALID_BOOLEAN',path);}
export function validateClaimValue(type,value,path){
  requireObject(value,path);
  if(type==='OBSERVED_VALUE'){rejectUnknown(value,['amount','unit','semantic_basis','validity','data_status'],path);finite(value.amount,`${path}.amount`);requireString(value.unit,`${path}.unit`);if(Object.hasOwn(value,'semantic_basis'))requireString(value.semantic_basis,`${path}.semantic_basis`);if(Object.hasOwn(value,'data_status'))requireEnum(value.data_status,['AVAILABLE','CONSOLIDATED','PRELIMINARY'],`${path}.data_status`);if(Object.hasOwn(value,'validity')){rejectUnknown(value.validity,['date_from','date_to'],`${path}.validity`);invariant(DATE.test(value.validity.date_from||'')&&DATE.test(value.validity.date_to||'')&&value.validity.date_from<=value.validity.date_to,'INVALID_PERIOD',`${path}.validity`);}return;}
  if(type==='OBSERVED_COMMERCIAL_CONDITION'){rejectUnknown(value,['semantic_basis','data_status','validity','price_episode_id','price_version_id','published_list_price','published_net_price','published_price_with_tax','bonus_cidef','bonus_forum','bonus_month','unit','source_status','source_files'],path);requireEnum(value.semantic_basis,['PUBLISHED_COMMERCIAL_CONDITION'],`${path}.semantic_basis`);requireEnum(value.data_status,['AVAILABLE'],`${path}.data_status`);rejectUnknown(value.validity,['date_from','date_to'],`${path}.validity`);invariant(DATE.test(value.validity.date_from||'')&&(value.validity.date_to===null||DATE.test(value.validity.date_to||''))&&(!value.validity.date_to||value.validity.date_from<=value.validity.date_to),'INVALID_PERIOD',`${path}.validity`);for(const key of ['price_episode_id','price_version_id','source_status'])requireString(String(value[key]??''),`${path}.${key}`);requireEnum(value.source_status,['OK'],`${path}.source_status`);requireEnum(value.unit,['CLP'],`${path}.unit`);const monetary=['published_list_price','published_net_price','published_price_with_tax','bonus_cidef','bonus_forum','bonus_month'];monetary.forEach(key=>finite(value[key],`${path}.${key}`,{nullable:true}));invariant(monetary.some(key=>value[key]!=null),'EMPTY_COMMERCIAL_CONDITION',path);strings(value.source_files,`${path}.source_files`);return;}
  if(type==='PROJECTED_VALUE'){rejectUnknown(value,['amount','unit','policy_ref','as_of'],path);finite(value.amount,`${path}.amount`);requireString(value.unit,`${path}.unit`);requireString(value.policy_ref,`${path}.policy_ref`);invariant(DATE.test(value.as_of||''),'INVALID_DATE',`${path}.as_of`);return;}
  if(type==='GAP_VALUE'){rejectUnknown(value,['observed_amount','expectation_amount','gap_amount','unit','sign_convention','policy_ref'],path);for(const key of ['observed_amount','expectation_amount','gap_amount'])finite(value[key],`${path}.${key}`);for(const key of ['unit','sign_convention','policy_ref'])requireString(value[key],`${path}.${key}`);return;}
  if(type==='CHANGE_VALUE'){rejectUnknown(value,['from_amount','to_amount','absolute_change','pct_change','unit','comparable_basis'],path);for(const key of ['from_amount','to_amount','absolute_change'])finite(value[key],`${path}.${key}`);finite(value.pct_change,`${path}.pct_change`,{nullable:true});requireString(value.unit,`${path}.unit`);requireEnum(value.comparable_basis,['SAME_CERTIFIED_SERIES'],`${path}.comparable_basis`);return;}
  if(type==='TRAJECTORY_SERIES'){rejectUnknown(value,['unit','observations','common_basis','minimum_observations','market_universe','data_status'],path);requireString(value.unit,`${path}.unit`);requireEnum(value.common_basis,['SAME_CERTIFIED_SERIES','CERTIFIED_RVM_MARKET_SHARE'],`${path}.common_basis`);if(Object.hasOwn(value,'market_universe'))requireString(value.market_universe,`${path}.market_universe`);if(Object.hasOwn(value,'data_status'))requireEnum(value.data_status,['CONSOLIDATED','PRELIMINARY'],`${path}.data_status`);integer(value.minimum_observations,`${path}.minimum_observations`,2);requireArray(value.observations,`${path}.observations`,{nonEmpty:true});invariant(value.observations.length>=value.minimum_observations,'INSUFFICIENT_TRAJECTORY_OBSERVATIONS',`${path}.observations`);value.observations.forEach((row,index)=>{rejectUnknown(row,['period','amount','numerator','denominator'],`${path}.observations[${index}]`);requireString(row.period,`${path}.observations[${index}].period`);finite(row.amount,`${path}.observations[${index}].amount`);if(Object.hasOwn(row,'numerator'))finite(row.numerator,`${path}.observations[${index}].numerator`);if(Object.hasOwn(row,'denominator')){finite(row.denominator,`${path}.observations[${index}].denominator`);invariant(row.denominator>0,'INVALID_DENOMINATOR',`${path}.observations[${index}].denominator`);}invariant(Object.hasOwn(row,'numerator')===Object.hasOwn(row,'denominator'),'INCOMPLETE_MARKET_BASIS',`${path}.observations[${index}]`);if(Object.hasOwn(row,'denominator'))invariant(Math.abs(row.amount-row.numerator/row.denominator)<1e-12,'MARKET_SHARE_RECONCILIATION_FAILED',`${path}.observations[${index}]`);if(index)invariant(value.observations[index-1].period<row.period,'UNORDERED_TRAJECTORY',`${path}.observations`);});return;}
  if(type==='RELATIVE_PERFORMANCE_VALUE'){rejectUnknown(value,['actual_value','comparator_value','difference','unit','comparator_ref','common_basis'],path);for(const key of ['actual_value','comparator_value','difference'])finite(value[key],`${path}.${key}`);for(const key of ['unit','comparator_ref'])requireString(value[key],`${path}.${key}`);requireEnum(value.common_basis,['CERTIFIED_SHARE_BASIS'],`${path}.common_basis`);return;}
  if(type==='MARKET_POSITION_VALUE'){rejectUnknown(value,['entity_value','market_value','share','rank','unit','denominator_ref','market_universe','data_status'],path);for(const key of ['entity_value','market_value','share'])finite(value[key],`${path}.${key}`);invariant(value.market_value>0&&Math.abs(value.share-value.entity_value/value.market_value)<1e-12,'MARKET_SHARE_RECONCILIATION_FAILED',path);finite(value.rank,`${path}.rank`,{nullable:true});for(const key of ['unit','denominator_ref','market_universe','data_status'])requireString(value[key],`${path}.${key}`);requireEnum(value.data_status,['CONSOLIDATED','PRELIMINARY'],`${path}.data_status`);return;}
  if(type==='RISK_RULE_RESULT'){rejectUnknown(value,['rule_id','rule_version','status','inputs_fingerprint','history_observations'],path);for(const key of ['rule_id','rule_version','status','inputs_fingerprint'])requireString(value[key],`${path}.${key}`);integer(value.history_observations,`${path}.history_observations`,1);return;}
  if(type==='CHANGE_CONTRIBUTION_SET'){rejectUnknown(value,['total_change','unit','components','residual','reconciled'],path);finite(value.total_change,`${path}.total_change`);finite(value.residual,`${path}.residual`);requireString(value.unit,`${path}.unit`);bool(value.reconciled,`${path}.reconciled`);requireArray(value.components,`${path}.components`);value.components.forEach((row,index)=>{rejectUnknown(row,['component_id','change','contribution_pct'],`${path}.components[${index}]`);requireString(row.component_id,`${path}.components[${index}].component_id`);finite(row.change,`${path}.components[${index}].change`);finite(row.contribution_pct,`${path}.components[${index}].contribution_pct`,{nullable:true});});return;}
  if(type==='CONCENTRATION_RESULT'){rejectUnknown(value,['denominator','distribution','threshold_pct','pareto_count','pareto_share_pct','unit','reconciled'],path);finite(value.denominator,`${path}.denominator`);finite(value.threshold_pct,`${path}.threshold_pct`);finite(value.pareto_count,`${path}.pareto_count`);finite(value.pareto_share_pct,`${path}.pareto_share_pct`);requireString(value.unit,`${path}.unit`);bool(value.reconciled,`${path}.reconciled`);requireArray(value.distribution,`${path}.distribution`);value.distribution.forEach((row,index)=>{rejectUnknown(row,['component_id','amount','share_pct'],`${path}.distribution[${index}]`);requireString(row.component_id,`${path}.distribution[${index}].component_id`);finite(row.amount,`${path}.distribution[${index}].amount`);finite(row.share_pct,`${path}.distribution[${index}].share_pct`);});return;}
  if(type==='SIGNAL_RULE_RESULT'){rejectUnknown(value,['rule_id','rule_version','status','inputs_fingerprint'],path);for(const key of Object.keys(value))requireString(value[key],`${path}.${key}`);return;}
  if(type==='ASSOCIATION_RESULT'){rejectUnknown(value,['coefficient','method','observations','causal'],path);finite(value.coefficient,`${path}.coefficient`);requireString(value.method,`${path}.method`);integer(value.observations,`${path}.observations`,2);invariant(value.causal===false,'CAUSAL_PROMOTION_FORBIDDEN',`${path}.causal`);return;}
  if(type==='FLOW_RESULT'){rejectUnknown(value,['cohort_size','stages','reconciled'],path);finite(value.cohort_size,`${path}.cohort_size`);requireArray(value.stages,`${path}.stages`);bool(value.reconciled,`${path}.reconciled`);return;}
  if(type==='LEAKAGE_RESULT'){rejectUnknown(value,['base','expected_transitions','exceptions','leakage','reconciled'],path);for(const key of ['base','expected_transitions','exceptions','leakage'])finite(value[key],`${path}.${key}`);bool(value.reconciled,`${path}.reconciled`);return;}
  invariant(false,'UNSUPPORTED_CLAIM_TYPE',path);
}

export function validateExecuteAuthorizationCommand(value) {
  rejectUnknown(value, ['contract_version', 'command_id', 'protocol_id', 'expected_state_version', 'authorization_ref', 'command_fingerprint'], '$');
  requireEnum(value.contract_version, ['execute_authorization_command.v1'], '$.contract_version');
  requireString(value.command_id, '$.command_id'); requireString(value.protocol_id, '$.protocol_id');
  integer(value.expected_state_version, '$.expected_state_version', 1);
  ref(value.authorization_ref, ['authorization_id', 'authorization_fingerprint', 'execution_fingerprint'], '$.authorization_ref');
  verifyHash(value, 'command_fingerprint', ['command_id']);
  return true;
}
export function createExecuteAuthorizationCommand(draft) {
  const value = finalizeWithHash(draft, 'command_fingerprint', ['command_id']);
  validateExecuteAuthorizationCommand(value); return value;
}

export function validateExecutionAttempt(value) {
  rejectUnknown(value, ['contract_version', 'execution_attempt_id', 'attempt_version', 'protocol_id', 'state_version_at_authorization', 'authorization_ref', 'execution_fingerprint', 'capability_ref', 'motor_ref', 'status', 'started_at', 'finished_at', 'result_ref', 'error', 'previous_attempt_fingerprint', 'attempt_fingerprint'], '$');
  requireEnum(value.contract_version, ['execution_attempt.v1'], '$.contract_version');
  for (const key of ['execution_attempt_id', 'protocol_id', 'execution_fingerprint', 'motor_ref', 'previous_attempt_fingerprint']) requireString(value[key], `$.${key}`);
  integer(value.attempt_version, '$.attempt_version', 1); integer(value.state_version_at_authorization, '$.state_version_at_authorization', 1);
  ref(value.authorization_ref, ['authorization_id', 'authorization_fingerprint'], '$.authorization_ref');
  ref(value.capability_ref, ['capability_id', 'capability_version', 'capability_contract_fingerprint'], '$.capability_ref');
  requireEnum(value.status, Object.values(ExecutionAttemptStatus), '$.status');
  instant(value.started_at, '$.started_at', true); instant(value.finished_at, '$.finished_at', true);
  if (Object.hasOwn(value, 'result_ref')) requireString(value.result_ref, '$.result_ref');
  if (Object.hasOwn(value, 'error')) {
    rejectUnknown(value.error, ['class', 'code', 'retryable'], '$.error');
    requireEnum(value.error.class, Object.values(TechnicalErrorClass), '$.error.class'); requireString(value.error.code, '$.error.code');
    invariant(typeof value.error.retryable === 'boolean', 'INVALID_BOOLEAN', '$.error.retryable');
  }
  if (value.status === ExecutionAttemptStatus.AUTHORIZED) invariant(!value.started_at && !value.finished_at && !value.error && !value.result_ref, 'INVALID_EXECUTION_LIFECYCLE', '$');
  if (value.status === ExecutionAttemptStatus.RUNNING) invariant(Boolean(value.started_at) && !value.finished_at && !value.error && !value.result_ref, 'INVALID_EXECUTION_LIFECYCLE', '$');
  if (value.status === ExecutionAttemptStatus.SUCCEEDED) invariant(Boolean(value.started_at && value.finished_at && value.result_ref) && !value.error, 'INVALID_EXECUTION_LIFECYCLE', '$');
  if (['FAILED_RETRYABLE', 'FAILED_FINAL', 'TIMED_OUT', 'CANCELLED'].includes(value.status)) invariant(Boolean(value.started_at && value.finished_at && value.error) && !value.result_ref, 'INVALID_EXECUTION_LIFECYCLE', '$');
  verifyHash(value, 'attempt_fingerprint', ['execution_attempt_id']); return true;
}
export function createExecutionAttempt(draft) {
  const value = finalizeWithHash(draft, 'attempt_fingerprint', ['execution_attempt_id']);
  validateExecutionAttempt(value); return value;
}

function validatePeriod(value, path) {
  rejectUnknown(value, ['date_from', 'date_to', 'period_status', 'alignment'], path);
  invariant(DATE.test(value.date_from || '') && DATE.test(value.date_to || '') && value.date_from <= value.date_to, 'INVALID_PERIOD', path);
  requireEnum(value.period_status, ['CLOSED', 'OPEN', 'PARTIAL'], `${path}.period_status`);
  requireEnum(value.alignment, ['CALENDAR', 'ROLLING'], `${path}.alignment`);
}
export function validateTypedClaim(value, path = '$') {
  rejectUnknown(value, ['contract_version', 'claim_type', 'subject', 'measure', 'value', 'period', 'commercial_universe', 'organization_scope', 'grain', 'comparison', 'authority_refs', 'source_execution_ref', 'claim_fingerprint'], path);
  requireEnum(value.contract_version, ['typed_claim.v1'], `${path}.contract_version`); requireEnum(value.claim_type, Object.values(ClaimType), `${path}.claim_type`);
  ref(value.subject, ['canonical_id', 'entity_type'], `${path}.subject`); requireString(value.measure, `${path}.measure`);
  validateClaimValue(value.claim_type,value.value,`${path}.value`);
  validatePeriod(value.period, `${path}.period`); requireString(value.commercial_universe, `${path}.commercial_universe`); requireString(value.organization_scope, `${path}.organization_scope`); requireString(value.grain, `${path}.grain`); requireString(value.comparison, `${path}.comparison`);
  strings(value.authority_refs, `${path}.authority_refs`, { nonEmpty: true });
  ref(value.source_execution_ref, ['execution_fingerprint', 'execution_attempt_fingerprint'], `${path}.source_execution_ref`);
  rejectKeysDeep(value, RAW_FIELDS, path); verifyHash(value, 'claim_fingerprint'); return true;
}
export function createTypedClaim(draft) {
  const value = finalizeWithHash(draft, 'claim_fingerprint'); validateTypedClaim(value); return value;
}

export function validateEvidenceRecordV2(value) {
  rejectUnknown(value, ['contract_version', 'evidence_id', 'evidence_version', 'protocol_id', 'goal_refs', 'action_ref', 'authorization_ref', 'execution_attempt_ref', 'capability', 'semantic_binding', 'claims', 'coverage', 'comparability', 'authority_refs', 'availability_snapshot_ref', 'execution_fingerprint', 'evidence_fingerprint', 'observed_at', 'admitted_at', 'provenance'], '$');
  requireEnum(value.contract_version, ['evidence_record.v2'], '$.contract_version'); requireString(value.evidence_id, '$.evidence_id'); integer(value.evidence_version, '$.evidence_version', 1); requireString(value.protocol_id, '$.protocol_id');
  strings(value.goal_refs, '$.goal_refs', { nonEmpty: true }); ref(value.action_ref, ['action_id', 'action_fingerprint'], '$.action_ref'); ref(value.authorization_ref, ['authorization_id', 'authorization_fingerprint'], '$.authorization_ref'); ref(value.execution_attempt_ref, ['execution_attempt_fingerprint'], '$.execution_attempt_ref');
  ref(value.capability, ['capability_id', 'capability_version', 'capability_contract_fingerprint'], '$.capability'); semanticBinding(value.semantic_binding, '$.semantic_binding');
  requireArray(value.claims, '$.claims', { nonEmpty: true }); value.claims.forEach((claim, index) => validateTypedClaim(claim, `$.claims[${index}]`));
  rejectUnknown(value.coverage, ['status', 'ratio', 'threshold_met'], '$.coverage'); requireEnum(value.coverage.status, ['CERTIFIED', 'LIMITED', 'MISSING'], '$.coverage.status'); invariant(typeof value.coverage.ratio === 'number' && value.coverage.ratio >= 0 && value.coverage.ratio <= 1, 'INVALID_COVERAGE', '$.coverage.ratio'); invariant(typeof value.coverage.threshold_met === 'boolean', 'INVALID_BOOLEAN', '$.coverage.threshold_met');
  rejectUnknown(value.comparability, ['status', 'mode'], '$.comparability'); requireEnum(value.comparability.status, ['NOT_REQUIRED', 'CERTIFIED', 'INSUFFICIENT'], '$.comparability.status'); requireString(value.comparability.mode, '$.comparability.mode');
  strings(value.authority_refs, '$.authority_refs', { nonEmpty: true }); requireString(value.availability_snapshot_ref, '$.availability_snapshot_ref'); requireString(value.execution_fingerprint, '$.execution_fingerprint'); instant(value.observed_at, '$.observed_at'); instant(value.admitted_at, '$.admitted_at'); requireObject(value.provenance, '$.provenance'); invariant(Object.keys(value.provenance).length > 0, 'MISSING_PROVENANCE', '$.provenance');
  rejectKeysDeep(value, RAW_FIELDS, '$'); verifyHash(value, 'evidence_fingerprint', ['evidence_id', 'observed_at', 'admitted_at']); return true;
}
export function createEvidenceRecordV2(draft) {
  const value = finalizeWithHash(draft, 'evidence_fingerprint', ['evidence_id', 'observed_at', 'admitted_at']); validateEvidenceRecordV2(value); return value;
}

export function validateEvidenceAdmissionDecision(value) {
  rejectUnknown(value, ['contract_version', 'decision_id', 'protocol_id', 'evidence_fingerprint', 'status', 'predicate_results', 'reason_codes', 'decision_fingerprint'], '$');
  requireEnum(value.contract_version, ['evidence_admission_decision.v1'], '$.contract_version'); for (const key of ['decision_id', 'protocol_id', 'evidence_fingerprint']) requireString(value[key], `$.${key}`); requireEnum(value.status, Object.values(EvidenceAdmissionStatus), '$.status');
  requireArray(value.predicate_results, '$.predicate_results'); invariant(value.predicate_results.length === EvidenceAdmissionPredicate.length, 'INCOMPLETE_ADMISSION_PREDICATES', '$.predicate_results');
  value.predicate_results.forEach((item, index) => { rejectUnknown(item, ['predicate', 'passed', 'reason_code'], `$.predicate_results[${index}]`); requireEnum(item.predicate, EvidenceAdmissionPredicate, `$.predicate_results[${index}].predicate`); invariant(typeof item.passed === 'boolean', 'INVALID_BOOLEAN', `$.predicate_results[${index}].passed`); if (!item.passed) requireEnum(item.reason_code, EvidenceAdmissionReason, `$.predicate_results[${index}].reason_code`); });
  invariant(new Set(value.predicate_results.map(item => item.predicate)).size === EvidenceAdmissionPredicate.length, 'DUPLICATE_ADMISSION_PREDICATE', '$.predicate_results'); strings(value.reason_codes, '$.reason_codes'); invariant(value.status === 'ADMITTED' ? value.reason_codes.length === 0 : value.reason_codes.length > 0, 'INVALID_ADMISSION_OUTCOME', '$'); verifyHash(value, 'decision_fingerprint', ['decision_id']); return true;
}
export function createEvidenceAdmissionDecision(draft) {
  const value = finalizeWithHash(draft, 'decision_fingerprint', ['decision_id']); validateEvidenceAdmissionDecision(value); return value;
}

export function validateEvidenceLedger(value) {
  rejectUnknown(value, ['contract_version', 'protocol_id', 'ledger_version', 'records', 'previous_ledger_hash', 'ledger_hash'], '$'); requireEnum(value.contract_version, ['evidence_ledger.v1'], '$.contract_version'); requireString(value.protocol_id, '$.protocol_id'); integer(value.ledger_version, '$.ledger_version'); requireArray(value.records, '$.records'); value.records.forEach(validateEvidenceRecordV2); invariant(new Set(value.records.map(record => record.evidence_fingerprint)).size === value.records.length, 'DUPLICATE_EVIDENCE', '$.records'); requireString(value.previous_ledger_hash, '$.previous_ledger_hash'); rejectKeysDeep(value, RAW_FIELDS, '$'); verifyHash(value, 'ledger_hash'); return true;
}
export function createEvidenceLedgerValue(draft) { const value = finalizeWithHash(draft, 'ledger_hash'); validateEvidenceLedger(value); return value; }

export const forbiddenRawEvidenceFields = RAW_FIELDS;
export const cloneEvidenceValue = clone;
