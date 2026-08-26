import { VIN_CUBE } from '../vin-cube-registry.js';
import { FILTER_OPERATORS } from '../semantics/filters.js';

export function validateFilters(filters = []) {
  for (const filter of filters) {
    if (!filter?.field || typeof filter.field !== 'object') {
      return ['INVALID_QUERY', 'filter.field must be a semantic field object'];
    }
    if (filter.field.type === 'derived_metric') {
      return ['METRIC_NOT_AVAILABLE', 'derived metric filters are not available in V0.1'];
    }
    if (filter.field.type !== 'dimension') {
      return ['INVALID_QUERY', 'filter.field.type must be dimension'];
    }
    const definition = VIN_CUBE.dimensions[filter.field.name];
    if (!definition) {
      return ['UNKNOWN_SEMANTIC_FIELD', `unknown filter field ${filter.field.name}`];
    }
    if (filter.field.level && (!definition.levels || !definition.levels.includes(filter.field.level))) {
      return ['UNSUPPORTED_DIMENSION_LEVEL', `unsupported level for ${filter.field.name}`];
    }
    const allowed = FILTER_OPERATORS[definition.type] || FILTER_OPERATORS.categorical;
    if (!allowed.has(filter.op)) {
      return ['INVALID_QUERY', `operator ${filter.op} is invalid for ${definition.type} dimension ${filter.field.name}`];
    }
  }
  return null;
}
