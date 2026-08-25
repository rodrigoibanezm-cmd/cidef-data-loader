import test from 'node:test';
import assert from 'node:assert/strict';
import { VIN_CUBE, INVENTARIO_SCHEMA_V0_1 } from '../lib/olap/vin-cube-registry.js';
import { buildVinSqlPlan } from '../lib/olap/vin-query-builder.js';
import { executeVinOlap } from '../lib/olap/vin-engine.js';
import { getMotor, listMotors } from '../lib/motors/index.js';

const rows = [
  { vin_chasis:'VIN1', vendedor:' Ana  Pérez ', fecha_nv:'01/15/26 10:00', fecha_ingreso_stk:'12/01/25 09:00', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', esta_reservado:'1', esta_en_transito:'0', en_patio:'1', sucursal_venta:'Sucursal Norte', tipo_ficha:'SUV', marca:'DFM' },
  { vin_chasis:'VIN2', vendedor:'ANA\tPÉREZ', fecha_nv:'02/15/26 10:00', fecha_ingreso_stk:'01/01/26 09:00', dealer_venta:'Dealer Dos', es_dealer:true, vigente:'1', esta_reservado:'0', esta_en_transito:'1', en_patio:'0', sucursal_venta:'Sucursal Sur', tipo_ficha:'PICK UP', marca:'DFM' },
  { vin_chasis:'VIN3', vendedor:null, fecha_nv:'02/20/26 10:00', fecha_ingreso_stk:'02/01/26 09:00', dealer_venta:'Dealer X', es_dealer:false, vigente:'0', esta_reservado:'0', esta_en_transito:'0', en_patio:'0', sucursal_venta:'Sucursal Centro', tipo_ficha:'SUV', marca:'FOTON' },
];
const dealers = [
  { dealer:'DEALER UNO', dealer_id:'D1', supervisor:'Supervisor A' },
  { dealer:'DEALER DOS', dealer_id:'D2', supervisor:'Supervisor B' },
];
const base = (extra={}) => ({
  cube:'VIN_SEMANTIC_CUBE_V0.1', universe:{type:'ALL_VIN'}, measures:[{name:'unit_count',aggregation:'SUM',as:'units'}],
  derived_metrics:[], dimensions:[], filters:[], options:{include_totals:true,include_coverage:true,include_lineage:true,limit:300,offset:0}, ...extra,
});

test('vin_olap registered internally', () => { assert.equal(typeof getMotor('vin_olap'),'function'); assert.ok(listMotors().includes('vin_olap')); });

test('registry physical contract matches expected schema', () => {
  assert.equal(VIN_CUBE.dimensions.vehicle_type.column,'tipo_ficha');
  assert.equal(VIN_CUBE.dimensions.sales_branch.column,'sucursal_venta');
  assert.equal(VIN_CUBE.dimensions.is_reserved.column,'esta_reservado');
  assert.equal(VIN_CUBE.dimensions.is_in_transit.column,'esta_en_transito');
  for (const def of Object.values(VIN_CUBE.dimensions)) {
    if (def.column) assert.ok(INVENTARIO_SCHEMA_V0_1.has(def.column), `missing physical column ${def.column}`);
    if (def.fallbackColumn) assert.ok(INVENTARIO_SCHEMA_V0_1.has(def.fallbackColumn), `missing fallback column ${def.fallbackColumn}`);
  }
  for (const col of Object.values(VIN_CUBE.timeRoles)) assert.ok(INVENTARIO_SCHEMA_V0_1.has(col), `missing time role column ${col}`);
  assert.equal(VIN_CUBE.dimensions.dealer_supervisor.master,'dealers_master');
  assert.equal(VIN_CUBE.dimensions.dealer_supervisor.masterColumn,'supervisor');
  assert.equal(VIN_CUBE.dimensions.dealer_supervisor.currentIdentity,true);
});

test('seller normalized and corrected physical dimensions work', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'},{name:'sales_branch',level:'normalized'},{name:'vehicle_type',level:'normalized'}]}), rows, dealers);
  assert.equal(r.ok,true); assert.equal(r.result.totals.units,3);
  assert.ok(r.result.rows.some(x=>x.seller==='ANA PÉREZ'&&x.sales_branch==='SUCURSAL NORTE'&&x.vehicle_type==='SUV'));
});

test('reserved and transit use real physical fixture names', () => {
  const r = executeVinOlap(base({dimensions:[{name:'is_reserved'},{name:'is_in_transit'}]}), rows, dealers);
  assert.ok(r.result.rows.some(x=>x.is_reserved===true&&x.is_in_transit===false));
  assert.ok(r.result.rows.some(x=>x.is_reserved===false&&x.is_in_transit===true));
});

test('dealer canonical and supervisor are derived from dealers_master', () => {
  const r = executeVinOlap(base({universe:{type:'DEALER_STOCK'},dimensions:[{name:'dealer_sale',level:'canonical'},{name:'dealer_supervisor',level:'normalized'}]}), rows, dealers);
  assert.ok(r.result.rows.some(x=>x.dealer_sale==='D1'&&x.dealer_supervisor==='SUPERVISOR A'));
  assert.ok(r.result.rows.some(x=>x.dealer_sale==='D2'&&x.dealer_supervisor==='SUPERVISOR B'));
});

test('historical dealer supervisor requires explicit current identity semantics', () => {
  const r = executeVinOlap(base({dimensions:[{name:'dealer_supervisor',level:'normalized'}],time:{role:'NV',grain:null,from:'2026-01-01',to:'2026-02-28'}}), rows, dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'HISTORICAL_IDENTITY_NOT_AVAILABLE');
});

test('semantic filter object contract works', () => {
  const r = executeVinOlap(base({filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'in',value:['FOTON']}]}), rows, dealers);
  assert.equal(r.ok,true); assert.equal(r.result.totals.units,1);
});

test('physical field string is rejected', () => {
  const r = executeVinOlap(base({filters:[{field:'marca',op:'eq',value:'DFM'}]}), rows, dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'INVALID_QUERY');
});

test('derived metric filter is rejected deterministically', () => {
  const r = executeVinOlap(base({filters:[{field:{type:'derived_metric',name:'aging_days'},op:'gte',value:90}]}), rows, dealers);
  assert.equal(r.ok,false); assert.equal(r.audit.checks[0].name,'METRIC_NOT_AVAILABLE');
});

test('temporal filter grain null and limit keep full totals', () => {
  const r = executeVinOlap(base({dimensions:[{name:'seller',level:'normalized'}],time:{role:'NV',grain:null,from:'2026-02-01',to:'2026-02-28'},options:{limit:1,offset:0,include_totals:true,include_coverage:true,include_lineage:true}}), rows, dealers);
  assert.equal(r.result.totals.units,2); assert.equal(r.result.rows.length,1); assert.equal(r.result.has_more,true); assert.ok(r.result.rows.every(x=>!('time' in x)));
});

test('duplicate VIN and snapshot guard still fail', () => {
  let r = executeVinOlap(base(), [...rows,{...rows[0]}], dealers); assert.equal(r.audit.checks[0].name,'VIN_GRAIN_VIOLATION');
  r = executeVinOlap(base({dimensions:[{name:'is_reserved'}],time:{role:'NV',grain:null,from:'2025-03-01',to:'2025-03-31'}}), rows, dealers);
  assert.equal(r.audit.checks[0].name,'HISTORICAL_STATE_NOT_AVAILABLE');
});

test('SQL plan pushes grouping/filtering to Postgres and uses registry mappings', () => {
  const p = buildVinSqlPlan(base({dimensions:[{name:'sales_branch',level:'normalized'},{name:'vehicle_type',level:'normalized'},{name:'is_reserved'}],filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'eq',value:'DFM'}]}));
  assert.match(p.rows,/sucursal_venta/); assert.match(p.rows,/tipo_ficha/); assert.match(p.rows,/esta_reservado/); assert.match(p.rows,/COUNT\(\*\)/); assert.match(p.rows,/GROUP BY/);
});
