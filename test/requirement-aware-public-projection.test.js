import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectPublicRequirement, hasPublicProjection } from '../lib/analyze/publicProjectionRegistry.js';
import { projectEvidence } from '../lib/analyze/evidenceProjection.js';

const plan = (over={}) => ({
  question_family:'CURRENT_STATUS',
  semantic_contract:{question_type:'STATUS',comparison:'NONE',depth:'STANDARD'},
  temporal:{date_from:'2026-06-01',date_to:'2026-08-31',cutoff_mode:'FULL_PERIOD'},
  scope_requirements:{organization_scope:'CIDEF',commercial_universe:'COMPANY'},
  comparability:{mode:'NONE',common_cutoff_required:false},
  ...over,
});
const intent={entity:{type:'BRAND',value:'FOTON'}};
function longitudinal(){ return {
  metric:'VIN_SALES',grain:'BRAND',series:[
    {period:'2025-06',value:10},{period:'2025-07',value:20},{period:'2025-08',value:30},
    {period:'2026-06',value:40},{period:'2026-07',value:50},{period:'2026-08',value:60},
  ],temporalSemantics:{cutoffMode:'FULL_PERIOD',lastPeriodComplete:true},
  coverage:{dimensionCoverage:[{dimension:'BRAND',resolved:150,unresolved:0,ambiguous:0,total:150},{dimension:'SELLER',resolved:100,unresolved:50,ambiguous:0,total:150}]},
  commercial_scope:{universe:'COMPANY'},commercial_validation:{valid:true,violations:[]},
  commercial_coverage:{recognized_sales:999},warnings:['LEGACY_METRIC_ALIAS_SHARE_WITHIN_CIDEF'],
  metadata:{recognition:'internal',sellerPolicy:'internal'},motor:'ventas_longitudinal_context_v01',target_model_ids:[1,2],
}; }

test('CURRENT_RESULT projects aggregate only by default and excludes operational metadata',()=>{
  const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'CURRENT_RESULT'},plan:plan(),intent,raw:longitudinal()});
  assert.equal(out.status,'AVAILABLE'); assert.equal(out.data.metric,'VIN_SALES'); assert.equal(out.data.result.value,150);
  assert.equal(out.data.period_support,undefined);
  const s=JSON.stringify(out); for(const token of ['recognition','sellerPolicy','target_model_ids','ventas_longitudinal_context_v01','SELLER']) assert.equal(s.includes(token),false,token);
});

test('CURRENT_RESULT includes exact requested periods when trajectory is semantically material',()=>{
  const p=plan({question_family:'COMPETITIVE_PERFORMANCE',semantic_contract:{question_type:'PERFORMANCE',comparison:'NONE',depth:'STANDARD'}});
  const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'CURRENT_RESULT'},plan:p,intent,raw:longitudinal()});
  assert.deepEqual(out.data.period_support.map(x=>x.period),['2026-06','2026-07','2026-08']);
});

test('MARKET_REFERENCE projects minimal share contract without full sharedContext',()=>{
  const raw={engine:'x',policy:{dependency:'x'},sharedContext:{
    entity:{entityType:'BRAND',brandId:8,brandName:'FOTON'},
    scope:{effectiveDateTo:'2026-08-31'},coverage:{monthsRequested:3,monthsReturned:3,monthsEvaluable:3},
    monthly:[{period:'2026-06',entityVin:10,marketSize:100,marketShare:.1},{period:'2026-07',entityVin:20,marketSize:200,marketShare:.1},{period:'2026-08',entityVin:30,marketSize:300,marketShare:.1}],
    change:{fromPeriod:'2026-06',toPeriod:'2026-08',shareChangePp:0,shareChangePct:0},
    validation:{ok:true,completeTemporalCoverage:true,marketShareReconciles:true},metadata:{identityAuthority:'internal'},warnings:[]}};
  const p=plan({question_family:'COMPETITIVE_PERFORMANCE',semantic_contract:{question_type:'PERFORMANCE',comparison:'MARKET',depth:'STANDARD'}});
  const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'MARKET_REFERENCE'},plan:p,intent,raw});
  assert.equal(out.status,'AVAILABLE'); assert.equal(out.data.result.entity_units,60); assert.equal(out.data.result.market_units,600); assert.equal(out.data.result.share,.1);
  assert.deepEqual(out.data.target,{type:'BRAND',name:'FOTON'});
  const s=JSON.stringify(out); for(const token of ['sharedContext','brandId','identityAuthority','engine','policy']) assert.equal(s.includes(token),false,token);
});

test('MARKET_CONTEXT projects target and peer universes without rankings, models or technical ids',()=>{
  const raw={sharedContext:{targets:[{modelId:1,brandId:2,brand:'FOTON',model:'A'}],targetObservations:[{targetModelId:1,segment:'SUV',type:'LIVIANO',fuel:'DIESEL',units:12,targetUniverseShare:.12}],universes:[{key:{segment:'SUV',type:'LIVIANO',fuel:'DIESEL'},targetModelIds:[1],totalUnits:100,totalModels:15,totalBrands:8,models:[{entityKey:'X',modelId:99,brand:'X',model:'Y',rank:1,rowCount:5,share:.3,cumulativeShare:.3}]}],validation:{identityCoverage:.98,ok:true},warnings:[]}};
  const out=projectPublicRequirement({channel:'CONTEXT',requirement:{type:'MARKET_CONTEXT'},plan:plan(),intent,raw});
  assert.equal(out.status,'AVAILABLE'); assert.equal(out.data.peer_universes[0].market_size,100); assert.equal(out.data.peer_universes[0].target_observation.units,12);
  const s=JSON.stringify(out); for(const token of ['models','targetModelIds','target_model_ids','modelId','brandId','entityKey','rowCount','cumulativeShare','rank']) assert.equal(s.includes(token),false,token);
});

test('HISTORICAL_REFERENCE default publishes only reference period',()=>{
  const p=plan({question_family:'FAIR_COMPARISON',semantic_contract:{question_type:'COMPARISON',comparison:'YOY',depth:'STANDARD'}});
  const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'HISTORICAL_REFERENCE'},plan:p,intent,raw:longitudinal()});
  assert.equal(out.status,'AVAILABLE'); assert.equal(out.data.reference.type,'SAME_PERIOD_PREVIOUS_YEAR'); assert.equal(out.data.reference.value,60);
  assert.equal(out.data.period_support,undefined);
  assert.equal(JSON.stringify(out).includes('2026-06'),false);
});

test('COMPARATIVE_TEMPORAL_SUPPORT preserves aggregate and exact monthly support',()=>{
  const p=plan({question_family:'RISK_ASSESSMENT',semantic_contract:{question_type:'RISK',comparison:'YOY',depth:'DEEP'}});
  const requirement={type:'HISTORICAL_REFERENCE',proposition:{type:'COMPARATIVE_TEMPORAL_SUPPORT',comparison:'YOY',reference:{type:'SAME_PERIOD_PREVIOUS_YEAR'},evaluation:{mode:'AGGREGATE_AND_MONTHLY_SUPPORT'}}};
  const out=projectPublicRequirement({channel:'EVIDENCE',requirement,plan:p,intent,raw:longitudinal()});
  assert.equal(out.status,'AVAILABLE'); assert.deepEqual(out.data.aggregate,{target_value:150,reference_value:60,absolute_change:90,pct_change:1.5});
  assert.deepEqual(out.data.monthly_support.map(x=>x.target_period),['2026-06','2026-07','2026-08']);
});

test('unknown evidence requirement fails closed',()=>{const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'UNKNOWN'},plan:plan(),intent,raw:{secret:'raw'}});assert.equal(out.status,'NOT_EVALUABLE');assert.equal(out.reason_code,'PUBLIC_PROJECTION_NOT_REGISTERED');assert.equal(JSON.stringify(out).includes('secret'),false);});
test('known requirement with unknown proposition fails closed',()=>{const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'HISTORICAL_REFERENCE',proposition:{type:'UNKNOWN'}},plan:plan(),intent,raw:{secret:'raw'}});assert.equal(out.reason_code,'PUBLIC_PROPOSITION_NOT_SUPPORTED');assert.equal(JSON.stringify(out).includes('secret'),false);});
test('context requirement without projection fails closed',()=>{const out=projectPublicRequirement({channel:'CONTEXT',requirement:{type:'UNKNOWN_CONTEXT'},plan:plan(),intent,raw:{secret:'raw'}});assert.equal(out.reason_code,'PUBLIC_PROJECTION_NOT_REGISTERED');assert.equal(JSON.stringify(out).includes('secret'),false);});
test('insufficient input never leaks raw',()=>{const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'CURRENT_RESULT'},plan:plan(),intent,raw:{secret:'raw'}});assert.equal(out.reason_code,'PUBLIC_CONTRACT_INSUFFICIENT_INPUT');assert.equal(JSON.stringify(out).includes('secret'),false);});
test('comparison that requires common cutoff fails when raw cannot certify it',()=>{const p=plan({semantic_contract:{question_type:'COMPARISON',comparison:'SAME_CUTOFF_YOY',depth:'STANDARD'},comparability:{mode:'SAME_CUTOFF_YOY',common_cutoff_required:true}});const out=projectPublicRequirement({channel:'EVIDENCE',requirement:{type:'HISTORICAL_REFERENCE'},plan:p,intent,raw:longitudinal()});assert.equal(out.reason_code,'PUBLIC_CONTRACT_COMPARABILITY_FAILED');});
test('registry explicitly covers required evidence/context projections',()=>{for(const [c,t,p] of [['EVIDENCE','CURRENT_RESULT'],['EVIDENCE','MARKET_REFERENCE'],['EVIDENCE','HISTORICAL_REFERENCE'],['EVIDENCE','HISTORICAL_REFERENCE','COMPARATIVE_TEMPORAL_SUPPORT'],['CONTEXT','MARKET_CONTEXT']])assert.equal(hasPublicProjection(c,t,p),true,`${c}/${t}/${p}`);});

test('shared physical execution projects each evidence requirement instead of exposing shared raw',()=>{
  const p=plan({temporal:{date_from:'2026-09-01',date_to:'2026-09-13',cutoff_mode:'SAME_DAY'},scope_requirements:{organization_scope:'CIDEF',commercial_universe:'OWN_STORES'}});
  const raw={as_of:{cutoff_date:'2026-09-13'},cidef_propio:{observed_to_date:80,forecast_close:180,forecast_status:'EVALUABLE',is_predictable:true,predictability_day:12},coverage:{current_cidef_stores:13},validation:{reconciles:true},policy:{secret:'raw'},warnings:[]};
  const out=projectEvidence({investigation:{requirements:[{type:'CURRENT_RESULT'},{type:'CLOSE_EXPECTATION'}]},plan:p,intent:{...intent,scope:{organization_scope:'CIDEF',commercial_universe:'OWN_STORES'}},raw});
  assert.equal(out.status,'AVAILABLE'); assert.equal(out.evidence.items.length,2);
  assert.deepEqual(out.evidence.items.map(x=>x.kind),['current_result','expectation']);
  assert.equal(JSON.stringify(out).includes('policy'),false);
});

test('execute wiring has no sanitize(raw) path and sanitizes projected evidence/context only',()=>{
  const source=fs.readFileSync(new URL('../lib/analyze/executeDecisionPlan.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/sanitizePublicValue\(raw\)/);
  assert.match(source,/projectEvidence\(\{ investigation, plan, intent, raw \}\)/);
  assert.match(source,/sanitizePublicValue\(projection\.evidence\)/);
  assert.match(source,/projectPublicRequirement\(\{[\s\S]*channel: 'CONTEXT'[\s\S]*raw,[\s\S]*\}\)/);
  assert.match(source,/sanitizePublicValue\(projection\.data\)/);
});
