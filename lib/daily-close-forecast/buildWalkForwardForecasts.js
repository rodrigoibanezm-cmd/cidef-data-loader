import { median } from './statistics.js';

function completion(row) {
  if (!(row?.actual_close > 0)) return null;
  return row.observed_to_date / row.actual_close;
}

function byDayAndMonth(observations) {
  const byDay = new Map();
  for (const row of observations || []) {
    const day = Number(row.day_of_month);
    if (!byDay.has(day)) byDay.set(day, new Map());
    const byMonth = byDay.get(day);
    if (!byMonth.has(row.target_month)) byMonth.set(row.target_month, []);
    byMonth.get(row.target_month).push(row);
  }
  return byDay;
}

function forecastRow(row, grain, learned, trainingCount) {
  const base = {
    grain,
    target_month: row.target_month,
    day_of_month: row.day_of_month,
    training_observations: trainingCount,
    learned_completion: learned,
    observed_to_date: row.observed_to_date,
    actual_close: row.actual_close,
  };
  if (!(row.actual_close > 0) || !(learned > 0)) {
    return { ...base, evaluable: false, not_evaluable_reason: 'NON_POSITIVE_COMPLETION_OR_LABEL' };
  }
  const forecast = row.observed_to_date / learned;
  const signed = (forecast - row.actual_close) / row.actual_close;
  return {
    ...base,
    evaluable: true,
    not_evaluable_reason: null,
    forecast_close: forecast,
    signed_percentage_error: signed,
    absolute_percentage_error: Math.abs(signed),
  };
}

export function buildWalkForwardForecasts(
  observations,
  { grain, startMonth, endMonth },
) {
  const output = [];
  const grouped = byDayAndMonth(observations);

  for (const [day, byMonth] of grouped.entries()) {
    const prior = [];
    const months = [...byMonth.keys()].sort();
    for (const month of months) {
      const rows = byMonth.get(month);
      const learned = median(prior);
      if (month >= startMonth && month <= endMonth) {
        for (const row of rows) output.push(forecastRow(row, grain, learned, prior.length));
      }
      for (const row of rows) {
        const ratio = completion(row);
        if (ratio != null) prior.push(ratio);
      }
    }
  }

  return output.sort(
    (a, b) => a.day_of_month - b.day_of_month
      || a.target_month.localeCompare(b.target_month),
  );
}
