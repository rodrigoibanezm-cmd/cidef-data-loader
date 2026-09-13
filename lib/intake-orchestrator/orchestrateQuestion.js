import { assertSchemaValidPublicRequest } from './schemaContracts.js';
import { CIDEF_TIMEZONE, deriveTemporalMetadata } from '../temporal/periodMath.js';

const CHANGE_WORDS = /\b(crecio|crecer|cambio|cayo|caida|perdio|mejoro|evolucion|evolucionaron|bajaron|subieron|trend|changed|grew|fell|improved)\b/;

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim();
}
function title(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function extractBrand(question) {
  const text = normalize(question);
  const afterShare = text.match(/\bshare de ([a-z0-9-]+)\b/);
  if (afterShare) return title(afterShare[1]);
  const beforeShare = text.match(/^([a-z0-9][a-z0-9 -]*?)\s+(?:perdio|gano|aumento|redujo)\s+share\b/);
  return beforeShare ? title(beforeShare[1]) : null;
}
function selectedDomains(question) {
  const text = normalize(question);
  const candidates = [
    { domain: 'RVM', index: Math.min(...['share', 'mercado', 'competitiv'].map(term => { const found=text.indexOf(term); return found<0?Infinity:found; })) },
    { domain: 'VENTAS', index: Math.min(...['venta', 'vin', 'cierre', 'pace', 'sucursal'].map(term => { const found=text.indexOf(term); return found<0?Infinity:found; })) },
    { domain: 'CRM', index: Math.min(...['crm', 'lead', 'conversion', 'oportunidad'].map(term => { const found=text.indexOf(term); return found<0?Infinity:found; })) },
  ].filter(item=>Number.isFinite(item.index));
  return candidates.sort((a,b)=>a.index-b.index).map(item=>item.domain);
}
function materializedTemporal(options) {
  if (!options.period?.date_from || !options.period?.date_to) return { status:'MISSING', reason:'MATERIALIZED_PERIOD_REQUIRED', timezone:options.timezone??CIDEF_TIMEZONE };
  const metadata=deriveTemporalMetadata(options.period,{now:options.now,timezone:options.timezone??CIDEF_TIMEZONE});
  return { status:'RESOLVED', ...metadata, time_grain:'MONTH', complete_period_only:metadata.period_status==='CLOSED' };
}
function needFor(domain, question, temporal) {
  const text=normalize(question);
  if (domain==='VENTAS' && /\b(?:que|cual) sucursal explica\b/.test(text)) return 'CHANGE_CONTRIBUTION';
  if (domain==='VENTAS' && temporal.type==='CURRENT_MTD' && /\b(como vienen|como van|cierre)\b/.test(text)) return 'CURRENT_OPEN_PERIOD';
  if (CHANGE_WORDS.test(text) || (temporal.status==='RESOLVED' && temporal.type!=='CURRENT_MTD')) return 'TRAJECTORY';
  return 'BIG_PICTURE';
}
function temporalFields(temporal) {
  return { date_from:temporal.date_from,date_to:temporal.date_to,time_grain:temporal.time_grain,cutoff_mode:temporal.cutoff_mode,...(temporal.cutoff_mode==='SAME_DAY'?{cutoff_date:temporal.date_to}:{}) };
}
function request(domain,capability,input){return assertSchemaValidPublicRequest(domain,{capability,input});}
function contributionPeriods(temporal){
  if(temporal.status!=='RESOLVED'||!temporal.complete_period_only)return null;
  const start=temporal.date_from.slice(0,7),end=temporal.date_to.slice(0,7);
  return start<end?{period_a:start,period_b:end}:null;
}
function buildPlan(domain,need,temporal,entity){
  const resolvedTime=temporal.status==='RESOLVED';
  const brand=entity?.type==='BRAND'?entity.value:null;
  if(domain==='RVM'){
    const missing=[...(!brand?['entity.brand']:[]),...(!resolvedTime?['temporal']:[])];
    const input=missing.length?null:{...temporalFields(temporal),organization_scope:'ALL',entity:{brand}};
    return {domain,analytical_need:'TRAJECTORY',metric:'MARKET_SHARE',route:{capability:'SHARE_TRAJECTORY',transport_domain:'MARKET',transport_capability:'SHARE_TRAJECTORY'},scope:{organization_scope:'ALL',entity_level:'BRAND'},request:input?request('MARKET','SHARE_TRAJECTORY',input):null,missing_inputs:missing};
  }
  if(domain==='CRM'&&need==='BIG_PICTURE'){
    const missing=resolvedTime?[]:['temporal']; const input=missing.length?null:{commercial_universe:'OWN_STORES',date_from:temporal.date_from,date_to:temporal.date_to,date_axis:'ASSIGNED_AT',filters:{}};
    return {domain,analytical_need:need,metric:'LEAD_MANAGEMENT',route:{capability:'CONTEXT',transport_domain:'CRM',transport_capability:'CONTEXT'},scope:{commercial_universe:'OWN_STORES',date_axis:'ASSIGNED_AT',state_semantics:'CURRENT_STATE'},request:input?request('CRM','CONTEXT',input):null,missing_inputs:missing};
  }
  if(domain==='CRM'){
    const missing=resolvedTime?[]:['temporal']; const input=missing.length?null:{commercial_universe:'OWN_STORES',metric:'CONVERSION_RATE',grain:'TOTAL',filters:{},...temporalFields(temporal),mode:'COHORT',cohort_axis:'ASSIGNED_AT'};
    return {domain,analytical_need:'TRAJECTORY',metric:'CONVERSION_RATE',route:{capability:'LONGITUDINAL_CONTEXT',transport_domain:'CRM',transport_capability:'LONGITUDINAL_CONTEXT'},scope:{commercial_universe:'OWN_STORES',mode:'COHORT',cohort_axis:'ASSIGNED_AT',state_semantics:'CURRENT_STATE_OUTCOMES_BY_COHORT'},request:input?request('CRM','LONGITUDINAL_CONTEXT',input):null,missing_inputs:missing};
  }
  if(need==='CURRENT_OPEN_PERIOD'){
    const missing=resolvedTime?[]:['temporal']; const input=missing.length?null:{cutoff_date:temporal.date_to};
    return {domain,analytical_need:need,metric:'VIN_SALES_AND_CLOSE_FORECAST',route:{capability:'CURRENT_MONTH_CLOSE_FORECAST',transport_domain:'SALES',transport_capability:'CURRENT_MONTH_CLOSE_FORECAST'},scope:{commercial_universe:'OWN_STORES',period_status:'OPEN'},request:input?request('SALES','CURRENT_MONTH_CLOSE_FORECAST',input):null,missing_inputs:missing};
  }
  if(need==='CHANGE_CONTRIBUTION'){
    const periods=contributionPeriods(temporal);
    return {domain,analytical_need:need,metric:'VIN_SALES_CHANGE',grain:'STORE',route:{capability:'STORE_CHANGE_CONTRIBUTION',transport_domain:'SALES',transport_capability:'STORE_CHANGE_CONTRIBUTION'},scope:{commercial_universe:'OWN_STORES',interpretation:'CONTRIBUTION_NOT_CAUSALITY'},request:periods?request('SALES','STORE_CHANGE_CONTRIBUTION',periods):null,missing_inputs:periods?[]:['period_a','period_b']};
  }
  const missing=resolvedTime?[]:['temporal']; const input=missing.length?null:{commercial_universe:'COMPANY',metric:'VIN_SALES',grain:'TOTAL',filters:{},...temporalFields(temporal)};
  return {domain,analytical_need:'TRAJECTORY',metric:'VIN_SALES',route:{capability:'LONGITUDINAL_CONTEXT',transport_domain:'LONGITUDINAL',transport_capability:'VENTAS'},scope:{commercial_universe:'COMPANY'},request:input?request('LONGITUDINAL','VENTAS',input):null,missing_inputs:missing};
}
export function buildIntramonthHistoryRequest(temporal,options={}){
  if(temporal?.status!=='RESOLVED')throw new Error('RESOLVED_TEMPORAL_RANGE_REQUIRED');
  const input={start_month:temporal.date_from.slice(0,7),end_month:temporal.date_to.slice(0,7),...(options.outputMode?{output_mode:options.outputMode}:{}),...(options.milestoneDays?{milestone_days:options.milestoneDays}:{}),...(options.percentiles?{percentiles:options.percentiles}:{})};
  return request('SALES','INTRAMONTH_HISTORY',input);
}
export function orchestrateQuestion(question,options={}){
  if(typeof question!=='string'||!question.trim())throw new Error('QUESTION_REQUIRED');
  const domains=selectedDomains(question);
  const temporal=materializedTemporal(options);
  if(!domains.length)return {version:'intake_orchestrator_v01',status:'NEEDS_CLARIFICATION',question,intent:{classification:'UNRESOLVED',domains:[]},temporal,entity:null,plans:[],trace:{selected_domains:[],selected_capabilities:[],temporal_semantics:temporal.type??'UNRESOLVED',requested_grain:null,entity_level:null,discovery_required:false},clarification:'DOMAIN_AMBIGUOUS'};
  const entity=options.entity??(extractBrand(question)?{type:'BRAND',value:extractBrand(question),identity_resolution:'BACKEND'}:null);
  const plans=domains.map(domain=>buildPlan(domain,needFor(domain,question,temporal),temporal,entity));
  const missing=[...new Set(plans.flatMap(plan=>plan.missing_inputs))];
  return {version:'intake_orchestrator_v01',status:missing.length?'NEEDS_CLARIFICATION':'READY',question,intent:{classification:plans.some(plan=>plan.analytical_need==='CHANGE_CONTRIBUTION')?'DIAGNOSTIC':plans.some(plan=>plan.analytical_need==='TRAJECTORY')?'ANALYTICAL':'DESCRIPTIVE',domains},temporal,entity,plans,integration:domains.length>1?{mode:'INDEPENDENT_DOMAIN_EVIDENCE_THEN_SEMANTIC_INTEGRATION',causal_interpretation:'PROHIBITED'}:null,trace:{selected_domains:domains,selected_capabilities:plans.map(plan=>`${plan.domain}/${plan.route.capability}`),temporal_semantics:temporal.type??'UNRESOLVED',requested_grain:temporal.status==='RESOLVED'?temporal.time_grain:null,entity_level:entity?.type??null,discovery_required:false},...(missing.length?{clarification:{code:'MISSING_REQUIRED_INPUT',fields:missing}}:{})};
}
