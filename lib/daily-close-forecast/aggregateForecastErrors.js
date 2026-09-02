import { mean, percentile } from './statistics.js';

function pct(value) {
  return value == null ? null : 100 * value;
}

function summarize(rows, grain, day) {
  const evaluable = rows.filter((row) => row.evaluable);
  const ape = evaluable.map((row) => row.absolute_percentage_error);
  const signed = evaluable.map((row) => row.signed_percentage_error);
  const training = rows.map((row) => row.training_observations);
  return {
    grain,
    candidate: 'median_completion_all_prior',
    day_of_month: day,
    target_observations: rows.length,
    targets_evaluable: evaluable.length,
    targets_not_evaluable: rows.length - evaluable.length,
    training_observations_min: training.length ? Math.min(...training) : 0,
    training_observations_max: training.length ? Math.max(...training) : 0,
    mape_pct: pct(mean(ape)),
    median_ape_pct: pct(percentile(ape, 0.5)),
    p75_ape_pct: pct(percentile(ape, 0.75)),
    p90_ape_pct: pct(percentile(ape, 0.9)),
    mean_signed_error_pct: pct(mean(signed)),
  };
}

export function aggregateForecastErrors(forecasts) {
  const groups = new Map();
  for (const row of forecasts || []) {
    const key = `${row.grain}|${row.day_of_month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.values()]
    .map((rows) => summarize(rows, rows[0].grain, rows[0].day_of_month))
    .sort((a, b) => a.grain.localeCompare(b.grain) || a.day_of_month - b.day_of_month);
}
