import { shiftMonth } from '../expectation/monthSeries.js';

const GRAINS = new Set(['tienda', 'vendedor']);
const OUTPUT_MODES = new Set(['summary', 'monthly', 'units', 'stability']);

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function parseShareCandidate(name) {
  if (name === 'last_year') return { name, type: 'last_year', lag: 12 };
  const match = /^(moving_average|median)_(\d+)$/.exec(String(name || ''));
  const window = match ? positiveInt(match[2]) : null;
  if (!match || !window) return null;
  return { name, type: match[1], window, lag: window };
}

function parseCandidates(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new Error('candidate_baselines must be a non-empty array');
  }
  const names = [...new Set(value.map(String))];
  const candidates = names.map(parseShareCandidate);
  const invalid = names.filter((name, index) => !candidates[index]);
  if (invalid.length) throw new Error(`Invalid candidate_baselines: ${invalid.join(', ')}`);
  return candidates;
}

function parseOutput(input, candidates) {
  const outputMode = String(input.output_mode || 'summary');
  if (!OUTPUT_MODES.has(outputMode)) {
    throw new Error('output_mode must be summary, monthly, units or stability');
  }
  const detailLimit = input.detail_limit == null ? 100 : positiveInt(input.detail_limit);
  if (!detailLimit || detailLimit > 200) throw new Error('detail_limit must be an integer from 1 to 200');
  const detailCandidate = input.detail_candidate == null ? null : String(input.detail_candidate);
  if (detailCandidate && !candidates.some((row) => row.name === detailCandidate)) {
    throw new Error('detail_candidate must be one of candidate_baselines');
  }
  return { outputMode, detailLimit, detailCandidate };
}

export function parseShareBacktestInput(input = {}) {
  const grain = String(input.grain || '');
  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  if (!GRAINS.has(grain)) throw new Error('grain must be tienda or vendedor');
  if (!shiftMonth(startMonth, 0) || !shiftMonth(endMonth, 0)) {
    throw new Error('start_month and end_month must use YYYY-MM');
  }
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  const candidates = parseCandidates(input.candidate_baselines);
  return {
    grain,
    startMonth,
    endMonth,
    candidates,
    maxLag: Math.max(...candidates.map((row) => row.lag)),
    ...parseOutput(input, candidates),
  };
}
