import { VIN_CUBE } from '../vin-cube-registry.js';

const GRAINS = ['day', 'month', 'quarter', 'year'];

export function validateTime(input) {
  if (input.time && !input.time.role) return ['TIME_ROLE_REQUIRED', 'time.role is required'];
  if (input.time?.grain != null && !GRAINS.includes(input.time.grain)) {
    return ['INVALID_QUERY', 'unsupported time grain'];
  }
  if (input.time?.role && !VIN_CUBE.timeRoles[input.time.role]) {
    return ['INCOMPATIBLE_TIME_ROLE', 'unknown time role'];
  }
  return null;
}

export function validateDimensions(input) {
  for (const dimension of input.dimensions || []) {
    const definition = VIN_CUBE.dimensions[dimension.name];
    if (!definition) return ['UNKNOWN_SEMANTIC_FIELD', `unknown dimension ${dimension.name}`];
    if (dimension.level && (!definition.levels || !definition.levels.includes(dimension.level))) {
      return ['UNSUPPORTED_DIMENSION_LEVEL', `unsupported level for ${dimension.name}`];
    }
    if (definition.currentIdentity && input.time?.from && input.options?.identity_semantics !== 'current') {
      return ['HISTORICAL_IDENTITY_NOT_AVAILABLE', `${dimension.name} is current identity only`];
    }
  }
  const snapshots = (input.dimensions || []).filter((d) => VIN_CUBE.dimensions[d.name]?.snapshot);
  if (snapshots.length && input.time?.from && input.options?.snapshot_semantics !== 'current') {
    return ['HISTORICAL_STATE_NOT_AVAILABLE', 'snapshot dimensions with historical event filters require options.snapshot_semantics="current"'];
  }
  return null;
}

export function validateDerivedMetrics(metrics = []) {
  for (const metric of metrics) {
    if (metric.name !== 'aging_days') {
      return ['METRIC_NOT_AVAILABLE', `derived metric ${metric.name} unavailable`];
    }
    if (!['AVG', 'MIN', 'MAX'].includes(metric.aggregation)) {
      return ['UNSUPPORTED_AGGREGATION', 'aging_days supports AVG/MIN/MAX'];
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(metric.as_of_date || ''))) {
      return ['INVALID_QUERY', 'aging_days requires as_of_date YYYY-MM-DD'];
    }
  }
  return null;
}
