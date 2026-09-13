import test from 'node:test';
import assert from 'node:assert/strict';
import { issueResolutionToken, verifyResolutionToken } from '../lib/resolve/resolutionToken.js';

const SECRET='resolution-handoff-test-secret';
const NOW_MS=Date.parse('2026-09-13T18:00:00Z');
const authority={
  ready:true,
  semantic_parse:{version:'semantic_parse.v1',question_type:'RISK',entity:{type:'BRAND',value:'Foton'},period:{date_from:'2026-04-01',date_to:'2026-06-30'},comparison:'YOY',scope:null,depth:'STANDARD'},
  entity:{type:'BRAND',display_name:'FOTON',canonical_id:'999'},
  period:{type:'CLOSED_RANGE',date_from:'2026-04-01',date_to:'2026-06-30',period_status:'CLOSED',cutoff_mode:'FULL_PERIOD',timezone:'America/Santiago'},
  allowed:{comparison:['NONE','YOY','PREVIOUS_PERIOD','EXPECTED','PEERS','MARKET'],depth:['SUMMARY','STANDARD','DEEP'],scope:{organization_scope:['CIDEF','INDUMOTORA','MACO_TATTERSALL','ALL'],commercial_universe:['COMPANY','OWN_STORES','DEALERS']}},
  defaults:{comparison:null,depth:null,scope:{organization_scope:null,commercial_universe:null}},
};

test('resolution_id v2 is compact opaque state and round-trips byte-for-byte handoff',()=>{
  const resolution_id=issueResolutionToken(authority,{secret:SECRET,nowMs:NOW_MS});
  assert.match(resolution_id,/^v2\.[A-Za-z0-9_-]+$/);
  assert.ok(resolution_id.length<900,`resolution_id unexpectedly large: ${resolution_id.length}`);
  const analyzeRequest={resolution_id};
  assert.equal(analyzeRequest.resolution_id,resolution_id);
  assert.deepEqual(verifyResolutionToken(analyzeRequest.resolution_id,{secret:SECRET,nowMs:NOW_MS}),authority);
});

test('resolution_id v2 still rejects any token mutation',()=>{
  const resolution_id=issueResolutionToken(authority,{secret:SECRET,nowMs:NOW_MS});
  const [version,body]=resolution_id.split('.');
  const i=Math.floor(body.length/2);
  const replacement=body[i]==='A'?'B':'A';
  const tampered=`${version}.${body.slice(0,i)}${replacement}${body.slice(i+1)}`;
  assert.notEqual(tampered,resolution_id);
  assert.throws(()=>verifyResolutionToken(tampered,{secret:SECRET,nowMs:NOW_MS}),/INVALID_RESOLUTION_ID_SIGNATURE/);
});
