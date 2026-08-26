import { VIN_CUBE } from '../vin-cube-registry.js';

export const operationOf = (input) => input.operation || 'AGGREGATE';

export function validateOperation(input) {
  const operation = operationOf(input);
  if (!['AGGREGATE', 'TEMPORAL_BOUNDARY'].includes(operation)) {
    return ['INVALID_QUERY', 'invalid operation'];
  }
  if (operation === 'TEMPORAL_BOUNDARY') return validateBoundary(input);
  if (input.boundary != null) return ['INVALID_QUERY', 'boundary only applies to TEMPORAL_BOUNDARY'];
  return validateAggregate(input);
}

function validateBoundary(input) {
  if (!input.time?.role) return ['TIME_ROLE_REQUIRED', 'TEMPORAL_BOUNDARY requires time.role'];
  if (!VIN_CUBE.timeRoles[input.time.role]) return ['INCOMPATIBLE_TIME_ROLE', 'unknown time role'];
  if (!input.time.grain || !['day', 'month', 'quarter', 'year'].includes(input.time.grain)) {
    return ['INVALID_QUERY', 'TEMPORAL_BOUNDARY requires day, month, quarter or year grain'];
  }
  if (!['MIN', 'MAX'].includes(input.boundary)) return ['INVALID_QUERY', 'boundary must be MIN or MAX'];
  if (input.universe.type === 'EVENT_POPULATION' && input.universe.event !== input.time.role) {
    return ['INCOMPATIBLE_TIME_ROLE', 'EVENT_POPULATION event must match time.role'];
  }
  if (input.time.from || input.time.to) {
    return ['INVALID_QUERY', 'TEMPORAL_BOUNDARY does not accept time ranges'];
  }
  if ((input.measures || []).length || (input.derived_metrics || []).length || (input.dimensions || []).length) {
    return ['INVALID_QUERY', 'TEMPORAL_BOUNDARY does not accept measures, derived_metrics or dimensions'];
  }
  return null;
}

function validateAggregate(input) {
  const measures = input.measures;
  if (!Array.isArray(measures) || measures.length !== 1 || measures[0].name !== 'unit_count') {
    return ['METRIC_NOT_AVAILABLE', 'only unit_count is public in V0.1'];
  }
  if (measures[0].aggregation !== 'SUM') {
    return ['UNSUPPORTED_AGGREGATION', 'unit_count supports SUM only'];
  }
  return null;
}
