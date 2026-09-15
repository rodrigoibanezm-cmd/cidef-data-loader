import { invariant } from '../primitives.js';
import { createNativeCapabilityContract, validateNativeCapabilityContract } from './contracts.js';

export const LONGITUDINAL_VENTAS_NATIVE_CAPABILITY=createNativeCapabilityContract({
  contract_version:'capability_contract.v2',capability_id:'LONGITUDINAL/VENTAS',capability_version:'0.3',
  satisfies:{goal_types:['OBSERVED_RESULT'],claim_types:['OBSERVED_VALUE']},
  supported_bindings:{entity_types:['BRAND'],measures:['VIN_SALES'],commercial_universes:['COMPANY'],organization_scopes:['CIDEF'],period_units:['MONTH'],period_statuses:['CLOSED'],period_alignments:['CALENDAR'],grains:['BRAND'],comparisons:['NONE']},
  authority_requirements:{identity:true,membership:true,organization_scope:true,temporal:true},
  availability_requirements:{source_domain:'SALES',accepted_data_statuses:['AVAILABLE'],required_coverage:'FULL',minimum_coverage_ratio:1,through_period_end:true,limited_coverage_permitted:false},
  coverage_requirements:{full_closed_period_required:true},comparability_requirements:{required:false,supported_modes:['NONE']},constraint_policy:{mode:'PRESERVE',supported_axes:[]},
  physical:{executor_ref:'motor_registry.getMotor',motor_ref:'ventas_longitudinal_context_v01',input_contract_ref:'parseVentasLongitudinalInput.v0.3'},
  evidence:{authorized_claim_types:['OBSERVED_VALUE'],evidence_projector_ref:'protocol.evidence.observed_value.v1'},
  selection_metadata:{specialization:100,cost_class:'LOW',latency_class:'MEDIUM',semantic_transformation_distance:0},
});
const CATALOG=Object.freeze([LONGITUDINAL_VENTAS_NATIVE_CAPABILITY]);
export function listCapabilityContracts(){return CATALOG;}
export function getCapabilityContract(capabilityId){const value=CATALOG.find(item=>item.capability_id===capabilityId);invariant(value,'UNKNOWN_TARGET_CAPABILITY','$.capability_id');validateNativeCapabilityContract(value);return value;}
