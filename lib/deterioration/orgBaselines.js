import {
  expectedAdjustedLastYear,
  expectedLastYear,
  expectedMovingAverage,
} from '../expectation/expectedCandidates.js';
import { shiftMonth } from '../expectation/monthSeries.js';
import { firstObservedMonth, valueWithObservedZero } from './orgSalesSeries.js';

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

function medianWindow(index, targetMonth, window) {
  const values = [];
  for (let offset = -1; offset >= -window; offset -= 1) {
    const month = shiftMonth(targetMonth, offset);
    if (!index.has(month)) return null;
    values.push(index.get(month));
  }
  return median(values);
}

function windowFromName(name, prefix) {
  const match = new RegExp(`^${prefix}_(\\d+)$`).exec(name);
  return match ? Number(match[1]) : null;
}

export function calculateBaseline(name, unit, targetMonth) {
  const index = observedIndex(unit, targetMonth);
  let value = null;
  let historyRequired = null;
  if (name === 'last_year') {
    value = expectedLastYear(index, targetMonth);
    historyRequired = 12;
  } else if (name === 'adjusted_last_year') {
    value = expectedAdjustedLastYear(index, targetMonth, 3);
    historyRequired = 15;
  } else if (windowFromName(name, 'moving_average')) {
    historyRequired = windowFromName(name, 'moving_average');
    value = expectedMovingAverage(index, targetMonth, historyRequired);
  } else if (windowFromName(name, 'median')) {
    historyRequired = windowFromName(name, 'median');
    value = medianWindow(index, targetMonth, historyRequired);
  } else {
    throw new Error(`Unknown baseline: ${name}`);
  }
  if (value == null || !Number.isFinite(value)) return null;
  return { value, history_required: historyRequired };
}
