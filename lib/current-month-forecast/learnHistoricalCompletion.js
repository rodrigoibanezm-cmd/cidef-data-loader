import { median } from '../daily-close-forecast/statistics.js';

export function learnHistoricalCompletion(observations, dayOfMonth) {
  const ratios = (observations || [])
    .filter((row) => row.day_of_month === dayOfMonth && row.actual_close > 0)
    .map((row) => row.observed_to_date / row.actual_close)
    .filter(Number.isFinite);

  return {
    learned_completion: median(ratios),
    historical_observations: ratios.length,
    ratios_in_bounds: ratios.every((value) => value >= 0 && value <= 1),
  };
}
