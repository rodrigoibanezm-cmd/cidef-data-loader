import { resolveCanonicalEntity } from '../../resolve/entityResolver.js';
import { buildVentasUniverse } from '../../ventas-universe/buildVentasUniverse.js';
import { buildRvmUniverse } from '../../rvm-universe/buildRvmUniverse.js';
import { createAuthorityRef } from '../contracts.js';
import { clone, invariant, sameCanonical } from '../primitives.js';
import { validateUniverseResolutionRequest } from './contracts.js';

function authority(descriptor,period){invariant(descriptor,'AUTHORITY_DESCRIPTOR_REQUIRED','$');return createAuthorityRef({...clone(descriptor),effective_period:{date_from:period.date_from,date_to:period.date_to}});}
function normalizeCandidate(value){const out={canonical_label:String(value.canonical_label??value.display_name??'').trim()};if(value.canonical_id!=null)out.canonical_id=String(value.canonical_id);return out;}

export function createLegacyEntityAuthorityAdapter({resolver=resolveCanonicalEntity,authority_descriptor,resolver_options={}}={}){
  return async function resolveIdentity(request){
    validateUniverseResolutionRequest(request);const ref=authority(authority_descriptor,request.requested_period);if(request.subject.type_constraints.length!==1)return {status:'UNSUPPORTED',authority_ref:ref,candidates:[],limitations:['MULTIPLE_ENTITY_TYPE_CONSTRAINTS_UNSUPPORTED']};
    const type=request.subject.type_constraints[0];const result=await resolver({type,value:request.subject.expression},resolver_options);const status={UNIQUE:'RESOLVED',AMBIGUOUS:'AMBIGUOUS',NOT_FOUND:'NOT_FOUND',UNSUPPORTED:'UNSUPPORTED',MISSING:'NOT_FOUND'}[result.status]??'NOT_AUTHORIZED';
    return {status,authority_ref:ref,...(status==='RESOLVED'?{canonical_id:String(result.canonical_id),canonical_label:String(result.display_name)}:{}),candidates:status==='AMBIGUOUS'?(result.candidates??[]).map(normalizeCandidate):[],limitations:[]};
  };
}

function requestedAxis(request,key){return clone(request.requested_scope[key]);}
function exactAxis(expected,actual){return sameCanonical(expected,actual);}

export function createCertifiedMembershipAdapter({provider}={}){
  invariant(typeof provider==='function','MEMBERSHIP_PROVIDER_REQUIRED','$');return async function resolveMembership(request){
    validateUniverseResolutionRequest(request);const result=await provider(request);const refs=(result.authority_descriptors??[]).map(item=>authority(item,request.requested_period));let status=result.status??'NOT_AUTHORIZED';const requested={commercial_universe:request.requested_scope.commercial_universe,organization_scope:requestedAxis(request,'organization_scope'),market_universe:requestedAxis(request,'market_universe'),geography:requestedAxis(request,'geography')};
    const returned={commercial_universe:result.commercial_universe,organization_scope:result.organization_scope,market_universe:result.market_universe,geography:result.geography};const exact=result.commercial_universe===requested.commercial_universe&&exactAxis(requested.organization_scope,result.organization_scope)&&exactAxis(requested.market_universe,result.market_universe)&&exactAxis(requested.geography,result.geography);if(status==='RESOLVED'&&!exact)status='NOT_AUTHORIZED';if(status==='RESOLVED'&&!refs.length)status='NOT_AUTHORIZED';
    return {...requested,status,authority_refs:refs,effective_from:result.effective_from??request.requested_period.date_from,effective_to:result.effective_to??request.requested_period.date_to,limitations:[...(result.limitations??[]),...(exact?[]:['REQUESTED_MEMBERSHIP_MISMATCH'])]};
  };
}

export function createVentasUniverseAuthorityAdapter({build_universe=buildVentasUniverse,authority_descriptors=[],certified_organization_scope=null,certified_geography=null}={}){
  return createCertifiedMembershipAdapter({provider:async(request)=>{
    const organization=request.requested_scope.organization_scope;const geography=request.requested_scope.geography;if(organization.status==='BOUND'&&organization.value!==certified_organization_scope)return {status:'NOT_AUTHORIZED',commercial_universe:request.requested_scope.commercial_universe,organization_scope:organization,market_universe:request.requested_scope.market_universe,geography,authority_descriptors,limitations:['ORGANIZATION_SCOPE_AUTHORITY_NOT_CERTIFIED']};if(geography.status==='BOUND'&&geography.value!==certified_geography)return {status:'NOT_AUTHORIZED',commercial_universe:request.requested_scope.commercial_universe,organization_scope:organization,market_universe:request.requested_scope.market_universe,geography,authority_descriptors,limitations:['GEOGRAPHY_AUTHORITY_NOT_CERTIFIED']};
    const universe=await build_universe({commercial_universe:request.requested_scope.commercial_universe,date_from:request.requested_period.date_from,date_to:request.requested_period.date_to});const exact=universe?.universe==='ventas_universe_v01'&&universe.commercial_universe===request.requested_scope.commercial_universe&&universe.commercial_scope?.universe===request.requested_scope.commercial_universe;return {status:exact&&universe.validation?.valid===true?'RESOLVED':'NOT_AUTHORIZED',commercial_universe:universe?.commercial_universe,organization_scope:organization,market_universe:request.requested_scope.market_universe,geography,authority_descriptors,effective_from:request.requested_period.date_from,effective_to:universe?.period?.cutoff_date??request.requested_period.date_to,limitations:exact?[]:['SALES_UNIVERSE_EXACT_SCOPE_NOT_CERTIFIED']};
  }});
}

export function createRvmUniverseAuthorityAdapter({build_universe=buildRvmUniverse,authority_descriptors=[],data_status='CONSOLIDATED'}={}){
  return createCertifiedMembershipAdapter({provider:async(request)=>{const organization=request.requested_scope.organization_scope,market=request.requested_scope.market_universe,geography=request.requested_scope.geography,exact=request.requested_scope.commercial_universe==='RVM_MARKET'&&organization.status==='BOUND'&&organization.value==='CIDEF'&&market.status==='BOUND'&&market.value==='TOTAL_RVM_MARKET'&&geography.status==='BOUND'&&geography.value==='CHILE';if(!exact)return {status:'NOT_AUTHORIZED',commercial_universe:request.requested_scope.commercial_universe,organization_scope:organization,market_universe:market,geography,authority_descriptors,limitations:['RVM_SCOPE_AUTHORITY_NOT_CERTIFIED']};const universe=await build_universe({date_from:request.requested_period.date_from,date_to:request.requested_period.date_to,organization_scope:organization.value,data_status});const valid=universe?.universe==='rvm_universe_v01'&&universe.data_status===data_status&&universe.organization_scope===organization.value&&universe.validation?.valid===true;return {status:valid?'RESOLVED':'NOT_AUTHORIZED',commercial_universe:'RVM_MARKET',organization_scope:organization,market_universe:market,geography,authority_descriptors,effective_from:request.requested_period.date_from,effective_to:universe?.period?.effective_date_to??request.requested_period.date_to,limitations:valid?[]:['RVM_UNIVERSE_AUTHORITY_INVALID']};}});
}

export function createPricingAuthorityAdapter({authority_descriptors=[]}={}){
  return createCertifiedMembershipAdapter({provider:async(request)=>{const organization=request.requested_scope.organization_scope,market=request.requested_scope.market_universe,geography=request.requested_scope.geography,exact=request.requested_scope.commercial_universe==='PUBLISHED_CONDITIONS'&&organization.status==='BOUND'&&organization.value==='CIDEF'&&market.status==='NOT_APPLICABLE'&&geography.status==='BOUND'&&geography.value==='CHILE';return {status:exact?'RESOLVED':'NOT_AUTHORIZED',commercial_universe:request.requested_scope.commercial_universe,organization_scope:organization,market_universe:market,geography,authority_descriptors,effective_from:request.requested_period.date_from,effective_to:request.requested_period.date_to,limitations:exact?['PUBLISHED_COMMERCIAL_CONDITION_ONLY']:['PRICING_SCOPE_AUTHORITY_NOT_CERTIFIED']};}});
}
