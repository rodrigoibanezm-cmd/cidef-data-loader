import { qi } from './db.js';

const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null']);

function typedComparison(column, dataType, operator, placeholder) {
  const numeric = new Set(['smallint', 'integer', 'bigint', 'decimal', 'numeric', 'real', 'double precision']);
  const dates = new Set(['date', 'timestamp without time zone', 'timestamp with time zone']);
  if (numeric.has(dataType)) return `${qi(column)}::numeric ${operator} ${placeholder}::numeric`;
  if (dates.has(dataType)) return `${qi(column)}::timestamp ${operator} ${placeholder}::timestamp`;
  if (dataType === 'boolean') return `${qi(column)}::boolean ${operator} ${placeholder}::boolean`;
  return `${qi(column)}::text ${operator} ${placeholder}`;
}

export function buildFilters(filters, columns, values) {
  const byName = new Map(columns.map((column) => [column.column_name, column.data_type]));
  return (filters || []).map((filter) => {
    if (!byName.has(filter.column) || !OPS.has(filter.op)) throw new Error('Invalid filter');
    const col = qi(filter.column);
    if (filter.op === 'is_null') return `${col} IS NULL`;
    if (filter.op === 'not_null') return `${col} IS NOT NULL`;
    if (filter.op === 'contains') {
      values.push(String(filter.value ?? ''));
      return `${col}::text ILIKE '%' || $${values.length} || '%'`;
    }
    if (filter.op === 'in') {
      const list = Array.isArray(filter.value) ? filter.value : [];
      if (!list.length) throw new Error('Invalid in filter');
      const placeholders = list.map((value) => {
        values.push(String(value));
        return `$${values.length}`;
      });
      return `${col}::text IN (${placeholders.join(', ')})`;
    }
    values.push(String(filter.value ?? ''));
    const operator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[filter.op];
    return typedComparison(filter.column, byName.get(filter.column), operator, `$${values.length}`);
  });
}
