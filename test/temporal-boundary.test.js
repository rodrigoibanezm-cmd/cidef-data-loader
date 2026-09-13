import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSemanticParse } from '../lib/agent-architecture/contracts.js';
import { deriveTemporalMetadata } from '../lib/temporal/periodMath.js';
import { resolveSemanticParse } from '../lib/resolve/resolveSemanticParse.js';
import { verifyResolutionToken, issueResolutionToken } from '../lib/resolve/resolutionToken.js';
import { decideIntent } from '../lib/decide/decideIntent.js';
import { analyzeIntent } from '../lib/analyze/analyzeIntent.js';

const NOW = new Date('2026-09-11T16:00:00Z');
const NOW_MS = NOW.getTime();
const SECRET = 'test-resolution-secret';
const entityResolver = async ({type,value}) => ({status:'UNIQUE',resolved:true,type,display_name:type==='COMPANY'?'CIDEF':String(value).toUpperCase(),canonical_id:'999'});
const availabilityProvider = async temporal => ({
  current_result:{available:true,through:temporal.date_to},
  market_comparison:{available:true,through:temporal.date_to},
  historical_comparison:{available:true,through:temporal.date_to},
});
function parse(question_type, entity, date_from, date_to, extra={}) {
  return {version:'semantic_parse.v1',question_type,entity,period:{date_from,date_to},comparison:extra.comparison??null,scope:extra.scope??null,depth:extra.depth??null};
}
async function resolve(question, semantic_parse, extra={}) {
  return resolveSemanticParse({question,semantic_parse},{entityResolver,availabilityProvider,tokenSecret:SECRET,now:NOW,nowMs:NOW_MS,...extra});
}
function intentFrom(bundle, overrides={}) {
  return {
    version:'intent.v1',
    question_type:overrides.question_type??bundle.understood.question_type,
    entity:overrides.entity??{type:bundle.resolved.entity.type,value:bundle.resolved.entity.display_name},
    period:overrides.period??{type:bundle.resolved.period.type,date_from:bundle.resolved.period.date_from,date_to:bundle.resolved.period.date_to},
    comparison:overrides.comparison??bundle.understood.comparison??bundle.defaults.comparison?.value??'NONE',
    scope:overrides.scope??{organization_scope:bundle.understood.scope?.organization_scope??bundle.defaults.scope.organization_scope,commercial_universe:bundle.understood.scope?.commercial_universe??bundle.defaults.scope.commercial_universe},
    depth:overrides.depth??bundle.understood.depth??bundle.defaults.depth?.value??'STANDARD',
    semantic_provenance:{question_type:'LLM_PARSED',entity:'BACKEND_RESOLVED',period:'BACKEND_RESOLVED'},
  };
}

test('1 semantic_parse accepts explicit ISO range',()=>{
  const out=validateSemanticParse(parse('RISK',{type:'BRAND',value:'Foton'},'2026-04-01','2026-06-30'));
  assert.deepEqual(out.period,{date_from:'2026-04-01',date_to:'2026-06-30'});
});
test('2 semantic_parse rejects period.expression and extra fields',()=>{
  const value=parse('STATUS',{type:'COMPANY',value:'CIDEF'},'2026-09-01','2026-09-11');
  value.period={expression:'este mes'};
  assert.throws(()=>validateSemanticParse(value),/INVALID_SEMANTIC_PERIOD/);
  value.period={date_from:'2026-09-01',date_to:'2026-09-11',expression:'este mes'};
  assert.throws(()=>validateSemanticParse(value),/INVALID_SEMANTIC_PERIOD/);
});
test('3 semantic_parse rejects impossible calendar date',()=>{
  assert.throws(()=>validateSemanticParse(parse('STATUS',{type:'COMPANY',value:'CIDEF'},'2026-02-30','2026-03-01')),/valid calendar date/);
});
test('4 semantic_parse rejects inverted range',()=>{
  assert.throws(()=>validateSemanticParse(parse('STATUS',{type:'COMPANY',value:'CIDEF'},'2026-06-30','2026-04-01')),/date_from must be <= date_to/);
});
test('semantic_parse rejects missing range endpoints',()=>{
  const p=parse('STATUS',{type:'COMPANY',value:'CIDEF'},'2026-09-01','2026-09-11');delete p.period.date_to;
  assert.throws(()=>validateSemanticParse(p),/date_to must be YYYY-MM-DD/);
});
test('5 same range plus different question text yields same backend temporal metadata',async()=>{
  const semantic=parse('RISK',{type:'BRAND',value:'Foton'},'2026-04-01','2026-06-30',{comparison:'YOY'});
  const a=await resolve('¿Qué riesgo ves en Foton?',semantic);
  const b=await resolve('Texto totalmente distinto sin expresión temporal',semantic);
  assert.deepEqual(a.resolved.period,b.resolved.period);
  const aa=verifyResolutionToken(a.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  const bb=verifyResolutionToken(b.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  assert.deepEqual(aa.period,bb.period);
});
test('6 current partial period derives PARTIAL and SAME_DAY',()=>{
  const p=deriveTemporalMetadata({date_from:'2026-09-01',date_to:'2026-09-11'},{now:NOW});
  assert.equal(p.type,'CURRENT_MTD');assert.equal(p.period_status,'PARTIAL');assert.equal(p.cutoff_mode,'SAME_DAY');
});
test('7 closed historical range derives CLOSED and FULL_PERIOD',()=>{
  const p=deriveTemporalMetadata({date_from:'2026-04-01',date_to:'2026-06-30'},{now:NOW});
  assert.equal(p.type,'LAST_CLOSED_QUARTER');assert.equal(p.period_status,'CLOSED');assert.equal(p.cutoff_mode,'FULL_PERIOD');
});
test('8 availability receives certified explicit range',async()=>{
  let seen=null;
  const bundle=await resolveSemanticParse({question:'x',semantic_parse:parse('STATUS',{type:'COMPANY',value:'CIDEF'},'2026-04-01','2026-06-30')},{entityResolver,availabilityProvider:async temporal=>{seen=temporal;return availabilityProvider(temporal);},tokenSecret:SECRET,now:NOW,nowMs:NOW_MS});
  assert.equal(bundle.ready,true);assert.equal(seen.date_from,'2026-04-01');assert.equal(seen.date_to,'2026-06-30');
});
test('9 DECIDE receives sufficient derived temporal semantics',async()=>{
  const bundle=await resolve('risk',parse('RISK',{type:'BRAND',value:'Foton'},'2026-04-01','2026-06-30',{comparison:'YOY',scope:{commercial_universe:'COMPANY'},depth:'DEEP'}));
  const authority=verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  const plan=decideIntent(intentFrom(bundle),authority);
  assert.deepEqual(plan.temporal,{type:'LAST_CLOSED_QUARTER',date_from:'2026-04-01',date_to:'2026-06-30',cutoff_mode:'FULL_PERIOD'});
});
test('10 EXECUTE mapping remains unchanged for closed BRAND current result',async()=>{
  const specs=[];
  const bundle=await resolve('risk',parse('RISK',{type:'BRAND',value:'Foton'},'2026-04-01','2026-06-30',{comparison:'YOY',scope:{commercial_universe:'COMPANY'},depth:'DEEP'}));
  const out=await analyzeIntent({resolution_id:bundle.resolution_id,intent:intentFrom(bundle)},{tokenSecret:SECRET,nowMs:NOW_MS,executor:async spec=>{specs.push(spec);return {metric:'VIN_SALES',series:[],commercial_scope:{universe:'COMPANY'}};}});
  assert.equal(specs[0].domain,'LONGITUDINAL');assert.equal(specs[0].capability,'VENTAS');assert.equal(out.analysis_iteration.status,'CONTINUE');
});
test('11 ANALYZE rejects non-ready resolution contractually before null dereference',async()=>{
  const ambiguous=async ({type})=>({status:'AMBIGUOUS',resolved:false,type});
  const bundle=await resolveSemanticParse({question:'x',semantic_parse:parse('STATUS',{type:'STORE',value:'Plaza'},'2026-04-01','2026-06-30')},{entityResolver:ambiguous,availabilityProvider,tokenSecret:SECRET,now:NOW,nowMs:NOW_MS});
  assert.equal(bundle.ready,false);
  await assert.rejects(()=>analyzeIntent({resolution_id:bundle.resolution_id,intent:{}},{tokenSecret:SECRET,nowMs:NOW_MS,executor:async()=>({})}),err=>err.code==='RESOLUTION_NOT_READY');
});
test('11b ANALYZE rejects missing temporal authority contractually',async()=>{
  const token=issueResolutionToken({ready:true,period:null,entity:{type:'COMPANY',display_name:'CIDEF'},semantic_parse:{question_type:'STATUS'},allowed:{comparison:['NONE'],depth:['STANDARD'],scope:{organization_scope:['CIDEF'],commercial_universe:['COMPANY']}},defaults:{}},{secret:SECRET,nowMs:NOW_MS});
  await assert.rejects(()=>analyzeIntent({resolution_id:token,intent:{}},{tokenSecret:SECRET,nowMs:NOW_MS,executor:async()=>({})}),err=>err.code==='RESOLUTION_TEMPORAL_AUTHORITY_REQUIRED');
});
test('12 controlled E2E RISK FOTON 2026-Q2 YOY COMPANY DEEP',async()=>{
  const semantic=parse('RISK',{type:'BRAND',value:'Foton'},'2026-04-01','2026-06-30',{comparison:'YOY',scope:{commercial_universe:'COMPANY'},depth:'DEEP'});
  const bundle=await resolve('¿Qué riesgo ves en Foton?',semantic);
  assert.equal(bundle.ready,true);
  const intent=intentFrom(bundle);
  const series=[
    {period:'2025-04',value:80},{period:'2025-05',value:90},{period:'2025-06',value:100},
    {period:'2026-04',value:85},{period:'2026-05',value:88},{period:'2026-06',value:95},
  ];
  const executor=async spec=>({metric:'VIN_SALES',grain:'BRAND',series,commercial_scope:{universe:'COMPANY'},commercial_validation:{valid:true},temporalSemantics:{lastPeriodComplete:true,cutoffMode:'FULL_PERIOD'},warnings:[],spec_seen:spec});
  const first=await analyzeIntent({resolution_id:bundle.resolution_id,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor,includePrivateTrace:true});
  assert.equal(first.analysis_iteration.status,'CONTINUE');
  assert.ok(first.analysis_iteration.continuation_id);
  const second=await analyzeIntent({resolution_id:bundle.resolution_id,intent,continuation_id:first.analysis_iteration.continuation_id},{tokenSecret:SECRET,nowMs:NOW_MS,executor,includePrivateTrace:true});
  assert.equal(second.analysis_iteration.status,'STOP');
  assert.equal(second.analysis_iteration.response_payload.status,'AVAILABLE');
  assert.equal(second.analysis_iteration.response_payload.data.aggregate.target_value,268);
  assert.equal(second.analysis_iteration.response_payload.data.aggregate.reference_value,270);
});
