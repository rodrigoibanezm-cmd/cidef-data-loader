import { median, percentile } from './statistics.js';

export function buildMilestoneSummary(monthly, milestoneDays, percentiles = null) {
  const rows = Array.isArray(monthly) ? monthly : [];
  const evaluableRows = rows.filter((row) => row?.evaluable === true);
  const summary = {};

  for (const day of milestoneDays || []) {
    const ratioKey = `ratio_d${day}`;
    const sample = evaluableRows
      .map((row) => row?.[ratioKey])
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const medianRatio = median(sample);

    const milestoneSummary = {
      months_evaluable: evaluableRows.length,
      sample_size: sample.length,
      median_ratio: medianRatio,
      close_factor_at_median_ratio: medianRatio != null && medianRatio > 0
        ? 1 / medianRatio
        : null,
    };

    if (percentiles !== null) {
      milestoneSummary.percentiles_ratio = Object.fromEntries(
        percentiles.map((value) => [String(value), percentile(sample, value)]),
      );
    }

    summary[`d${day}`] = milestoneSummary;
  }

  return summary;
}
