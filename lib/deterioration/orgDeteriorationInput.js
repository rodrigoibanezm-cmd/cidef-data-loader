import { shiftMonth } from '../expectation/monthSeries.js';

const GRAINS = new Set(['tienda', 'vendedor']);
const BASELINES = new Set([
  'last_year',
  'moving_average_3',
  'moving_average_6',
  'median_6',
  'adjusted_last_year',
]);
const DEVIATIONS = new Set(['relative', 'scaled_mad', 'historical_percentile']);
const PERSISTENCE = new Set([
  'consecutive_2',
  'consecutive_3',
  'frequency_2_of_3',
  'frequency_3_of_4',
  'deepening_2',
]);

function parseList(value, allowed, label) {
  if (value == null) return [...allowed];
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array`);
  const unique = [...new Set(value.map(String))];
  for (const item of unique) if (!allowed.has(item)) throw new Error(`Unknown ${label}: ${item}`);
  return unique;
}

export function parseOrgDeteriorationInput(input = {}) {
  const grain = String(input.grain || '');
  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  if (!GRAINS.has(grain)) throw new Error('grain must be tienda or vendedor');
  if (!shiftMonth(startMonth, 0) || !shiftMonth(endMonth, 0)) {
    throw new Error('start_month and end_month must use YYYY-MM');
  }
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  return {
    grain,
    startMonth,
    endMonth,
    baselines: parseList(input.candidate_baselines, BASELINES, 'candidate_baselines'),
    deviations: parseList(input.candidate_deviation_methods, DEVIATIONS, 'candidate_deviation_methods'),
    persistence: parseList(input.candidate_persistence_rules, PERSISTENCE, 'candidate_persistence_rules'),
  };
}
