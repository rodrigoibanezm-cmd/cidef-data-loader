import { EXPECTATION_CANDIDATES } from '../expectation/expectedCandidates.js';
import { shiftMonth } from '../expectation/monthSeries.js';
import { firstObservedMonth, valueWithObservedZero } from './orgSalesSeries.js';

const HISTORY_REQUIRED = Object.freeze({
  last_year: 12,
  moving_average_3: 3,
  moving_average_6: 6,
  median_6: 6,
  adjusted_last_year: 15,
});

function observedIndex(unit, targetMonth) {
  const first = firstObservedMonth(unit);
  if (!first) return new Map();
  const index = new Map();
  let month = first;
  const last = shiftMonth(targetMonth, -1);
  while (month && month <= last) {
    index.set(month, valueWithObservedZero(unit, month));
    month = shiftMonth(month, 1);
  }
  return index;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianSix(index, targetMonth) {
  const values = [];
  for (let offset = -1; offset >= -6; offset -= 1) {
    const month = shiftMonth(targetMonth, offset);
    if (!index.has(month)) return null;
    values.push(index.get(month));
  }
  return median(values);
}

export function calculateBaseline(name, unit, targetMonth) {
  if (!HISTORY_REQUIRED[name]) throw new Error(`Unknown baseline: ${name}`);
  const index = observedIndex(unit, targetMonth);
  const value = name === 'median_6'
    ? medianSix(index, targetMonth)
    : EXPECTATION_CANDIDATES[name]?.(index, targetMonth);
  if (value == null || !Number.isFinite(value)) return null;
  return { value, history_required: HISTORY_REQUIRED[name] };
}
