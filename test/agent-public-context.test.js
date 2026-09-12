import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDecisionPlan } from '../lib/analyze/executeDecisionPlan.js';
import { CONTRACT_VERSIONS } from '../lib/agent-architecture/contracts.js';
import { containsForbiddenArchitecture } from '../lib/analyze/publicSanitizer.js';

test('EXECUTE obtains required context privately and does not expose drill policy', async () => {
  const plan={
    version:CONTRACT_VERSIONS.decision_plan,
    question_family:'COMPETITIVE_PERFORMANCE',
    semantic_contract:{question_type:'PERFORMANCE',comparison:'YOY',depth:'STANDARD'},
    evidence_requirements:[{type:'CURRENT_RESULT',requirement:'REQUIRED'},{type:'MARKET_REFERENCE',requirement:'REQUIRED'}],
    context_requirements:[{type:'MARKET_CONTEXT',requirement:'REQUIRED'}],
    comparability:{mode:'YOY',common_cutoff_required:false},
    scope_requirements:{organization_scope:null,commercial_universe:null},
    temporal:{type:'LAST_CLOSED_QUARTER',date_from:'2026-04-01',date_to:'2026-06-30',cutoff_mode:'FULL_PERIOD'},
    drill_policy:{allowed_dimensions:['MODEL'],ordering_constraints:['STORE_BEFORE_SELLER'],max_depth:1,stop_conditions:['QUESTION_SUFFICIENT','NO_ADDITIONAL_MATERIAL_EVIDENCE','UNSUPPORTED_DRILL']},
    sufficiency_contract:{required_evidence:['CURRENT_RESULT','MARKET_REFERENCE'],required_contexts:['MARKET_CONTEXT']},
  };
  const authority={entity:{type:'BRAND',display_name:'FOTON',canonical_id:'89'},defaults:{scope:{organization_scope:null,commercial_universe:null}}};
  const intent={version:'intent.v1',question_type:'PERFORMANCE',entity:{type:'BRAND',value:'FOTON'},period:{type:'LAST_CLOSED_QUARTER',date_from:'2026-04-01',date_to:'2026-06-30'},comparison:'YOY',scope:{organization_scope:null,commercial_universe:null},depth:'STANDARD',semantic_provenance:{}};
  const executor=async spec=>({status:'OK',domain:spec.domain,capability:spec.capability,engine:'private_engine',policy:{table:'private_table'},value:1});
  const out=await executeDecisionPlan(plan,authority,intent,{executor,includePrivateTrace:true});
  assert.equal(out.evidence_bundle.context.market.status,'AVAILABLE');
  assert.equal('drill' in out.evidence_bundle,false);
  assert.equal(containsForbiddenArchitecture(out.evidence_bundle),false);
  assert.equal(out._private.drill_control.stop_condition,'QUESTION_SUFFICIENT');
  assert.ok(out._private.execution_trace.some(x=>x.context_type==='MARKET_CONTEXT'));
});

test('required analytical context degrades sufficiency when unavailable', async () => {
  const plan={
    version:CONTRACT_VERSIONS.decision_plan,
    question_family:'COMPETITIVE_PERFORMANCE',
    semantic_contract:{question_type:'PERFORMANCE',comparison:'YOY',depth:'STANDARD'},
    evidence_requirements:[{type:'CURRENT_RESULT',requirement:'REQUIRED'},{type:'MARKET_REFERENCE',requirement:'REQUIRED'}],
    context_requirements:[{type:'MARKET_CONTEXT',requirement:'REQUIRED'}],
    comparability:{mode:'YOY',common_cutoff_required:false},
    scope_requirements:{organization_scope:null,commercial_universe:null},
    temporal:{type:'LAST_CLOSED_QUARTER',date_from:'2026-04-01',date_to:'2026-06-30',cutoff_mode:'FULL_PERIOD'},
    drill_policy:{allowed_dimensions:['MODEL'],ordering_constraints:['STORE_BEFORE_SELLER'],max_depth:1,stop_conditions:['QUESTION_SUFFICIENT','NO_ADDITIONAL_MATERIAL_EVIDENCE','UNSUPPORTED_DRILL']},
    sufficiency_contract:{required_evidence:['CURRENT_RESULT','MARKET_REFERENCE'],required_contexts:['MARKET_CONTEXT']},
  };
  const authority={entity:{type:'BRAND',display_name:'FOTON',canonical_id:'89'},defaults:{scope:{organization_scope:null,commercial_universe:null}}};
  const intent={version:'intent.v1',question_type:'PERFORMANCE',entity:{type:'BRAND',value:'FOTON'},period:{type:'LAST_CLOSED_QUARTER',date_from:'2026-04-01',date_to:'2026-06-30'},comparison:'YOY',scope:{organization_scope:null,commercial_universe:null},depth:'STANDARD',semantic_provenance:{}};
  const executor=async spec=>{ if(spec.capability==='COMPETITIVE_CONTEXT') throw Object.assign(new Error('context unavailable'),{code:'CONTEXT_UNAVAILABLE'}); return {status:'OK',value:1}; };
  const out=await executeDecisionPlan(plan,authority,intent,{executor});
  assert.equal(out.evidence_bundle.sufficiency.status,'PARTIAL');
  assert.ok(out.evidence_bundle.sufficiency.reason_codes.includes('REQUIRED_CONTEXT_NOT_EVALUABLE'));
  assert.equal(out.evidence_bundle.context.market.status,'NOT_EVALUABLE');
});

test('required evidence degrades sufficiency when unavailable', async () => {
  const plan={
    version:CONTRACT_VERSIONS.decision_plan,
    question_family:'CURRENT_STATUS',
    semantic_contract:{question_type:'STATUS',comparison:'NONE',depth:'STANDARD'},
    evidence_requirements:[{type:'CURRENT_RESULT',requirement:'REQUIRED'}],
    context_requirements:[],
    comparability:{mode:'NONE',common_cutoff_required:false},
    scope_requirements:{organization_scope:null,commercial_universe:'COMPANY'},
    temporal:{type:'CURRENT_MTD',date_from:'2026-09-01',date_to:'2026-09-11',cutoff_mode:'AS_OF'},
    drill_policy:{allowed_dimensions:[],ordering_constraints:['STORE_BEFORE_SELLER'],max_depth:0,stop_conditions:['QUESTION_SUFFICIENT','NO_ADDITIONAL_MATERIAL_EVIDENCE','UNSUPPORTED_DRILL']},
    sufficiency_contract:{required_evidence:['CURRENT_RESULT'],required_contexts:[]},
  };
  const authority={entity:{type:'COMPANY',display_name:'CIDEF',canonical_id:'COMPANY'},defaults:{scope:{organization_scope:null,commercial_universe:'COMPANY'}}};
  const intent={version:'intent.v1',question_type:'STATUS',entity:{type:'COMPANY',value:'CIDEF'},period:{type:'CURRENT_MTD',date_from:'2026-09-01',date_to:'2026-09-11'},comparison:'NONE',scope:{organization_scope:null,commercial_universe:'COMPANY'},depth:'STANDARD',semantic_provenance:{}};
  const executor=async()=>{ throw Object.assign(new Error('evidence unavailable'),{code:'EVIDENCE_UNAVAILABLE'}); };
  const out=await executeDecisionPlan(plan,authority,intent,{executor});
  assert.ok(['PARTIAL','INSUFFICIENT'].includes(out.evidence_bundle.sufficiency.status));
  assert.notEqual(out.evidence_bundle.sufficiency.status,'COMPLETE');
  assert.ok(out.evidence_bundle.sufficiency.reason_codes.some(code=>code.includes('REQUIRED')));
});
