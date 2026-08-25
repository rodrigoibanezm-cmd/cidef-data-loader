import test from 'node:test';
import assert from 'node:assert/strict';
import { VIN_CUBE, INVENTARIO_SCHEMA_V0_1 } from '../lib/olap/vin-cube-registry.js';
import { buildVinSqlPlan, validateVinQuery } from '../lib/olap/vin-query-builder.js';
import { executeVinOlap } from '../lib/olap/vin-engine.js';
import { reconcileUniverse } from '../lib/olap/vin-auditors.js';
import { getMotor, listMotors } from '../lib/motors/index.js';

const rows = [
  { vin_chasis:'VIN1', vendedor:' Ana  Pérez ', fecha_nv:'01/15/26 10:00', fecha_ingreso_stk:'12/01/25 09:00', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', esta_reservado:'1', esta_en_transito:'0', en_patio:'1', sucursal_venta:'Sucursal Norte', tipo_ficha:'SUV', marca:'DFM', ano:'2026' },
  { vin_chasis:'VIN2', vendedor:'ANA\tPÉREZ', fecha_nv:'02/15/26 10:00', fecha_ingreso_stk:'01/01/26 09:00', dealer_venta:'Dealer Dos', es_dealer:true, vigente:'1', esta_reservado:'0', esta_en_transito:'1', en_patio:'0', sucursal_venta:'Sucursal Sur', tipo_ficha:'PICK UP', marca:'DFM', ano:'2025' },
  { vin_chasis:'VIN3', vendedor:null, fecha_nv:'02/20/26 10:00', fecha_ingreso_stk:'02/01/26 09:00', dealer_venta:'Dealer X', es_dealer:true, vigente:'1', esta_reservado:'0', esta_en_transito:'0', en_patio:'0', sucursal_venta:'Sucursal Centro', tipo_ficha:'SUV', marca:'FOTON', ano:'2024' },
  { vin_chasis:'VIN4', vendedor:'OTRO', fecha_nv:null, fecha_ingreso_stk:'02/05/26 09:00', dealer_venta:null, es_dealer:false, vigente:'0', esta_reservado:'0', esta_en_transito:'0', en_patio:'0', sucursal_venta:'Sucursal Centro', tipo_ficha:'SUV', marca:'FOTON', ano:'2023' },
  { vin_chasis:null, vendedor:'INVALID', fecha_nv:'02/25/26 10:00', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', marca:'DFM', ano:'2022' },
];
const dealers = [
  { dealer:'DEALER UNO', dealer_id:'D1', supervisor:'Supervisor A' },
  { dealer:'DEALER DOS', dealer_id:'D2', supervisor:'Supervisor B' },
];
const base = (extra={}) => ({
  cube:'VIN_SEMANTIC_CUBE_V0.1', universe:{type:'ALL_VIN'}, measures:[{name:'unit_count',aggregation:'SUM',as:'units'}],
  derived_metrics:[], dimensions:[], filters:[], options:{include_totals:true,include_coverage:true,include_lineage:true,limit:300,offset:0}, ...extra,
});

function checkRecon(r) {
  const c = r.audit.checks.find((x) => x.name === 'Universe Reconciliation');
  assert.equal(c.status,'PASS');
  assert.deepEqual(c.equations,{source:true,eligible:true,universe:true,filtered:true});
}

test('vin_olap registered internally', () => { assert.equal(typeof getMotor('vin_olap'),'function'); assert.ok(listMotors().includes('vin_olap')); });

test('registry physical contract matches expected schema', () => {
  for (const def of Object.values(VIN_CUBE.dimensions)) {
    if (def.column) assert.ok(INVENTARIO_SCHEMA_V0_1.has(def.column), `missing physical column ${def.column}`);
    if (def.fallbackColumn) assert.ok(INVENTARIO_SCHEMA_V0_1.has(def.fallbackColumn), `missing fallback column ${def.fallbackColumn}`);
  }
  for (const col of Object.values(VIN_CUBE.timeRoles)) assert.ok(INVENTARIO_SCHEMA_V0_1.has(col));
});

test('ALL_VIN reconciliation has all four equations', () => {
  const r = executeVinOlap(base(), rows, dealers);
  assert.equal(r.coverage.source_rows,5); assert.equal(r.coverage.eligible_vin,4); assert.equal(r.coverage.universe_rows,4); assert.equal(r.coverage.filtered_rows,4); assert.equal(r.coverage.used_rows,4); checkRecon(r);
});

test('DEALER_STOCK reconciliation separates universe exclusion', () => {
  const r = executeVinOlap(base({universe:{type:'DEALER_STOCK'}}), rows, dealers);
  assert.equal(r.coverage.eligible_vin,4); assert.equal(r.coverage.universe_rows,3); assert.equal(r.coverage.excluded.find(x=>x.reason==='EXCLUDED_BY_UNIVERSE').rows,1); checkRecon(r);
});

test('EVENT_POPULATION reconciliation separates event universe', () => {
  const r = executeVinOlap(base({universe:{type:'EVENT_POPULATION',event:'NV'}}), rows, dealers);
  assert.equal(r.coverage.eligible_vin,4); assert.equal(r.coverage.universe_rows,3); checkRecon(r);
});

test('universe plus posterior filter reconciles independently', () => {
  const r = executeVinOlap(base({universe:{type:'DEALER_STOCK'},filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'eq',value:'DFM'}]}), rows, dealers);
  assert.equal(r.coverage.universe_rows,3); assert.equal(r.coverage.filtered_rows,2); assert.equal(r.coverage.excluded.find(x=>x.reason==='EXCLUDED_BY_FILTER').rows,1); checkRecon(r);
});

test('artificial reconciliation mismatch fails', () => {
  const r = reconcileUniverse({source:10,eligible:9,universe:8,filtered:7,used:7,excludedIneligible:1,excludedByUniverse:1,excludedByFilter:0,excludedInvalid:0});
  assert.equal(r.status,'FAIL'); assert.equal(r.equations.universe,false);
});

test('categorical invalid operator fails before SQL', () => {
  const q = base({filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'gt',value:10}]});
  assert.equal(validateVinQuery(q)[0],'INVALID_QUERY'); assert.equal(buildVinSqlPlan(q).error[0],'INVALID_QUERY');
});

test('numeric comparison operators remain valid', () => {
  for (const op of ['gt','gte','lt','lte']) assert.equal(validateVinQuery(base({filters:[{field:{type:'dimension',name:'model_year'},op,value:2024}]})),null);
  assert.equal(validateVinQuery(base({filters:[{field:{type:'dimension',name:'model_year'},op:'between',value:[2024,2026]}]})),null);
});

test('boolean invalid operator fails before SQL', () => {
  const q = base({filters:[{field:{type:'dimension',name:'is_reserved'},op:'gte',value:true}]});
  assert.equal(validateVinQuery(q)[0],'INVALID_QUERY');
});

test('dealer canonical distinguishes MATCHED UNMATCHED MISSING', () => {
  const r = executeVinOlap(base({dimensions:[{name:'dealer_sale',level:'canonical'}]}), rows, dealers);
  const values = new Set(r.result.rows.map(x=>x.dealer_sale));
  assert.ok(values.has('D1')); assert.ok(values.has('D2')); assert.ok(values.has('__UNMATCHED__')); assert.ok(values.has('__MISSING__'));
  assert.equal(r.result.rows.reduce((s,x)=>s+x.units,0),4);
  assert.equal(r.result.totals.units,4);
});

test('dealer canonical filters distinguish UNMATCHED and MISSING', () => {
  let r = executeVinOlap(base({filters:[{field:{type:'dimension',name:'dealer_sale',level:'canonical'},op:'eq',value:'__UNMATCHED__'}]}), rows, dealers);
  assert.equal(r.result.totals.units,1);
  r = executeVinOlap(base({filters:[{field:{type:'dimension',name:'dealer_sale',level:'canonical'},op:'eq',value:'__MISSING__'}]}), rows, dealers);
  assert.equal(r.result.totals.units,1);
});

test('aggregation reconciliation includes all dealer canonical buckets', () => {
  const r = executeVinOlap(base({dimensions:[{name:'dealer_sale',level:'canonical'}]}), rows, dealers);
  const a = r.audit.checks.find(x=>x.name==='Aggregation Reconciliation');
  assert.equal(a.status,'PASS'); assert.equal(a.expected,4); assert.equal(a.actual,4);
});

test('limit does not alter totals, coverage or reconciliation', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'}],options:{limit:1,offset:0,include_totals:true,include_coverage:true,include_lineage:true}}), rows, dealers);
  assert.equal(r.result.rows.length,1); assert.equal(r.result.has_more,true); assert.equal(r.result.totals.units,4); assert.equal(r.coverage.used_rows,4); checkRecon(r);
});

test('temporal grain null and prior guards remain valid', () => {
  let r = executeVinOlap(base({time:{role:'NV',grain:null,from:'2026-02-01',to:'2026-02-28'}}), rows, dealers);
  assert.equal(r.result.totals.units,2); assert.ok(r.result.rows.every(x=>!('time' in x)));
  r = executeVinOlap(base({dimensions:[{name:'is_reserved'}],time:{role:'NV',grain:null,from:'2025-03-01',to:'2025-03-31'}}), rows, dealers);
  assert.equal(r.audit.checks[0].name,'HISTORICAL_STATE_NOT_AVAILABLE');
});

test('duplicate VIN still fails', () => {
  const r = executeVinOlap(base(), [...rows,{...rows[0]}], dealers);
  assert.equal(r.audit.checks[0].name,'VIN_GRAIN_VIOLATION');
});

test('SQL plan keeps pushdown and canonical bucket distinction', () => {
  const p = buildVinSqlPlan(base({dimensions:[{name:'dealer_sale',level:'canonical'}],filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'eq',value:'DFM'}],options:{limit:1,offset:0}}));
  assert.match(p.rows,/__MISSING__/); assert.match(p.rows,/__UNMATCHED__/); assert.match(p.rows,/GROUP BY/); assert.match(p.rows,/LIMIT 1 OFFSET 0/);
  assert.match(p.filteredCount,/COUNT\(\*\)/); assert.match(p.usedCount,/COUNT\(\*\)/); assert.match(p.universeCount,/COUNT\(\*\)/);
});

test('derived metric parameters are not bound to filter-only counts', () => {
  const p = buildVinSqlPlan(base({
    derived_metrics:[{name:'aging_days',aggregation:'AVG',as_of_date:'2026-08-25'}],
  }));
  assert.deepEqual(p.filterValues,[]);
  assert.deepEqual(p.values,['2026-08-25']);
  assert.doesNotMatch(p.filteredCount,/\$1/);
  assert.match(p.rows,/\$1::date/);
});
