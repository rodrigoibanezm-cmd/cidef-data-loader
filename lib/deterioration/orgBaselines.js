import { shiftMonth } from '../expectation/monthSeries.js';
import { valueWithObservedZero } from './orgSalesSeries.js';

function valuesAt(unit, targetMonth, offsets) {
  const values = [];
  for (const offset of offsets) {
    const value = valueWithObservedZero(unit, shiftMonth(targetMonth, offset));
    if (value == null) return null;
    values.push(value);
  }
  return values;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateBaseline(name, unit, targetMonth) {
  if (name === 'last_year') {
    const values = valuesAt(unit, targetMonth, [-12]);
    return values ? { value: values[0], history_required: 12 } : null;
  }
  if (name === 'moving_average_3' || name === 'moving_average_6') {
    const size = name.endsWith('_3') ? 3 : 6;
    const offsets = Array.from({ length: size }, (_, i) => -(i + 1));
    const values = valuesAt(unit, targetMonth, offsets);
    return values ? { value: average(values), history_required: size } : null;
  }
  if (name === 'median_6') {
    const values = valuesAt(unit, targetMonth, [-1, -2, -3, -4, -5, -6]);
    return values ? { value: median(values), history_required: 6 } : null;
  }
  if (name === 'adjusted_last_year') {
    const ly = valuesAt(unit, targetMonth, [-12]);
    const recent = valuesAt(unit, targetMonth, [-1, -2, -3]);
    const prior = valuesAt(unit, targetMonth, [-13, -14, -15]);
    if (!ly || !recent || !prior) return null;
    const denominator = average(prior);
    if (denominator <= 0) return null;
    return { value: ly[0] * (average(recent) / denominator), history_required: 15 };
  }
  throw new Error(`Unknown baseline: ${name}`);
}
