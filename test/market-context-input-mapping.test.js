import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContextRequirement } from '../lib/analyze/executionRegistry.js';
import { materializeMarketContextExecution } from '../lib/analyze/marketContextExecutionAdapter.js';
import { adaptCompetitiveContextInput } from '../lib/custom-gpt/competitiveContextInputAdapter.js';

const plan = {
  temporal: { type:'CUSTOM', date_from:'2026-06-01', date_to:'2026-08-31', cutoff_mode:'FULL_PERIOD' },
  scope_requirements: { organization_scope:'CIDEF', commercial_universe:'COMPANY' },
};
const authority = {
  entity: { type:'BRAND', canonical_id:'23', display_name:'FOTON' },
  defaults: { scope: { commercial_universe:'COMPANY' } },
};

test('MARKET_CONTEXT maps certified period and canonical entity, never empty input or public target_model_ids', () => {
  const mapped = resolveContextRequirement('MARKET_CONTEXT', plan, authority);
  assert.deepEqual(mapped, {
    key:'market',
    execution:{
      domain:'MARKET',
      capability:'COMPETITIVE_CONTEXT',
      input:{
        date_from:'2026-06-01',
        date_to:'2026-08-31',
        entity:{type:'BRAND', canonical_id:'23', display_name:'FOTON'},
      },
    },
  });
  assert.notDeepEqual(mapped.execution.input, {});
  assert.equal('target_model_ids' in mapped.execution.input, false);
});

test('backend adapter expands certified FOTON brand id through current CIDEF portfolio', async () => {
  const calls=[];
  const sql={query:async (query, params)=>{calls.push({query,params}); return [{modelo_id:'101'},{modelo_id:'102'},{modelo_id:'102'}];}};
  const mapped=resolveContextRequirement('MARKET_CONTEXT', plan, authority);
  const physical=await adaptCompetitiveContextInput(mapped.execution.input,{sql});
  assert.deepEqual(physical,{date_from:'2026-06-01',date_to:'2026-08-31',target_model_ids:[101,102]});
  assert.equal('entity' in physical,false);
  assert.match(calls[0].query,/producto_portafolio_v01/);
  assert.match(calls[0].query,/organizacion='CIDEF'/);
  assert.match(calls[0].query,/vigente=true/);
  assert.deepEqual(calls[0].params,[23]);
});

test('MODEL authority resolves only the certified model id if it is in current CIDEF portfolio', async () => {
  const modelAuthority={...authority,entity:{type:'MODEL',canonical_id:'202',display_name:'TUNLAND'}};
  const mapped=resolveContextRequirement('MARKET_CONTEXT',plan,modelAuthority);
  const sql={query:async (_query,params)=>{assert.deepEqual(params,[202]);return [{modelo_id:'202'}];}};
  const physical=await adaptCompetitiveContextInput(mapped.execution.input,{sql});
  assert.deepEqual(physical.target_model_ids,[202]);
});

test('materializer keeps target_model_ids internal to backend execution', async () => {
  const spec={domain:'MARKET',capability:'COMPETITIVE_CONTEXT',input:{date_from:'2026-06-01',date_to:'2026-08-31',entity:{type:'BRAND',canonical_id:'23',display_name:'FOTON'}}};
  const sql={query:async()=>[{modelo_id:'101'},{modelo_id:'102'}]};
  const physical=await materializeMarketContextExecution(spec,{sql});
  assert.deepEqual(physical,{domain:'MARKET',capability:'COMPETITIVE_CONTEXT',input:{date_from:'2026-06-01',date_to:'2026-08-31',target_model_ids:[101,102]}});
  assert.equal('target_model_ids' in spec.input,false);
});
