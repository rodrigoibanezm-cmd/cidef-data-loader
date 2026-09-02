import { monthRange } from '../deterioration/monthRange.js';

export function validateActiveZeroInvariant(rows) {
  return rows.every((row) =>
    row.recognized_sales === 0
    && row.nv_count > 0
    && row.state === 'ACTIVE_ZERO'
    && row.sales === 0);
}

export function validateUnknownBreaksContinuity(rows, episodes) {
  const keys = new Set(rows.map((row) => `${row.unit_id}|${row.month}`));
  return episodes.every((episode) => monthRange(
    episode.onset_month,
    episode.confirmation_month,
  ).every((month) => keys.has(`${episode.unit_id}|${month}`)));
}

export function validateNoFutureSignalLeakage(rows) {
  return rows.every((row) =>
    row.history_cutoff_month < row.month
    && row.actual_cutoff_month === row.month
    && row.baseline_history_required.every((month) => month < row.month));
}
