import { VIN_CUBE } from '../vin-cube-registry.js';
import { validateFilters } from './filter-validator.js';
import { validateDimensions, validateTime, validateDerivedMetrics } from './semantic-guards.js';
import { operationOf, validateOperation } from './operation-validator.js';

export function validateVinQuery(input = {}) {
  if (input.cube !== VIN_CUBE.id) {
    return ['INVALID_QUERY', 'cube must be VIN_SEMANTIC_CUBE_V0.1'];
  }
  if (!input.universe || !VIN_CUBE.universes.includes(input.universe.type)) {
    return ['INVALID_QUERY', 'invalid universe'];
  }
  const operation = operationOf(input);
  if (!['AGGREGATE', 'TEMPORAL_BOUNDARY'].includes(operation)) {
    return ['INVALID_QUERY', 'invalid operation'];
  }
  if (input.universe.type === 'EVENT_POPULATION' && !VIN_CUBE.timeRoles[input.universe.event]) {
    return ['INCOMPATIBLE_TIME_ROLE', 'EVENT_POPULATION requires a valid event'];
  }
  const operationError = validateOperation(input);
  if (operationError) return operationError;
  if ((input.dimensions || []).length > 3) {
    return ['INVALID_QUERY', 'at most 3 non-temporal dimensions are allowed'];
  }
  const timeError = validateTime(input);
  if (timeError) return timeError;
  const dimensionError = validateDimensions(input);
  if (dimensionError) return dimensionError;
  const filterError = validateFilters(input.filters);
  if (filterError) return filterError;
  return validateDerivedMetrics(input.derived_metrics);
}
