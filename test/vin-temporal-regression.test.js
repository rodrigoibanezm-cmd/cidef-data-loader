import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVinOlap } from '../lib/olap/vin-engine.js';
import { buildVinSqlPlan } from '../lib/olap/vin-query-builder.js';
import { aggregateQuery, boundaryQuery, errorCode, vinRows } from '../test-support/vin-fixtures.js';

test('boundary SQL uses MIN/MAX in Postgres and returns no series query', () => {
  const maxPlan = buildVinSqlPlan(boundaryQuery());
  const minPlan = buildVinSqlPlan(boundaryQuery({boundary:'MIN'}));
  assert.match(maxPlan.boundary,/MAX\(/);
  assert.match(minPlan.boundary,/MIN\(/);
  assert.equal(maxPlan.rows,undefined);
  assert.match(maxPlan.usedCount,/IS NOT NULL/);
});

test('aggregate SQL keeps the requested temporal dimension', () => {
  const plan = buildVinSqlPlan(aggregateQuery({
    dimensions:[{name:'seller',level:'normalized'}],
    time:{role:'NV',grain:'month'},
  }));
  assert.match(plan.rows,/AS "time"/);
  assert.match(plan.rows,/TO_CHAR\(/);
});

test('AGGREGATE remains default and preserves temporal, stock, aging, limits and guards', () => {
  const seller = executeVinOlap(aggregateQuery({
    universe:{type:'EVENT_POPULATION',event:'NV'},
    dimensions:[{name:'seller',level:'normalized'}],
    time:{role:'NV',grain:'month'},
  }), vinRows);
  assert.equal(seller.result.totals.units,3);
  assert.ok(seller.result.rows.some((row) => row.time === '2026-03'));

  const nullGrain = executeVinOlap(aggregateQuery({
    time:{role:'NV',grain:null,from:'2026-02-01',to:'2026-03-31'},
  }), vinRows);
  assert.equal(nullGrain.result.totals.units,2);

  const stock = executeVinOlap(aggregateQuery({universe:{type:'DEALER_STOCK'}}), vinRows);
  assert.equal(stock.result.totals.units,4);

  const aging = executeVinOlap(aggregateQuery({
    universe:{type:'DEALER_STOCK'},
    dimensions:[{name:'brand',level:'normalized'}],
    derived_metrics:[{name:'aging_days',aggregation:'AVG',as_of_date:'2026-08-26'}],
  }), vinRows);
  assert.equal(aging.result.totals.units,4);
  assert.ok(aging.result.rows.some((row) => row.aging_days_avg != null));

  const limited = executeVinOlap(aggregateQuery({
    dimensions:[{name:'brand',level:'normalized'}],
    options:{limit:1,offset:0,include_totals:true,include_coverage:true,include_lineage:true},
  }), vinRows);
  assert.equal(limited.result.rows.length,1);
  assert.equal(limited.result.totals.units,5);

  const snapshot = executeVinOlap(aggregateQuery({
    dimensions:[{name:'stage',level:'normalized'}],
    time:{role:'NV',grain:null,from:'2026-01-01'},
  }), vinRows);
  assert.equal(errorCode(snapshot),'HISTORICAL_STATE_NOT_AVAILABLE');
});
