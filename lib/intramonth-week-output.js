const number = value => value == null ? null : Number(value);
const round = value => value == null ? null : Number(value.toFixed(4));
const shareKeys = ['share_w1_pct', 'share_w2_pct', 'share_w3_pct', 'share_w4_pct', 'share_w5_pct'];

export function weekSeriesOutput(rows) {
  return rows.map(row => ({
    year_month: row.year_month, group_value: row.group_value, units: number(row.units),
    share_w1_pct: number(row.share_w1_pct), share_w2_pct: number(row.share_w2_pct),
    share_w3_pct: number(row.share_w3_pct), share_w4_pct: number(row.share_w4_pct),
    share_w5_pct: number(row.share_w5_pct),
    last_week_share_pct: number(row.last_week_share_pct),
    last_7_days_share_pct: number(row.last_7_days_share_pct),
  }));
}

function average(rows, key) {
  const values = rows.map(row => row[key]).filter(value => value != null);
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

export function weekSummaryOutput(series) {
  const groups = new Map();
  for (const row of series) {
    if (!groups.has(row.group_value)) groups.set(row.group_value, []);
    groups.get(row.group_value).push(row);
  }
  return [...groups.entries()].map(([groupValue, rows]) => {
    const last7 = rows.map(row => row.last_7_days_share_pct).filter(value => value != null);
    const result = { group_value: groupValue, months_observed: rows.length };
    shareKeys.forEach((key, index) => { result[`avg_share_w${index + 1}_pct`] = average(rows, key); });
    return {
      ...result, avg_last_7_days_share_pct: average(rows, 'last_7_days_share_pct'),
      median_last_7_days_share_pct: median(last7),
      min_last_7_days_share_pct: last7.length ? Math.min(...last7) : null,
      max_last_7_days_share_pct: last7.length ? Math.max(...last7) : null,
    };
  }).sort((a, b) => a.group_value.localeCompare(b.group_value));
}
