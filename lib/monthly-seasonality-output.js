const MONTHS = [
  null, 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
const number = value => value == null ? null : Number(value);
const round = value => value == null ? null : Number(value.toFixed(4));

export function monthlySeriesOutput(rows) {
  return rows.map(row => ({
    year_month: row.year_month, year: number(row.year), quarter: number(row.quarter),
    month_number: number(row.month_number), group_value: row.group_value,
    units: number(row.units), annual_weight_pct: number(row.annual_weight_pct),
    quarter_weight_pct: number(row.quarter_weight_pct),
    deviation_vs_month_avg_pct: number(row.deviation_vs_month_avg_pct),
    ranking_in_year: number(row.ranking_in_year),
  }));
}

export function monthlySummaryOutput(series) {
  const groups = new Map();
  for (const row of series) {
    const key = `${row.group_value}\u0000${row.month_number}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(items => {
    const ordered = [...items].sort((a, b) => a.year - b.year);
    const weights = ordered.filter(row => row.annual_weight_pct != null);
    const first = ordered[0];
    const last = ordered.at(-1);
    return {
      group_value: first.group_value, month_number: first.month_number,
      month_name: MONTHS[first.month_number],
      avg_units: round(ordered.reduce((sum, row) => sum + row.units, 0) / ordered.length),
      avg_annual_weight_pct: weights.length
        ? round(weights.reduce((sum, row) => sum + row.annual_weight_pct, 0) / weights.length) : null,
      years_observed: new Set(ordered.map(row => row.year)).size,
      historical_trend_pct: ordered.length > 1 && first.units !== 0
        ? round(100 * (last.units / first.units - 1)) : null,
    };
  }).sort((a, b) => a.group_value.localeCompare(b.group_value)
    || a.month_number - b.month_number);
}
