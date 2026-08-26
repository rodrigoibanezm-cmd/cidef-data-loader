import { executePureAggregate } from './operations/pure/aggregate.js';
import { executePureTemporalBoundary } from './operations/pure/temporal-boundary.js';
import { failResult } from './output/result-envelope.js';
import { operationOf } from './validation/operation-validator.js';
import { validateVinQuery } from './validation/vin-query-validator.js';

const OPERATIONS = {
  AGGREGATE: executePureAggregate,
  TEMPORAL_BOUNDARY: executePureTemporalBoundary,
};

export function executeVinOlap(input, sourceRows, dealerRows = []) {
  const invalid = validateVinQuery(input);
  if (invalid) return failResult(invalid[0], invalid[1], input);
  return OPERATIONS[operationOf(input)](input, sourceRows, dealerRows);
}
