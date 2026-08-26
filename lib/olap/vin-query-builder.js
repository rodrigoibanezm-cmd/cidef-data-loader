import { buildAggregateSqlPlan } from './query/aggregate-plan.js';
import { buildTemporalBoundarySqlPlan as buildBoundaryPlan } from './query/temporal-boundary-plan.js';
import { operationOf } from './validation/operation-validator.js';
import { validateVinQuery } from './validation/vin-query-validator.js';

const PLAN_BUILDERS = {
  AGGREGATE: buildAggregateSqlPlan,
  TEMPORAL_BOUNDARY: buildBoundaryPlan,
};

export function buildVinSqlPlan(input) {
  const invalid = validateVinQuery(input);
  if (invalid) return { error:invalid };
  return PLAN_BUILDERS[operationOf(input)](input);
}

export function buildTemporalBoundarySqlPlan(input) {
  const invalid = validateVinQuery(input);
  if (invalid) return { error:invalid };
  return buildBoundaryPlan(input);
}

export { validateVinQuery };
