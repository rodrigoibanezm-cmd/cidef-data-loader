import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVinOlap } from '../lib/olap/vin-engine.js';
import { boundaryQuery, vinRows } from '../test-support/vin-fixtures.js';

test('MAX NV month', () => {
  const result = executeVinOlap(boundaryQuery(), vinRows);
  assert.equal(result.status,'PASS');
  assert.equal(result.result.boundary,'2026-03');
  assert.equal('rows' in result.result,false);
});

test('MIN NV month', () => {
  const result = executeVinOlap(boundaryQuery({boundary:'MIN'}), vinRows);
  assert.equal(result.result.boundary,'2026-01');
});

for (const [grain, expected] of [
  ['day','2026-03-20'],
  ['quarter','2026-Q1'],
  ['year','2026'],
]) {
  test(`MAX NV ${grain}`, () => {
    const result = executeVinOlap(boundaryQuery({time:{role:'NV',grain}}), vinRows);
    assert.equal(result.result.boundary,expected);
  });
}

test('boundary accepts semantic brand filter', () => {
  const result = executeVinOlap(boundaryQuery({
    filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'eq',value:'DFM'}],
  }), vinRows);
  assert.equal(result.result.boundary,'2026-02');
});

test('boundary supports DEALER_STOCK universe', () => {
  const result = executeVinOlap(boundaryQuery({
    universe:{type:'DEALER_STOCK'},
    time:{role:'STOCK_ENTRY',grain:'month'},
  }), vinRows);
  assert.equal(result.result.boundary,'2026-02');
});

test('invalid dates do not participate in MAX or MIN', () => {
  const universe = {type:'ALL_VIN'};
  assert.equal(executeVinOlap(boundaryQuery({universe}), vinRows).result.boundary,'2026-03');
  assert.equal(executeVinOlap(boundaryQuery({universe,boundary:'MIN'}), vinRows).result.boundary,'2026-01');
});

test('temporal parse audit warns and accounts invalid dates', () => {
  const result = executeVinOlap(boundaryQuery({universe:{type:'ALL_VIN'}}), vinRows);
  const audit = result.audit.checks.find((check) => check.name === 'Temporal Parse Audit');
  assert.equal(result.status,'WARNING');
  assert.deepEqual(audit.details,{status:'WARNING',non_null:4,parsed:3,invalid:1,null:1});
  assert.ok(result.warnings.includes('Temporal Parse Audit'));
});

test('no valid temporal data returns null with explicit warning', () => {
  const result = executeVinOlap(boundaryQuery({
    universe:{type:'ALL_VIN'},
    filters:[{field:{type:'dimension',name:'brand',level:'normalized'},op:'eq',value:'NOPE'}],
  }), vinRows);
  assert.equal(result.ok,true);
  assert.equal(result.status,'WARNING');
  assert.equal(result.result.boundary,null);
  assert.ok(result.warnings.includes('NO_TEMPORAL_DATA'));
});

test('boundary universe reconciliation keeps all four equations', () => {
  const result = executeVinOlap(boundaryQuery({universe:{type:'ALL_VIN'}}), vinRows);
  const audit = result.audit.checks.find((check) => check.name === 'Universe Reconciliation');
  assert.deepEqual(audit.equations,{source:true,eligible:true,universe:true,filtered:true});
  assert.equal(result.coverage.filtered_rows,5);
  assert.equal(result.coverage.used_rows,3);
  assert.equal(result.coverage.excluded.find((x) => x.reason === 'INVALID_REQUIRED_FIELD').rows,2);
});
