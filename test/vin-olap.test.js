import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVinOlap } from '../lib/olap/vin-engine.js';
import { normalizeText, normalizeVin, parseSourceDate } from '../lib/olap/vin-normalizers.js';
import { auditVinUniverse, reconcileAggregation, reconcileUniverse } from '../lib/olap/vin-auditors.js';
import { getMotor, listMotors } from '../lib/motors/index.js';

const rows = [
  { vin_chasis:'VIN1', vendedor:' Ana  Pérez ', fecha_nv:'01/15/26 10:00', fecha_ingreso_stk:'12/01/25 09:00', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', reservado:true, marca:'DFM' },
  { vin_chasis:'VIN2', vendedor:'ANA\tPÉREZ', fecha_nv:'02/15/26 10:00', fecha_ingreso_stk:'01/01/26 09:00', dealer_venta:'Dealer Dos', es_dealer:true, vigente:'1', reservado:false, marca:'DFM' },
  { vin_chasis:'VIN3', vendedor:null, fecha_nv:'02/20/26 10:00', fecha_ingreso_stk:'02/01/26 09:00', dealer_venta:'Dealer X', es_dealer:false, vigente:'0', reservado:false, marca:'FOTON' },
];
const dealers = [{ dealer:'DEALER UNO', dealer_id:'D1' }, { dealer:'DEALER DOS', dealer_id:'D2' }];

const base = (extra={}) => ({
  cube:'VIN_SEMANTIC_CUBE_V0.1', universe:{type:'ALL_VIN'},
  measures:[{name:'unit_count',aggregation:'SUM',as:'units'}], derived_metrics:[], dimensions:[], filters:[],
  options:{include_totals:true,include_coverage:true,include_lineage:true,include_missing_groups:true,limit:300,offset:0},
  ...extra,
});

test('vin_olap registered internally', () => {
  assert.equal(typeof getMotor('vin_olap'), 'function');
  assert.ok(listMotors().includes('vin_olap'));
});

test('normalizers and parser are deterministic', () => {
  assert.equal(normalizeText(' Ana\t Pérez '), 'ANA PÉREZ');
  assert.equal(normalizeVin('  X  ').normalized, 'X');
  assert.equal(parseSourceDate('02/15/26 10:00').status, 'parsed');
  assert.equal(parseSourceDate('99/99/26').status, 'invalid');
});

test('units by seller normalized', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'}]}), rows, dealers);
  assert.equal(r.ok,true); assert.equal(r.result.totals.units,3);
  assert.ok(r.result.rows.some(x=>x.seller==='ANA PÉREZ'&&x.units===2));
  assert.ok(r.result.rows.some(x=>x.seller==='__MISSING__'&&x.units===1));
});

test('units by seller normalized + NV month', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'}],time:{role:'NV',grain:'month',from:'2026-01-01',to:'2026-02-28'}}), rows, dealers);
  assert.ok(r.result.rows.some(x=>x.time==='2026-01'));
  assert.ok(r.result.rows.some(x=>x.time==='2026-02'));
});

test('NV time filter without grouping', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'}],time:{role:'NV',grain:null,from:'2026-02-01',to:'2026-02-28'}}), rows, dealers);
  assert.equal(r.result.totals.units,2); assert.ok(r.result.rows.every(x=>!('time' in x)));
});

test('dealer stock by dealer canonical preserves unmatched', () => {
  const r = executeVinOlap(base({universe:{type:'DEALER_STOCK'},dimensions:[{name:'dealer_sale',level:'canonical'}]}), rows, dealers);
  assert.deepEqual(r.result.rows.map(x=>x.dealer_sale).sort(), ['D1','D2']);
});

test('aging average dealer stock', () => {
  const r = executeVinOlap(base({universe:{type:'DEALER_STOCK'},dimensions:[{name:'dealer_sale',level:'canonical'}],derived_metrics:[{name:'aging_days',aggregation:'AVG',as:'aging',as_of_date:'2026-03-01'}]}), rows, dealers);
  assert.ok(r.result.rows.every(x=>typeof x.aging==='number'));
});

test('seller normalized does not require canonical', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'}]}), rows, []);
  assert.equal(r.ok,true);
});

test('limit does not alter totals or reconciliation', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'}],options:{limit:1,offset:0,include_totals:true,include_coverage:true,include_lineage:true}}), rows, dealers);
  assert.equal(r.result.rows.length,1); assert.equal(r.result.totals.units,3); assert.equal(r.result.has_more,true);
  assert.ok(r.audit.checks.some(c=>c.name==='Aggregation Reconciliation'&&c.status==='PASS'));
});

test('missing time role fails', () => {
  const r = executeVinOlap(base({time:{grain:'month',from:'2026-01-01',to:'2026-02-28'}}), rows, dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'TIME_ROLE_REQUIRED');
});

test('discount fails', () => {
  const r = executeVinOlap({...base(),measures:[{name:'discount',aggregation:'SUM'}]}, rows, dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'METRIC_NOT_AVAILABLE');
});

test('snapshot history guard fails without explicit current semantics', () => {
  const r = executeVinOlap(base({dimensions:[{name:'is_reserved'}],time:{role:'NV',grain:null,from:'2025-03-01',to:'2025-03-31'}}), rows, dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'HISTORICAL_STATE_NOT_AVAILABLE');
});

test('physical field fails', () => {
  const r = executeVinOlap(base({dimensions:[{name:'vendedor'}]}), rows, dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'UNKNOWN_SEMANTIC_FIELD');
});

test('duplicate VIN fails grain audit', () => {
  const r = executeVinOlap(base(), [...rows,{...rows[0]}], dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'VIN_GRAIN_VIOLATION');
});

test('auditors reconcile', () => {
  assert.equal(auditVinUniverse(rows,r=>r.vin_chasis).status,'PASS');
  assert.equal(reconcileAggregation(3,3).status,'PASS');
  assert.equal(reconcileUniverse({source:3,eligible:3,filtered:2,used:2,excludedIneligible:0,excludedByFilter:1,excludedInvalid:0}).status,'PASS');
});
