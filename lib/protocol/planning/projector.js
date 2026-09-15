import { parseVentasLongitudinalInput } from '../../longitudinal/ventas.js';
import { parseRvmBrandShareTrajectoryInput } from '../../rvm-brand-share-trajectory/buildRvmBrandShareTrajectory.js';
import { parsePricingHistoryInput } from '../../pricing-history/buildPricingHistory.js';
import { validateGoalInstance, validateUniverseResolution } from '../contracts.js';
import { clone, deepFreeze, invariant } from '../primitives.js';
import { validateNativeCapabilityContract } from './contracts.js';

function exact(value, expected, code, path) { invariant(value === expected, code, path); }

export function validateLongitudinalVentasProjection(request, { goal, capabilityContract, universeResolution }) {
  validateGoalInstance(goal); validateNativeCapabilityContract(capabilityContract); validateUniverseResolution(universeResolution);
  invariant(['LONGITUDINAL/VENTAS','LONGITUDINAL/VENTAS_TRAJECTORY','LONGITUDINAL/VENTAS_CHANGE'].includes(capabilityContract.capability_id), 'UNSUPPORTED_PROJECTOR_CAPABILITY', '$.capability_id');
  for (const key of ['executor_ref', 'motor_ref', 'input_contract_ref', 'evidence_projector_ref']) invariant(typeof request?.[key] === 'string', 'INVALID_PHYSICAL_REQUEST', `$.physical_request.${key}`);
  exact(request.executor_ref, capabilityContract.physical.executor_ref, 'EXECUTOR_PROJECTION_MISMATCH', '$.physical_request.executor_ref');
  exact(request.motor_ref, capabilityContract.physical.motor_ref, 'MOTOR_PROJECTION_MISMATCH', '$.physical_request.motor_ref');
  exact(request.input_contract_ref, capabilityContract.physical.input_contract_ref, 'INPUT_CONTRACT_PROJECTION_MISMATCH', '$.physical_request.input_contract_ref');
  exact(request.evidence_projector_ref, capabilityContract.evidence.evidence_projector_ref, 'EVIDENCE_PROJECTOR_MISMATCH', '$.physical_request.evidence_projector_ref');
  const parsed = parseVentasLongitudinalInput(request.validated_input);
  const binding = goal.bindings;
  exact(parsed.metric, binding.measure, 'PHYSICAL_MEASURE_MUTATION', '$.physical_request.validated_input.metric');
  exact(parsed.grain, binding.grain, 'PHYSICAL_GRAIN_MUTATION', '$.physical_request.validated_input.grain');
  exact(parsed.commercialUniverse, binding.commercial_universe, 'PHYSICAL_UNIVERSE_MUTATION', '$.physical_request.validated_input.commercial_universe');
  exact(parsed.dateFrom, binding.period.date_from, 'PHYSICAL_PERIOD_MUTATION', '$.physical_request.validated_input.date_from');
  exact(parsed.dateTo, binding.period.date_to, 'PHYSICAL_PERIOD_MUTATION', '$.physical_request.validated_input.date_to');
  exact(parsed.timeGrain, binding.period.unit, 'PHYSICAL_PERIOD_UNIT_MUTATION', '$.physical_request.validated_input.time_grain');
  exact(parsed.cutoffMode, 'FULL_PERIOD', 'PHYSICAL_PERIOD_COVERAGE_MUTATION', '$.physical_request.validated_input.cutoff_mode');
  invariant(parsed.cutoffDate === null, 'PHYSICAL_PERIOD_CUTOFF_FORBIDDEN', '$.physical_request.validated_input.cutoff_date');
  invariant(parsed.breakdown === null, 'PHYSICAL_BREAKDOWN_FORBIDDEN', '$.physical_request.validated_input.breakdown');
  const brandIds = parsed.filters.brand_id;
  invariant(Array.isArray(brandIds) && brandIds.length === 1 && String(brandIds[0]) === String(binding.subject.canonical_id), 'PHYSICAL_SUBJECT_MUTATION', '$.physical_request.validated_input.filters.brand_id');
  invariant(universeResolution.subject.canonical_id === binding.subject.canonical_id, 'RESOLUTION_SUBJECT_MISMATCH', '$.universeResolution.subject');
  invariant(binding.organization_scope === 'CIDEF', 'PHYSICAL_ORGANIZATION_SCOPE_UNSUPPORTED', '$.goal.bindings.organization_scope');
  invariant(capabilityContract.supported_bindings.comparisons.includes(goal.comparison ?? 'NONE'), 'PHYSICAL_COMPARISON_UNSUPPORTED', '$.goal.comparison');
  invariant((goal.explicit_constraints ?? []).length === 0, 'PHYSICAL_CONSTRAINT_UNSUPPORTED', '$.goal.explicit_constraints');
  return deepFreeze({ request: clone(request), parsed: clone(parsed) });
}

export function projectLongitudinalVentasRequest({ goal, capabilityContract, universeResolution }) {
  const binding = goal.bindings;
  const request = {
    executor_ref: capabilityContract.physical.executor_ref,
    motor_ref: capabilityContract.physical.motor_ref,
    input_contract_ref: capabilityContract.physical.input_contract_ref,
    evidence_projector_ref: capabilityContract.evidence.evidence_projector_ref,
    validated_input: {
      metric: binding.measure,
      grain: binding.grain,
      filters: { brand_id: [binding.subject.canonical_id] },
      commercial_universe: binding.commercial_universe,
      date_from: binding.period.date_from,
      date_to: binding.period.date_to,
      time_grain: binding.period.unit,
      cutoff_mode: 'FULL_PERIOD',
    },
  };
  validateLongitudinalVentasProjection(request, { goal, capabilityContract, universeResolution });
  return deepFreeze(clone(request));
}

function month(value){return value.slice(0,7);}
function assertCommon(goal,capabilityContract,universeResolution){validateGoalInstance(goal);validateNativeCapabilityContract(capabilityContract);validateUniverseResolution(universeResolution);invariant(universeResolution.subject.canonical_id===goal.bindings.subject.canonical_id,'RESOLUTION_SUBJECT_MISMATCH','$.universeResolution.subject');invariant((goal.explicit_constraints??[]).length===0,'PHYSICAL_CONSTRAINT_UNSUPPORTED','$.goal.explicit_constraints');}
function request(capabilityContract,validated_input){return deepFreeze({executor_ref:capabilityContract.physical.executor_ref,motor_ref:capabilityContract.physical.motor_ref,input_contract_ref:capabilityContract.physical.input_contract_ref,evidence_projector_ref:capabilityContract.evidence.evidence_projector_ref,validated_input:clone(validated_input)});}

export function projectVentasAnalyticalRequest({goal,capabilityContract,universeResolution}){
  assertCommon(goal,capabilityContract,universeResolution);const b=goal.bindings,id=capabilityContract.capability_id;
  if(id==='LONGITUDINAL/VENTAS_TRAJECTORY'||id==='LONGITUDINAL/VENTAS_CHANGE')return projectLongitudinalVentasRequest({goal,capabilityContract,universeResolution});
  if(['SALES/PRODUCT_CHANGE_CONTRIBUTION','SALES/STORE_CHANGE_CONTRIBUTION','SALES/SELLER_CHANGE_CONTRIBUTION'].includes(id))return request(capabilityContract,{period_a:month(b.period.date_from),period_b:month(b.period.date_to)});
  if(id==='SALES/ORGANIZATIONAL_RELATIVE_PERFORMANCE')return request(capabilityContract,{grain:b.grain==='STORE'?'tienda':'vendedor',start_month:month(b.period.date_from),end_month:month(b.period.date_to)});
  if(id==='SALES/DETERIORATION_STATUS')return request(capabilityContract,{cutoff_month:month(b.period.date_to)});
  if(id==='SALES/CURRENT_MONTH_CLOSE_FORECAST')return request(capabilityContract,{cutoff_date:b.period.date_to});
  invariant(false,'UNSUPPORTED_PROJECTOR_CAPABILITY','$.capability_id');
}

export function projectRvmShareRequest({goal,capabilityContract,universeResolution}){
  assertCommon(goal,capabilityContract,universeResolution);const b=goal.bindings;const projected=request(capabilityContract,{entity:{brand_id:Number(b.subject.canonical_id)},date_from:b.period.date_from,date_to:b.period.date_to,time_grain:b.period.unit,organization_scope:b.organization_scope,cutoff_mode:'FULL_PERIOD'});const parsed=parseRvmBrandShareTrajectoryInput(projected.validated_input);exact(String(parsed.brandId),String(b.subject.canonical_id),'PHYSICAL_SUBJECT_MUTATION','$.physical_request.validated_input.entity');exact(parsed.dateFrom,b.period.date_from,'PHYSICAL_PERIOD_MUTATION','$.physical_request.validated_input.date_from');exact(parsed.dateTo,b.period.date_to,'PHYSICAL_PERIOD_MUTATION','$.physical_request.validated_input.date_to');exact(parsed.organizationScope,b.organization_scope,'PHYSICAL_ORGANIZATION_SCOPE_UNSUPPORTED','$.physical_request.validated_input.organization_scope');return projected;
}
export function projectPricingHistoryRequest({goal,capabilityContract,universeResolution}){
  assertCommon(goal,capabilityContract,universeResolution);const b=goal.bindings;const projected=request(capabilityContract,{version_id:Number(b.subject.canonical_id),date_from:b.period.date_from,date_to:b.period.date_to,include_conflicts:false});const parsed=parsePricingHistoryInput(projected.validated_input);exact(String(parsed.versionId),String(b.subject.canonical_id),'PHYSICAL_SUBJECT_MUTATION','$.physical_request.validated_input.version_id');exact(parsed.dateFrom,b.period.date_from,'PHYSICAL_PERIOD_MUTATION','$.physical_request.validated_input.date_from');exact(parsed.dateTo,b.period.date_to,'PHYSICAL_PERIOD_MUTATION','$.physical_request.validated_input.date_to');return projected;
}

export const TARGET_REQUEST_PROJECTORS = Object.freeze({
  'LONGITUDINAL/VENTAS': projectLongitudinalVentasRequest,
  'LONGITUDINAL/VENTAS_TRAJECTORY': projectVentasAnalyticalRequest,
  'LONGITUDINAL/VENTAS_CHANGE': projectVentasAnalyticalRequest,
  'SALES/PRODUCT_CHANGE_CONTRIBUTION': projectVentasAnalyticalRequest,
  'SALES/STORE_CHANGE_CONTRIBUTION': projectVentasAnalyticalRequest,
  'SALES/SELLER_CHANGE_CONTRIBUTION': projectVentasAnalyticalRequest,
  'SALES/ORGANIZATIONAL_RELATIVE_PERFORMANCE': projectVentasAnalyticalRequest,
  'SALES/DETERIORATION_STATUS': projectVentasAnalyticalRequest,
  'SALES/CURRENT_MONTH_CLOSE_FORECAST': projectVentasAnalyticalRequest,
  'MARKET/SHARE_POSITION': projectRvmShareRequest,
  'MARKET/SHARE_TRAJECTORY': projectRvmShareRequest,
  'PRICING/HISTORY_OBSERVED': projectPricingHistoryRequest,
});
