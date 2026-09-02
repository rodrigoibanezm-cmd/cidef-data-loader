import { average, shiftMonth } from '../expectation/monthSeries.js';

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function requiredMonths(candidate, targetMonth) {
  if (candidate.type === 'last_year') return [shiftMonth(targetMonth, -12)];
  return Array.from(
    { length: candidate.window },
    (_, index) => shiftMonth(targetMonth, -(index + 1)),
  );
}

export function calculateShareExpectation(candidate, targetMonth, index) {
  const sourceMonths = requiredMonths(candidate, targetMonth);
  if (sourceMonths.some((month) => !month || !index.has(month))) {
    return { expected: null, source_months: sourceMonths, evaluable: false };
  }
  const values = sourceMonths.map((month) => index.get(month));
  let expected = null;
  if (candidate.type === 'last_year') expected = values[0];
  if (candidate.type === 'moving_average') expected = average(values);
  if (candidate.type === 'median') expected = median(values);
  return { expected, source_months: sourceMonths, evaluable: Number.isFinite(expected) };
}

export function buildUnitPredictions(unitRows, candidates, startMonth, endMonth) {
  const index = new Map(unitRows.map((row) => [row.month, row.share]));
  return unitRows
    .filter((row) => row.month >= startMonth && row.month <= endMonth)
    .map((row) => ({
      ...row,
      predictions: Object.fromEntries(candidates.map((candidate) => [
        candidate.name,
        calculateShareExpectation(candidate, row.month, index),
      ])),
    }));
}
