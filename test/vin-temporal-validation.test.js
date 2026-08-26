import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVinOlap } from '../lib/olap/vin-engine.js';
import { validateVinQuery } from '../lib/olap/vin-query-builder.js';
import { aggregateQuery, boundaryQuery, errorCode, vinRows } from '../test-support/vin-fixtures.js';

test('EVENT_POPULATION event must match time role', () => {
  const result = executeVinOlap(boundaryQuery({time:{role:'INVOICE',grain:'month'}}), vinRows);
  assert.equal(result.status,'FAIL');
  assert.equal(errorCode(result),'INCOMPATIBLE_TIME_ROLE');
});

test('TEMPORAL_BOUNDARY requires time role', () => {
  const result = executeVinOlap(boundaryQuery({time:{grain:'month'}}), vinRows);
  assert.equal(errorCode(result),'TIME_ROLE_REQUIRED');
});

test('TEMPORAL_BOUNDARY rejects missing or null grain', () => {
  assert.equal(errorCode(executeVinOlap(boundaryQuery({time:{role:'NV'}}), vinRows)),'INVALID_QUERY');
  assert.equal(errorCode(executeVinOlap(boundaryQuery({time:{role:'NV',grain:null}}), vinRows)),'INVALID_QUERY');
});

test('TEMPORAL_BOUNDARY rejects unsupported boundary', () => {
  const result = executeVinOlap(boundaryQuery({boundary:'LAST_COMPLETE'}), vinRows);
  assert.equal(errorCode(result),'INVALID_QUERY');
});

test('duplicate VIN fails without a boundary', () => {
  const result = executeVinOlap(boundaryQuery(), [...vinRows,{...vinRows[0]}]);
  assert.equal(result.status,'FAIL');
  assert.equal(result.result,null);
  assert.equal(errorCode(result),'VIN_GRAIN_VIOLATION');
});

test('operation defaults to AGGREGATE and validates boundary contract', () => {
  assert.equal(validateVinQuery(aggregateQuery()),null);
  assert.equal(validateVinQuery({...aggregateQuery(),operation:'AGGREGATE'}),null);
  assert.equal(validateVinQuery(boundaryQuery()),null);
});
