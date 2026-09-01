import { shiftMonth } from '../expectation/monthSeries.js';

const GRAINS = new Set(['tienda', 'vendedor']);
const DEVIATIONS = new Set(['relative', 'scaled_mad', 'historical_percentile']);

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function validBaseline(name) {
  if (name === 'last_year' || name === 'adjusted_last_year') return true;
  const match = /^(moving_average|median)_(\d+)$/.exec(name);
  return Boolean(match && positiveInt(match[2]));
}

function validPersistence(name) {
  let match = /^consecutive_(\d+)$/.exec(name);
  if (match) return positiveInt(match[1]) >= 2;
  match = /^deepening_(\d+)$/.exec(name);
  if (match) return positiveInt(match[1]) >= 2;
  match = /^frequency_(\d+)_of_(\d+)$/.exec(name);
  if (!match) return false;
  const need = positiveInt(match[1]);
  const size = positiveInt(match[2]);
  return Boolean(need && size && need <= size);
}

function parseList(value, validator, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array`);
  const unique = [...new Set(value.map(String))];
  for (const item of unique) if (!validator(item)) throw new Error(`Invalid ${label}: ${item}`);
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
    baselines: parseList(input.candidate_baselines, validBaseline, 'candidate_baselines'),
    deviations: parseList(
      input.candidate_deviation_methods,
      (name) => DEVIATIONS.has(name),
      'candidate_deviation_methods',
    ),
    persistence: parseList(
      input.candidate_persistence_rules,
      validPersistence,
      'candidate_persistence_rules',
    ),
  };
}
