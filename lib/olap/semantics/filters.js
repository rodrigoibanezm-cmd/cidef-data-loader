import { VIN_CUBE } from '../vin-cube-registry.js';
import { dimensionSql } from './dimensions.js';
import { pushSqlValue } from '../query/sql-utils.js';

export const FILTER_OPERATORS = {
  categorical:new Set(['eq','neq','in','not_in','is_null','not_null']),
  identity:new Set(['eq','neq','in','not_in','is_null','not_null']),
  numeric:new Set(['eq','neq','gt','gte','lt','lte','between','is_null','not_null']),
  boolean:new Set(['eq','is_null','not_null']),
};

export function passesFilter(value, filter) {
  if (filter.op === 'is_null') return value == null || value === '__MISSING__';
  if (filter.op === 'not_null') return value != null && value !== '__MISSING__';
  if (filter.op === 'eq') return value === filter.value;
  if (filter.op === 'neq') return value !== filter.value;
  if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(value);
  if (filter.op === 'not_in') {
    return Array.isArray(filter.value) && !filter.value.includes(value);
  }
  if (filter.op === 'between') {
    return Array.isArray(filter.value)
      && filter.value.length === 2
      && Number(value) >= Number(filter.value[0])
      && Number(value) <= Number(filter.value[1]);
  }
  if (filter.op === 'gt') return Number(value) > Number(filter.value);
  if (filter.op === 'gte') return Number(value) >= Number(filter.value);
  if (filter.op === 'lt') return Number(value) < Number(filter.value);
  if (filter.op === 'lte') return Number(value) <= Number(filter.value);
  return false;
}

export function semanticFilterSql(input, values) {
  const parts = [];
  for (const filter of input.filters || []) {
    const expression = dimensionSql({
      name:filter.field.name,
      level:filter.field.level,
    });
    if (filter.op === 'is_null') {
      parts.push(`${expression} IS NULL`);
      continue;
    }
    if (filter.op === 'not_null') {
      parts.push(`${expression} IS NOT NULL`);
      continue;
    }
    if (filter.op === 'in' || filter.op === 'not_in') {
      if (!Array.isArray(filter.value) || !filter.value.length) {
        throw Object.assign(new Error('invalid in filter'), { code:'INVALID_QUERY' });
      }
      const placeholders = filter.value.map((value) => pushSqlValue(values, value));
      parts.push(`${expression} ${filter.op === 'in' ? 'IN' : 'NOT IN'} (${placeholders.join(',')})`);
      continue;
    }
    if (filter.op === 'between') {
      if (!Array.isArray(filter.value) || filter.value.length !== 2) {
        throw Object.assign(new Error('invalid between filter'), { code:'INVALID_QUERY' });
      }
      const from = pushSqlValue(values, filter.value[0]);
      const to = pushSqlValue(values, filter.value[1]);
      parts.push(`${expression} BETWEEN ${from}::numeric AND ${to}::numeric`);
      continue;
    }
    const operator = { eq:'=', neq:'<>', gt:'>', gte:'>=', lt:'<', lte:'<=' }[filter.op];
    const numeric = VIN_CUBE.dimensions[filter.field.name].type === 'numeric';
    parts.push(`${expression} ${operator} ${pushSqlValue(values, filter.value)}${numeric ? '::numeric' : ''}`);
  }
  return parts;
}
