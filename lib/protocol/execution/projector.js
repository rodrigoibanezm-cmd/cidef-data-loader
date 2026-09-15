import { clone, fingerprint, invariant, sameCanonical } from '../primitives.js';
import { createEvidenceRecordV2, createTypedClaim } from './contracts.js';

function monthKey(period) { return period.date_from.slice(0, 7); }
function fullCalendarMonth(period) {
  const end = new Date(`${period.date_from.slice(0, 7)}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  return period.date_from.endsWith('-01') && period.date_to === end.toISOString().slice(0, 10);
}
function authorityFingerprints(authorization) {
  return [authorization.authority_refs.identity_ref.authority_fingerprint,
    ...authorization.authority_refs.membership_refs.map(ref => ref.authority_fingerprint),
    authorization.authority_refs.temporal_ref.authority_fingerprint];
}
function allTrue(value){return value&&typeof value==='object'&&Object.values(value).every(item=>item===true||(item&&typeof item==='object'&&allTrue(item)));}
function finite(value,path){invariant(typeof value==='number'&&Number.isFinite(value),'UNEXPECTED_RESULT_SHAPE',path);return value;}
function engine(raw,authorization){invariant(raw&&typeof raw==='object'&&!Array.isArray(raw),'UNEXPECTED_RESULT_SHAPE','$.raw_result');invariant(raw.engine===authorization.physical_request.motor_ref||raw.motor===authorization.physical_request.motor_ref,'UNEXPECTED_RESULT_SHAPE','$.raw_result.engine');}

export function validateLongitudinalVentasRawResult(raw, authorization) {
  invariant(raw && typeof raw === 'object' && !Array.isArray(raw), 'UNEXPECTED_RESULT_SHAPE', '$.raw_result');
  const binding = authorization.semantic_binding;
  invariant(authorization.capability.capability_id === 'LONGITUDINAL/VENTAS', 'CAPABILITY_MISMATCH', '$.authorization.capability');
  invariant(authorization.physical_request.evidence_projector_ref === 'protocol.evidence.observed_value.v1', 'EVIDENCE_PROJECTOR_MISMATCH', '$.authorization.physical_request.evidence_projector_ref');
  invariant(binding.subject.entity_type === 'BRAND' && binding.measure === 'VIN_SALES' && binding.commercial_universe === 'COMPANY' && binding.organization_scope === 'CIDEF' && binding.grain === 'BRAND' && binding.comparison === 'NONE', 'UNSUPPORTED_EVIDENCE_BINDING', '$.authorization.semantic_binding');
  invariant(binding.period.period_status === 'CLOSED' && binding.period.unit === 'MONTH' && binding.period.alignment === 'CALENDAR' && fullCalendarMonth(binding.period), 'UNSUPPORTED_EVIDENCE_PERIOD', '$.authorization.semantic_binding.period');
  invariant(raw.motor === authorization.physical_request.motor_ref && raw.domain === 'VENTAS', 'UNEXPECTED_RESULT_SHAPE', '$.raw_result.motor');
  invariant(raw.metric === binding.measure && raw.grain === binding.grain && raw.timeGrain === 'MONTH', 'UNEXPECTED_RESULT_SHAPE', '$.raw_result');
  invariant(raw.dateFrom === binding.period.date_from && raw.dateTo === binding.period.date_to, 'PHYSICAL_PERIOD_MISMATCH', '$.raw_result');
  invariant(raw.commercial_scope?.universe === binding.commercial_universe && raw.commercial_validation?.valid === true, 'PHYSICAL_UNIVERSE_MISMATCH', '$.raw_result.commercial_scope');
  invariant(sameCanonical(raw.filters?.brand_id, [binding.subject.canonical_id]), 'PHYSICAL_SUBJECT_MISMATCH', '$.raw_result.filters.brand_id');
  invariant(raw.temporalSemantics?.requestedDateFrom === binding.period.date_from && raw.temporalSemantics?.requestedDateTo === binding.period.date_to && raw.temporalSemantics?.lastPeriodComplete === true, 'PHYSICAL_PERIOD_MISMATCH', '$.raw_result.temporalSemantics');
  invariant(Array.isArray(raw.series), 'UNEXPECTED_RESULT_SHAPE', '$.raw_result.series');
  invariant(raw.series.length === 1, raw.series.some(point => point?.period === monthKey(binding.period)) ? 'AMBIGUOUS_RESULT_POINT' : 'AUTHORIZED_RESULT_POINT_MISSING', '$.raw_result.series');
  const matches = raw.series.filter(point => point?.period === monthKey(binding.period));
  invariant(matches.length === 1, matches.length ? 'AMBIGUOUS_RESULT_POINT' : 'AUTHORIZED_RESULT_POINT_MISSING', '$.raw_result.series');
  invariant(typeof matches[0].value === 'number' && Number.isFinite(matches[0].value), 'UNEXPECTED_RESULT_SHAPE', '$.raw_result.series.value');
  return matches[0];
}

export function projectObservedValue({ authorization, executionAttempt, rawResult, observed_at, admitted_at, evidence_id, question_contract_ref = 'VIA_PROTOCOL_STATE' }) {
  const point = validateLongitudinalVentasRawResult(rawResult, authorization);
  invariant(authorization.authorized_claim_types.includes('OBSERVED_VALUE'), 'CLAIM_NOT_AUTHORIZED', '$.authorization.authorized_claim_types');
  const binding = authorization.semantic_binding;
  const authority_refs = authorityFingerprints(authorization);
  const claim = createTypedClaim({
    contract_version: 'typed_claim.v1', claim_type: 'OBSERVED_VALUE',
    subject: { canonical_id: binding.subject.canonical_id, entity_type: binding.subject.entity_type }, measure: binding.measure,
    value: { amount: point.value, unit: 'VIN' },
    period: { date_from: binding.period.date_from, date_to: binding.period.date_to, period_status: binding.period.period_status, alignment: binding.period.alignment },
    commercial_universe: binding.commercial_universe, organization_scope: binding.organization_scope,
    grain: binding.grain, comparison: binding.comparison, authority_refs,
    source_execution_ref: { execution_fingerprint: authorization.execution_fingerprint, execution_attempt_fingerprint: executionAttempt.attempt_fingerprint },
  });
  return createEvidenceRecordV2({
    contract_version: 'evidence_record.v2', evidence_id: evidence_id ?? `evidence_${claim.claim_fingerprint.slice(-16)}`, evidence_version: 1,
    protocol_id: authorization.protocol_id, goal_refs: [authorization.goal_ref], action_ref: clone(authorization.selected_action_ref),
    authorization_ref: { authorization_id: authorization.authorization_id, authorization_fingerprint: authorization.authorization_fingerprint },
    execution_attempt_ref: { execution_attempt_fingerprint: executionAttempt.attempt_fingerprint }, capability: clone(authorization.capability),
    semantic_binding: clone(binding), claims: [claim], coverage: { status: 'CERTIFIED', ratio: 1, threshold_met: true },
    comparability: { status: 'NOT_REQUIRED', mode: 'NONE' }, authority_refs, availability_snapshot_ref: authorization.availability_snapshot_ref,
    execution_fingerprint: authorization.execution_fingerprint, observed_at, admitted_at,
    provenance: {
      question_contract_ref, goal_ref: authorization.goal_ref,
      action_fingerprint: authorization.selected_action_ref.action_fingerprint,
      authorization_fingerprint: authorization.authorization_fingerprint,
      capability_contract_fingerprint: authorization.capability.capability_contract_fingerprint,
      execution_attempt_fingerprint: executionAttempt.attempt_fingerprint,
      availability_snapshot_ref: authorization.availability_snapshot_ref,
      typed_claim_fingerprints: [claim.claim_fingerprint],
    },
  });
}

function claimEvidence({authorization,executionAttempt,claim_type,value,coverage={status:'CERTIFIED',ratio:1,threshold_met:true},comparability,observed_at,admitted_at,evidence_id,question_contract_ref}){
  invariant(authorization.authorized_claim_types.includes(claim_type),'CLAIM_NOT_AUTHORIZED','$.authorization.authorized_claim_types');const b=authorization.semantic_binding,authority_refs=authorityFingerprints(authorization);const claim=createTypedClaim({contract_version:'typed_claim.v1',claim_type,subject:{canonical_id:b.subject.canonical_id,entity_type:b.subject.entity_type},measure:b.measure,value,period:{date_from:b.period.date_from,date_to:b.period.date_to,period_status:b.period.period_status,alignment:b.period.alignment},commercial_universe:b.commercial_universe,organization_scope:b.organization_scope,grain:b.grain,comparison:b.comparison,authority_refs,source_execution_ref:{execution_fingerprint:authorization.execution_fingerprint,execution_attempt_fingerprint:executionAttempt.attempt_fingerprint}});return createEvidenceRecordV2({contract_version:'evidence_record.v2',evidence_id:evidence_id??`evidence_${claim.claim_fingerprint.slice(-16)}`,evidence_version:1,protocol_id:authorization.protocol_id,goal_refs:[authorization.goal_ref],action_ref:clone(authorization.selected_action_ref),authorization_ref:{authorization_id:authorization.authorization_id,authorization_fingerprint:authorization.authorization_fingerprint},execution_attempt_ref:{execution_attempt_fingerprint:executionAttempt.attempt_fingerprint},capability:clone(authorization.capability),semantic_binding:clone(b),claims:[claim],coverage,comparability,authority_refs,availability_snapshot_ref:authorization.availability_snapshot_ref,execution_fingerprint:authorization.execution_fingerprint,observed_at,admitted_at,provenance:{question_contract_ref:question_contract_ref??'VIA_PROTOCOL_STATE',goal_ref:authorization.goal_ref,action_fingerprint:authorization.selected_action_ref.action_fingerprint,authorization_fingerprint:authorization.authorization_fingerprint,capability_contract_fingerprint:authorization.capability.capability_contract_fingerprint,execution_attempt_fingerprint:executionAttempt.attempt_fingerprint,availability_snapshot_ref:authorization.availability_snapshot_ref,typed_claim_fingerprints:[claim.claim_fingerprint]}});
}

export function validateTargetAnalyticalRawResult(raw,authorization){
  const id=authorization.capability.capability_id;if(id==='LONGITUDINAL/VENTAS')return validateLongitudinalVentasRawResult(raw,authorization);engine(raw,authorization);const b=authorization.semantic_binding;
  if(['LONGITUDINAL/VENTAS_TRAJECTORY','LONGITUDINAL/VENTAS_CHANGE'].includes(id)){invariant(raw.metric===b.measure&&raw.grain===b.grain&&raw.dateFrom===b.period.date_from&&raw.dateTo===b.period.date_to,'PHYSICAL_BINDING_MISMATCH','$.raw_result');invariant(raw.commercial_scope?.universe===b.commercial_universe&&raw.commercial_validation?.valid===true,'PHYSICAL_UNIVERSE_MISMATCH','$.raw_result.commercial_scope');invariant(sameCanonical(raw.filters?.brand_id,[b.subject.canonical_id])||sameCanonical(raw.filters?.model_id,[b.subject.canonical_id]),'PHYSICAL_SUBJECT_MISMATCH','$.raw_result.filters');invariant(Array.isArray(raw.series)&&raw.series.length>=2,'AUTHORIZED_RESULT_POINT_MISSING','$.raw_result.series');raw.series.forEach((point,index)=>finite(point.value,`$.raw_result.series[${index}].value`));if(id.endsWith('_CHANGE'))finite(raw.series.at(-1).absoluteChange,'$.raw_result.series.change');return raw;}
  invariant(allTrue(raw.validation),'UNEXPECTED_RESULT_SHAPE','$.raw_result.validation');
  if(id.endsWith('CHANGE_CONTRIBUTION')){invariant(raw.inputs?.period_a===b.period.date_from.slice(0,7)&&raw.inputs?.period_b===b.period.date_to.slice(0,7),'PHYSICAL_PERIOD_MISMATCH','$.raw_result.inputs');finite(raw.cidef?.delta_sales,'$.raw_result.cidef.delta_sales');return raw;}
  if(id==='SALES/ORGANIZATIONAL_RELATIVE_PERFORMANCE'){invariant(Array.isArray(raw.rows),'UNEXPECTED_RESULT_SHAPE','$.raw_result.rows');return raw;}
  if(id==='SALES/DETERIORATION_STATUS'){invariant(raw.inputs?.cutoff_month===b.period.date_to.slice(0,7)&&Array.isArray(raw.units),'PHYSICAL_PERIOD_MISMATCH','$.raw_result');return raw;}
  if(id==='SALES/CURRENT_MONTH_CLOSE_FORECAST'){invariant(raw.as_of?.cutoff_date===b.period.date_to&&raw.cidef_propio?.forecast_status==='EVALUABLE','PHYSICAL_PERIOD_MISMATCH','$.raw_result');finite(raw.cidef_propio.forecast_close,'$.raw_result.cidef_propio.forecast_close');return raw;}
  invariant(false,'UNSUPPORTED_PROJECTOR_CAPABILITY','$.authorization.capability');
}

export function projectVentasTrajectory(input){const {authorization,rawResult}=input;validateTargetAnalyticalRawResult(rawResult,authorization);return claimEvidence({...input,claim_type:'TRAJECTORY_SERIES',value:{observations:rawResult.series.map(point=>({period:point.period,amount:point.value})),unit:'VIN',minimum_observations:2,common_basis:'SAME_CERTIFIED_SERIES'},comparability:{status:'CERTIFIED',mode:'NONE'}});}
export function projectVentasChange(input){const {authorization,rawResult}=input;validateTargetAnalyticalRawResult(rawResult,authorization);const first=rawResult.series[0],last=rawResult.series.at(-1);return claimEvidence({...input,claim_type:'CHANGE_VALUE',value:{from_amount:first.value,to_amount:last.value,absolute_change:last.absoluteChange,pct_change:last.pctChange??null,unit:'VIN',comparable_basis:'SAME_CERTIFIED_SERIES'},comparability:{status:'CERTIFIED',mode:'PREVIOUS_PERIOD'}});}

function contributionRows(raw,id){if(id==='SALES/PRODUCT_CHANGE_CONTRIBUTION')return {rows:raw.models.map(row=>({component_id:String(row.modelo_id),change:row.delta_sales,contribution_pct:row.contribution_pct_of_cidef_delta})),residual:raw.identity_residual.total.delta_sales};if(id==='SALES/STORE_CHANGE_CONTRIBUTION')return {rows:raw.stores.map(row=>({component_id:String(row.sucursal_id),change:row.delta_sales,contribution_pct:row.contribution_pct_of_cidef_delta})),residual:raw.organizational_residual.total.delta_sales};const rows=raw.stores.flatMap(store=>store.sellers.map(row=>({component_id:`${store.sucursal_id}|${row.persona_id}`,change:row.delta_sales,contribution_pct:row.contribution_pct_of_cidef_delta})));const sellerResidual=raw.stores.reduce((sum,store)=>sum+store.seller_residual.delta_sales,0);return {rows,residual:sellerResidual+raw.organizational_residual.total.delta_sales};}
export function projectChangeContribution(input){const {authorization,rawResult}=input;validateTargetAnalyticalRawResult(rawResult,authorization);const result=contributionRows(rawResult,authorization.capability.capability_id);return claimEvidence({...input,claim_type:'CHANGE_CONTRIBUTION_SET',value:{total_change:rawResult.cidef.delta_sales,unit:'VIN',components:result.rows,residual:result.residual,reconciled:true},comparability:{status:'CERTIFIED',mode:'PREVIOUS_PERIOD'}});}
export function projectRelativePerformance(input){const {authorization,rawResult}=input;validateTargetAnalyticalRawResult(rawResult,authorization);const b=authorization.semantic_binding,key=b.subject.entity_type==='STORE'?'sucursal_id':'persona_id',matches=rawResult.rows.filter(row=>String(row[key])===String(b.subject.canonical_id)&&row.evaluable===true);invariant(matches.length===1,'AUTHORIZED_RESULT_POINT_MISSING','$.raw_result.rows');const row=matches[0];return claimEvidence({...input,claim_type:'RELATIVE_PERFORMANCE_VALUE',value:{actual_value:finite(row.actual_share,'$.raw_result.rows.actual_share'),comparator_value:finite(row.expected_share,'$.raw_result.rows.expected_share'),difference:finite(row.relative_gap_pp,'$.raw_result.rows.relative_gap_pp'),unit:'PERCENTAGE_POINT',comparator_ref:String(rawResult.certified_rule.baseline),common_basis:'CERTIFIED_SHARE_BASIS'},comparability:{status:'CERTIFIED',mode:'EXPECTED'}});}
export function projectDeteriorationStatus(input){const {authorization,rawResult}=input;validateTargetAnalyticalRawResult(rawResult,authorization);const matches=rawResult.units.filter(row=>String(row.unit_id)===String(authorization.semantic_binding.subject.canonical_id));invariant(matches.length===1,'AUTHORIZED_RESULT_POINT_MISSING','$.raw_result.units');const row=matches[0],inputs={observation_state:row.observation_state,status_reason:row.status_reason,current:row.current,persistence_rows:row.persistence_rows};return claimEvidence({...input,claim_type:'RISK_RULE_RESULT',value:{rule_id:'org_sales_deterioration_status',rule_version:'0.1',status:row.status,inputs_fingerprint:fingerprint(inputs),history_observations:Math.max(1,row.persistence_rows.length)},comparability:{status:'CERTIFIED',mode:'EXPECTED'}});}
export function projectCurrentMonthForecast(input){const {authorization,rawResult}=input;validateTargetAnalyticalRawResult(rawResult,authorization);const row=rawResult.cidef_propio;return claimEvidence({...input,claim_type:'PROJECTED_VALUE',value:{amount:row.forecast_close,unit:'VIN',policy_ref:'current_month_close_forecast.v0.1',as_of:rawResult.as_of.cutoff_date},coverage:{status:'LIMITED',ratio:0,threshold_met:true},comparability:{status:'NOT_REQUIRED',mode:'NONE'}});}

export const TARGET_EVIDENCE_PROJECTORS = Object.freeze({
  'protocol.evidence.observed_value.v1': projectObservedValue,
  'protocol.evidence.ventas_trajectory.v1': projectVentasTrajectory,
  'protocol.evidence.ventas_change.v1': projectVentasChange,
  'protocol.evidence.product_change_contribution.v1': projectChangeContribution,
  'protocol.evidence.store_change_contribution.v1': projectChangeContribution,
  'protocol.evidence.seller_change_contribution.v1': projectChangeContribution,
  'protocol.evidence.organizational_relative_performance.v1': projectRelativePerformance,
  'protocol.evidence.deterioration_status.v1': projectDeteriorationStatus,
  'protocol.evidence.current_month_forecast.v1': projectCurrentMonthForecast,
});
