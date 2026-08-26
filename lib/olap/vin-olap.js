import { neon } from '@neondatabase/serverless';
import { executeSqlAggregate } from './operations/sql/aggregate.js';
import { executeSqlTemporalBoundary } from './operations/sql/temporal-boundary.js';
import { failResult } from './output/result-envelope.js';
import { buildVinSqlPlan } from './vin-query-builder.js';
import { operationOf } from './validation/operation-validator.js';
import { validateVinQuery } from './validation/vin-query-validator.js';

const OPERATIONS = {
  AGGREGATE: executeSqlAggregate,
  TEMPORAL_BOUNDARY: executeSqlTemporalBoundary,
};

function database() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function run(input = {}) {
  const invalid = validateVinQuery(input);
  if (invalid) return failResult(invalid[0], invalid[1], input);
  let plan;
  try {
    plan = buildVinSqlPlan(input);
  } catch (error) {
    return failResult(error.code || 'INVALID_QUERY', error.message, input);
  }
  if (plan.error) return failResult(plan.error[0], plan.error[1], input);
  return OPERATIONS[operationOf(input)](database(), input, plan);
}

export { executeVinOlap } from './vin-engine.js';
