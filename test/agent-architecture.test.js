import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSemanticParse, CONTRACT_VERSIONS } from '../lib/agent-architecture/contracts.js';
import { resolveSemanticParse } from '../lib/resolve/resolveSemanticParse.js';
import { issueResolutionToken, verifyResolutionToken } from '../lib/resolve/resolutionToken.js';
import { decideIntent } from '../lib/decide/decideIntent.js';
import { analyzeIntent } from '../lib/analyze/analyzeIntent.js';
import { containsForbiddenArchitecture } from '../lib/analyze/publicSanitizer.js';

const NOW = new Date('2026-09-11T16:00:00Z');
const NOW_MS = NOW.getTime();
const SECRET = 'test-resolution-secret';

const entityResolver = async ({type,value}) => {
  if (type === 'COMPANY') return {status:'UNIQUE',resolved:true,type,display_name:'CIDEF',canonical_id:'COMPANY'};
  const names = { BRAND: value.toUpperCase(), STORE:value, SELLER:value, MODEL:value.toUpperCase() };
  return {status:'UNIQUE',resolved:true,type,display_name:names[type],canonical_id:'999'};
};
const availabilityProvider = async () => ({
  current_result:{available:true,through:'2026-09-11'},
  market_comparison:{available:false,through:'2026-08-31'},
  historical_comparison:{available:true,through:'2026-08-31'},
});
const executor = async spec => ({
  status:'OK',
  metric: spec.capability === 'SHARE_TRAJECTORY' ? 'MARKET_SHARE' : 'VIN_SALES',
  value: 123,
  domain: spec.domain,
  capability: spec.capability,
  target_model_ids:[1,2],
  commercial_scope:{universe:'COMPANY'}
});

function parse(question_type, entity, expression, extra={}) {
  return {version:'semantic_parse.v1',question_type,entity,period:{expression},comparison:extra.comparison??null,scope:extra.scope??null,depth:extra.depth??null};
}
async function resolve(question, semantic_parse) {
  return resolveSemanticParse({question,semantic_parse},{entityResolver,availabilityProvider,tokenSecret:SECRET,now:NOW,nowMs:NOW_MS});
}
function intentFrom(bundle, overrides={}) {
  return {
    version:'intent.v1',
    question_type:overrides.question_type ?? bundle.understood.question_type,
    entity:overrides.entity ?? {type:bundle.resolved.entity.type,value:bundle.resolved.entity.display_name},
    period:overrides.period ?? {type:bundle.resolved.period.type,date_from:bundle.resolved.period.date_from,date_to:bundle.resolved.period.date_to},
    comparison:overrides.comparison ?? bundle.defaults.comparison?.value ?? bundle.understood.comparison ?? 'NONE',
    scope:overrides.scope ?? {organization_scope:bundle.defaults.scope.organization_scope,commercial_universe:bundle.defaults.scope.commercial_universe},
    depth:overrides.depth ?? bundle.defaults.depth?.value ?? 'STANDARD',
    semantic_provenance:{question_type:'LLM_PARSED',entity:'BACKEND_RESOLVED',period:'BACKEND_RESOLVED'}
  };
}

// contract

test('semantic_parse.v1 is closed and rejects physical fields', () => {
  const ok = validateSemanticParse(parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  assert.equal(ok.question_type,'PERFORMANCE');
  assert.throws(() => validateSemanticParse({...parse('STATUS',{type:'COMPANY',value:'CIDEF'},'este mes'),domain:'VENTAS'}), /INVALID_SEMANTIC_PARSE/);
});

test('resolve grounds temporal/entity and applies deterministic defaults without exposing architecture', async () => {
  const bundle=await resolve('¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  assert.equal(bundle.version,'resolution_bundle.v1');
  assert.equal(bundle.resolved.entity.display_name,'FOTON');
  assert.equal(bundle.resolved.period.type,'CURRENT_MTD');
  assert.equal(bundle.defaults.comparison.value,'SAME_CUTOFF_YOY');
  assert.equal(bundle.ready,true);
  assert.equal(containsForbiddenArchitecture(bundle),false);
  const authority=verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  assert.equal(authority.entity.canonical_id,'999');
  assert.equal(JSON.stringify(bundle).includes('999'),false);
});

test('resolve preserves real ambiguity instead of guessing', async () => {
  const ambiguousResolver=async ({type})=>({status:'AMBIGUOUS',resolved:false,type,candidates:[{display_name:'A'},{display_name:'B'}]});
  const bundle=await resolveSemanticParse({question:'x',semantic_parse:parse('STATUS',{type:'STORE',value:'Plaza'},'este mes')},{entityResolver:ambiguousResolver,availabilityProvider,tokenSecret:SECRET,now:NOW,nowMs:NOW_MS});
  assert.equal(bundle.ready,false);
  assert.deepEqual(bundle.missing.find(x=>x.field==='entity'),{field:'entity',kind:'MISSING_REQUIRES_USER'});
});

test('resolution token rejects tampering', async () => {
  const bundle=await resolve('¿Cómo va CIDEF este mes?',parse('PERFORMANCE',{type:'COMPANY',value:'CIDEF'},'este mes'));
  const parts=bundle.resolution_id.split('.');
  parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  const tampered=parts.join('.');
  assert.throws(()=>verifyResolutionToken(tampered,{secret:SECRET,nowMs:NOW_MS}),/INVALID_RESOLUTION_ID_SIGNATURE/);
  assert.equal(bundle.resolution_id.includes('canonical_id'),false);
});

test('DECIDE rejects invalid semantic combinations', async () => {
  const bundle=await resolve('expectativa agosto',parse('EXPECTATION',{type:'COMPANY',value:'CIDEF'},'mes pasado'));
  const authority=verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  const intent=intentFrom(bundle,{comparison:'EXPECTED'});
  assert.throws(()=>decideIntent(intent,authority),/EXPECTATION requires CURRENT_MTD/);
});

test('DECIDE family and drill policy are private deterministic output', async () => {
  const bundle=await resolve('share Foton',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'último trimestre'));
  const authority=verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  const plan=decideIntent(intentFrom(bundle,{comparison:'YOY'}),authority);
  assert.equal(plan.question_family,'COMPETITIVE_PERFORMANCE');
  assert.ok(plan.evidence_requirements.some(x=>x.type==='MARKET_REFERENCE'));
  assert.deepEqual(plan.drill_policy.allowed_dimensions,['MODEL']);
});

test('public evidence strips physical architecture and technical ids', async () => {
  const bundle=await resolve('¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  const out=await analyzeIntent({resolution_id:bundle.resolution_id,intent:intentFrom(bundle)},{tokenSecret:SECRET,nowMs:NOW_MS,executor});
  assert.equal(out.evidence_bundle.version,'evidence_bundle.v1');
  assert.equal(containsForbiddenArchitecture(out.evidence_bundle),false);
  assert.equal(JSON.stringify(out.evidence_bundle).includes('target_model_ids'),false);
  assert.equal(JSON.stringify(out.evidence_bundle).includes('SHARE_TRAJECTORY'),false);
  assert.equal('drill' in out.evidence_bundle,false);
  assert.ok(out.evidence_bundle.context.market || out.evidence_bundle.context.sales);
});

test('analyze refuses entity drift after RESOLVE', async () => {
  const bundle=await resolve('¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  const intent=intentFrom(bundle,{entity:{type:'BRAND',value:'DONGFENG'}});
  await assert.rejects(()=>analyzeIntent({resolution_id:bundle.resolution_id,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor}),/INTENT_ENTITY_DIFFERS_FROM_RESOLUTION/);
});

test('public schema exposes only RESOLVE and ANALYZE and no execution vocabulary', () => {
  const schema=JSON.parse(fs.readFileSync(new URL('../rom/schema.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(schema.paths).sort(),['/api/analyze','/api/resolve']);
  const serialized=JSON.stringify(schema).toLowerCase();
  for(const forbidden of ['"capability"','"motor"','target_model_ids','ventas_universe_v01','rvm_universe_v01','crm_universe_v01','dependency','/api/custom-gpt','"domain"']) assert.equal(serialized.includes(forbidden),false,forbidden);
});

const E2E=[
  ['¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes')],
  ['¿Cuánto creció el share de Foton el último trimestre?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'último trimestre',{comparison:'YOY'})],
  ['¿Cómo va CIDEF este mes?',parse('PERFORMANCE',{type:'COMPANY',value:'CIDEF'},'este mes')],
  ['¿Qué sucursal explica el cambio?',parse('EXPLANATION',{type:'COMPANY',value:'CIDEF'},'últimos 2 meses')],
  ['¿Qué está pasando que debería preocuparme?',parse('RISK',{type:'COMPANY',value:'CIDEF'},'este mes')],
];

for(const [question,semantic_parse] of E2E){
  test(`E2E ${question}`, async()=>{
    const resolution=await resolve(question,semantic_parse);
    assert.equal(resolution.ready,true);
    const intent=intentFrom(resolution,{comparison: semantic_parse.comparison ?? undefined});
    const out=await analyzeIntent({resolution_id:resolution.resolution_id,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor,includePrivateTrace:true});
    assert.equal(out.evidence_bundle.version,CONTRACT_VERSIONS.evidence_bundle);
    assert.equal(containsForbiddenArchitecture(out.evidence_bundle),false);
    assert.ok(out._private.decision_plan.question_family);
    assert.ok(['COMPLETE','PARTIAL','INSUFFICIENT'].includes(out.evidence_bundle.sufficiency.status));
  });
}

test('resolution token rejects expiry', async () => {
  const bundle=await resolve('¿Cómo va CIDEF este mes?',parse('PERFORMANCE',{type:'COMPANY',value:'CIDEF'},'este mes'));
  assert.throws(()=>verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS+(31*60*1000)}),/RESOLUTION_ID_EXPIRED/);
});

test('analyze refuses question_type drift after RESOLVE', async () => {
  const bundle=await resolve('¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  const intent=intentFrom(bundle,{question_type:'STATUS'});
  await assert.rejects(()=>analyzeIntent({resolution_id:bundle.resolution_id,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor}),/INTENT_QUESTION_TYPE_DIFFERS_FROM_RESOLUTION/);
});

test('analyze refuses period drift after RESOLVE', async () => {
  const bundle=await resolve('¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  const intent=intentFrom(bundle,{period:{type:bundle.resolved.period.type,date_from:bundle.resolved.period.date_from,date_to:'2026-09-10'}});
  await assert.rejects(()=>analyzeIntent({resolution_id:bundle.resolution_id,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor}),/INTENT_PERIOD_DIFFERS_FROM_RESOLUTION/);
});

test('analyze refuses comparison outside RESOLVE allowed set', async () => {
  const bundle=await resolve('¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  const authority=verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  authority.allowed.comparison=['SAME_CUTOFF_YOY'];
  const token=issueResolutionToken(authority,{secret:SECRET,nowMs:NOW_MS});
  const intent=intentFrom(bundle,{comparison:'YOY'});
  await assert.rejects(()=>analyzeIntent({resolution_id:token,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor}),/INTENT_COMPARISON_NOT_ALLOWED/);
});

test('analyze refuses organization scope outside RESOLVE allowed set', async () => {
  const bundle=await resolve('¿Cómo va CIDEF este mes?',parse('PERFORMANCE',{type:'COMPANY',value:'CIDEF'},'este mes'));
  const all=['CIDEF','INDUMOTORA','MACO_TATTERSALL','ALL'];
  const forbidden=all.find(v=>!bundle.allowed.scope.organization_scope.includes(v));
  assert.ok(forbidden,'test requires organization scope outside allowed set');
  const intent=intentFrom(bundle,{scope:{organization_scope:forbidden,commercial_universe:bundle.defaults.scope.commercial_universe}});
  await assert.rejects(()=>analyzeIntent({resolution_id:bundle.resolution_id,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor}),/INTENT_ORGANIZATION_SCOPE_NOT_ALLOWED/);
});

test('analyze refuses commercial universe outside RESOLVE allowed set', async () => {
  const bundle=await resolve('¿Cómo va CIDEF este mes?',parse('PERFORMANCE',{type:'COMPANY',value:'CIDEF'},'este mes'));
  const authority=verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  authority.allowed.scope.commercial_universe=['COMPANY'];
  const token=issueResolutionToken(authority,{secret:SECRET,nowMs:NOW_MS});
  const intent=intentFrom(bundle,{scope:{organization_scope:bundle.defaults.scope.organization_scope,commercial_universe:'OWN_STORES'}});
  await assert.rejects(()=>analyzeIntent({resolution_id:token,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor}),/INTENT_COMMERCIAL_UNIVERSE_NOT_ALLOWED/);
});

test('analyze refuses depth outside RESOLVE allowed set', async () => {
  const bundle=await resolve('¿Cómo va Foton este mes?',parse('PERFORMANCE',{type:'BRAND',value:'Foton'},'este mes'));
  const authority=verifyResolutionToken(bundle.resolution_id,{secret:SECRET,nowMs:NOW_MS});
  authority.allowed.depth=['STANDARD'];
  const token=issueResolutionToken(authority,{secret:SECRET,nowMs:NOW_MS});
  const intent=intentFrom(bundle,{depth:'DEEP'});
  await assert.rejects(()=>analyzeIntent({resolution_id:token,intent},{tokenSecret:SECRET,nowMs:NOW_MS,executor}),/INTENT_DEPTH_NOT_ALLOWED/);
});
