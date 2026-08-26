import { VIN_CUBE } from '../../vin-cube-registry.js';
import { dimensionValue } from '../../semantics/dimensions.js';
import { dateKey, daysBetween, parseIsoDate, parseSourceDate } from '../../semantics/time.js';

function addRow(groups, row, input, dealers) {
  const keyParts = [];
  const output = {};
  for (const dimension of input.dimensions || []) {
    const value = dimensionValue(row, dimension, dealers);
    output[dimension.as || dimension.name] = value == null ? '__MISSING__' : value;
    keyParts.push(output[dimension.as || dimension.name]);
  }
  if (input.time?.grain) {
    const parsed = parseSourceDate(row[VIN_CUBE.timeRoles[input.time.role]]);
    const key = dateKey(parsed.date, input.time.grain);
    output.time = key;
    keyParts.push(key);
  }
  const key = JSON.stringify(keyParts);
  if (!groups.has(key)) groups.set(key, { ...output, __units:0, __aging:[] });
  const group = groups.get(key);
  group.__units += 1;
  for (const metric of input.derived_metrics || []) {
    const parsed = parseSourceDate(row[VIN_CUBE.timeRoles.STOCK_ENTRY]);
    if (parsed.status === 'parsed') {
      group.__aging.push(daysBetween(parseIsoDate(metric.as_of_date), parsed.date));
    }
  }
}

function metricValue(values, aggregation) {
  if (!values.length) return null;
  if (aggregation === 'AVG') return values.reduce((sum, value) => sum + value, 0) / values.length;
  return aggregation === 'MIN' ? Math.min(...values) : Math.max(...values);
}

export function groupRows(rows, input, dealers) {
  const groups = new Map();
  for (const row of rows) addRow(groups, row, input, dealers);
  const measureAlias = input.measures[0].as || 'unit_count';
  const output = [...groups.values()].map((group) => {
    const row = { ...group, [measureAlias]:group.__units };
    delete row.__units;
    for (const metric of input.derived_metrics || []) {
      const alias = metric.as || `${metric.name}_${metric.aggregation.toLowerCase()}`;
      row[alias] = metricValue(row.__aging, metric.aggregation);
    }
    delete row.__aging;
    return row;
  });
  return { rows:output, measureAlias };
}
