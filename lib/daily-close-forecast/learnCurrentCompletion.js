import { median } from './statistics.js';

function completion(row) {
  if (!(row?.actual_close > 0)) return null;
  const value = row.observed_to_date / row.actual_close;
  return Number.isFinite(value) ? value : null;
}

export function learnCurrentCompletion(observations, dayOfMonth) {
  const rows = (observations || []).filter(
    (row) => Number(row.day_of_month) === Number(dayOfMonth),
  );
  const values = rows.map(completion).filter((value) => value != null);
  const learned = median(values);
  const months = [...new Set(rows.map((row) => row.target_month))].sort();

  return {
    day_of_month: Number(dayOfMonth),
    training_observations: values.length,
    training_months: months.length,
    training_first_month: months[0] ?? null,
    training_last_month: months.at(-1) ?? null,
    learned_completion: learned,
    evaluable: learned > 0,
  };
}
