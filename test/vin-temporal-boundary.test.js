import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVinOlap } from '../lib/olap/vin-engine.js';
import { buildVinSqlPlan, validateVinQuery } from '../lib/olap/vin-query-builder.js';

const rows = [
  { vin_chasis:'VIN1', fecha_nv:'01/15/26 10:00', fecha_ingreso_stk:'12/01/25 09:00', vendedor:'Ana', marca:'DFM', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', etapa:'VENTA' },
  { vin_chasis:'VIN2', fecha_nv:'02/15/26 10:00', fecha_ingreso_stk:'01/01/26 09:00', vendedor:'Ana', marca:'DFM', dealer_venta:'Dealer Dos', es_dealer:true, vigente:'1', etapa:'VENTA' },
  { vin_chasis:'VIN3', fecha_nv:'03/20/26 10:00', fecha_ingreso_stk:'02/15/26 09:00', vendedor:'Beto', marca:'FOTON', dealer_venta:'Dealer Tres', es_dealer:true, vigente:'1', etapa:'VENTA' },
  { vin_chasis:'VIN4', fecha_nv:null, fecha_ingreso_stk:'03/01/26 09:00', vendedor:'Beto', marca:'FOTON', dealer_venta:null, es_dealer:false, vigente:'0', etapa:'STOCK' },
  { vin_chasis:'VIN5', fecha_nv:'13/40/26 10:00', fecha_ingreso_stk:'invalid', vendedor:'Ana', marca:'DFM', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', etapa:'STOCK' },
];

const boundary = (extra = {}) => ({
  cube:'VIN_SEMANTIC_CUBE_V0.1',
  operation:'TEMPORAL_BOUNDARY',
  universe:{type:'EVENT_POPULATION',event:'NV'},
  time:{role:'NV',grain:'month'},
  boundary:'MAX',
  filters:[],
  options:{include_coverage:true,include_lineage:true},
  ...extra,
});

const aggregate = (extra = {}) => ({
  cube:'VIN_SEMANTIC_CUBE_V0.1',
  universe:{type:'ALL_VIN'},
  measures:[{name:'unit_count',aggregation:'SUM',as:'units'}],
  derived_metrics:[],
  dimensions:[],
  filters:[],
  options:{include_totals:true,include_coverage:true,include_lineage:true,limit:300,offset:0},
  ...extra,
});

const errorCode = (result) => result.audit.checks[0].name;

test('MAX NV month', () => {
  const result = executeVinOlap(boundary(), rows);
  assert.equal(result.status,'PASS');
  assert.equal(result.result.boundary,'2026-03');
  assert.equal('rows' in result.result,false);
});

test('MIN NV month', () => {
  const result = executeVinOlap(boundary({boundary:'MIN'}), rows);
  assert.equal(result.result.boundary,'2026-01');
});

test('MAX NV day', () => {
  const result = executeVinOlap(boundary({time:{role:'NV',grain:'day'}}), rows);
  assert.equal(result.result.boundary,'2026-03-20');
});

test('MAX NV quarter', () => {
  const result = executeVinOlap(boundary({time:{role:'NV',grain:'quarter'}}), rows);
  assert.equal(result.result.boundary,'2026-Q1');
});

test('MAX NV year', () => {
  const result = executeVinOlap(boundary({time:{role:'NV',grain:'year'}}), rows);
  assert.equal(result.result.boundary,'2026');
});

test('boundary accepts semantic brand filter', () => {
  const result = executeVinOlap(boundary({
    filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'eq',value:'DFM'}],
  }), rows);
  assert.equal(result.result.boundary,'2026-02');
});

test('boundary supports DEALER_STOCK universe', () => {
  const result = executeVinOlap(boundary({
    universe:{type:'DEALER_STOCK'},
    time:{role:'STOCK_ENTRY',grain:'month'},
  }), rows);
  assert.equal(result.result.boundary,'2026-02');
});

test('EVENT_POPULATION event must match time role', () => {
  const result = executeVinOlap(boundary({time:{role:'INVOICE',grain:'month'}}), rows);
  assert.equal(result.status,'FAIL');
  assert.equal(errorCode(result),'INCOMPATIBLE_TIME_ROLE');
});

test('TEMPORAL_BOUNDARY requires time role', () => {
  const result = executeVinOlap(boundary({time:{grain:'month'}}), rows);
  assert.equal(errorCode(result),'TIME_ROLE_REQUIRED');
});

test('TEMPORAL_BOUNDARY rejects missing or null grain', () => {
  assert.equal(errorCode(executeVinOlap(boundary({time:{role:'NV'}}), rows)),'INVALID_QUERY');
  assert.equal(errorCode(executeVinOlap(boundary({time:{role:'NV',grain:null}}), rows)),'INVALID_QUERY');
});

test('TEMPORAL_BOUNDARY rejects unsupported boundary', () => {
  const result = executeVinOlap(boundary({boundary:'LAST_COMPLETE'}), rows);
  assert.equal(errorCode(result),'INVALID_QUERY');
});

test('invalid dates do not participate in MAX or MIN', () => {
  const all = {type:'ALL_VIN'};
  assert.equal(executeVinOlap(boundary({universe:all}), rows).result.boundary,'2026-03');
  assert.equal(executeVinOlap(boundary({universe:all,boundary:'MIN'}), rows).result.boundary,'2026-01');
});

test('temporal parse audit warns and accounts invalid dates', () => {
  const result = executeVinOlap(boundary({universe:{type:'ALL_VIN'}}), rows);
  const audit = result.audit.checks.find((check) => check.name === 'Temporal Parse Audit');
  assert.equal(result.status,'WARNING');
  assert.deepEqual(audit.details,{status:'WARNING',non_null:4,parsed:3,invalid:1,null:1});
  assert.ok(result.warnings.includes('Temporal Parse Audit'));
});

test('no valid temporal data returns null with explicit warning', () => {
  const result = executeVinOlap(boundary({
    universe:{type:'ALL_VIN'},
    filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'eq',value:'NOPE'}],
  }), rows);
  assert.equal(result.ok,true);
  assert.equal(result.status,'WARNING');
  assert.equal(result.result.boundary,null);
  assert.ok(result.warnings.includes('NO_TEMPORAL_DATA'));
});

test('boundary universe reconciliation keeps all four equations', () => {
  const result = executeVinOlap(boundary({universe:{type:'ALL_VIN'}}), rows);
  const audit = result.audit.checks.find((check) => check.name === 'Universe Reconciliation');
  assert.deepEqual(audit.equations,{source:true,eligible:true,universe:true,filtered:true});
  assert.equal(result.coverage.filtered_rows,5);
  assert.equal(result.coverage.used_rows,3);
  assert.equal(result.coverage.excluded.find((x) => x.reason === 'INVALID_REQUIRED_FIELD').rows,2);
});

test('duplicate VIN fails without a boundary', () => {
  const result = executeVinOlap(boundary(), [...rows,{...rows[0]}]);
  assert.equal(result.status,'FAIL');
  assert.equal(result.result,null);
  assert.equal(errorCode(result),'VIN_GRAIN_VIOLATION');
});

test('boundary SQL uses MIN/MAX in Postgres and returns no series query', () => {
  const maxPlan = buildVinSqlPlan(boundary());
  const minPlan = buildVinSqlPlan(boundary({boundary:'MIN'}));
  assert.match(maxPlan.boundary,/MAX\(/);
  assert.match(minPlan.boundary,/MIN\(/);
  assert.equal(maxPlan.rows,undefined);
  assert.match(maxPlan.usedCount,/IS NOT NULL/);
});

test('AGGREGATE remains default and preserves temporal, stock, aging, limits and guards', () => {
  const seller = executeVinOlap(aggregate({
    universe:{type:'EVENT_POPULATION',event:'NV'},
    dimensions:[{name:'seller',level:'normalized'}],
    time:{role:'NV',grain:'month'},
  }), rows);
  assert.equal(seller.result.totals.units,3);
  assert.ok(seller.result.rows.some((row) => row.time === '2026-03'));

  const nullGrain = executeVinOlap(aggregate({
    time:{role:'NV',grain:null,from:'2026-02-01',to:'2026-03-31'},
  }), rows);
  assert.equal(nullGrain.result.totals.units,2);

  const stock = executeVinOlap(aggregate({universe:{type:'DEALER_STOCK'}}), rows);
  assert.equal(stock.result.totals.units,4);

  const aging = executeVinOlap(aggregate({
    universe:{type:'DEALER_STOCK'},
    dimensions:[{name:'brand',level:'normalized'}],
    derived_metrics:[{name:'aging_days',aggregation:'AVG',as_of_date:'2026-08-26'}],
  }), rows);
  assert.equal(aging.result.totals.units,4);
  assert.ok(aging.result.rows.some((row) => row.aging_days_avg != null));

  const limited = executeVinOlap(aggregate({
    dimensions:[{name:'brand',level:'normalized'}],
    options:{limit:1,offset:0,include_totals:true,include_coverage:true,include_lineage:true},
  }), rows);
  assert.equal(limited.result.rows.length,1);
  assert.equal(limited.result.totals.units,5);

  const snapshot = executeVinOlap(aggregate({
    dimensions:[{name:'stage',level:'normalized'}],
    time:{role:'NV',grain:null,from:'2026-01-01'},
  }), rows);
  assert.equal(errorCode(snapshot),'HISTORICAL_STATE_NOT_AVAILABLE');
});

test('operation defaults to AGGREGATE and validates boundary contract', () => {
  assert.equal(validateVinQuery(aggregate()),null);
  assert.equal(validateVinQuery({...aggregate(),operation:'AGGREGATE'}),null);
  assert.equal(validateVinQuery(boundary()),null);
});
