import { calculateShareExpectation } from '../share-expectation/shareCandidates.js';
import { relativeGapPp } from '../share-expectation/shareGapStatistics.js';

function serializeRow(row, prediction, grain) {
  const base = {
    month: row.month,
    sucursal_id: row.sucursal_id,
    sales: row.sales,
    parent_sales: row.parent_sales,
    actual_share: row.share,
    expected_share: prediction.expected,
    relative_gap_pp: prediction.evaluable
      ? relativeGapPp(row.share, prediction.expected)
      : null,
    evaluable: prediction.evaluable,
    source_months: prediction.source_months,
  };
  if (grain === 'vendedor') base.persona_id = row.persona_id;
  return base;
}

export function buildRelativePerformanceRows(series, parsed, rule) {
  const rows = [];
  for (const unitRows of series.units.values()) {
    const index = new Map(unitRows.map((row) => [row.month, row.share]));
    for (const row of unitRows) {
      if (row.month < parsed.startMonth || row.month > parsed.endMonth) continue;
      const prediction = calculateShareExpectation(rule, row.month, index);
      rows.push(serializeRow(row, prediction, parsed.grain));
    }
  }
  return rows.sort((a, b) => {
    const byMonth = a.month.localeCompare(b.month);
    if (byMonth) return byMonth;
    const byStore = String(a.sucursal_id).localeCompare(String(b.sucursal_id));
    if (byStore || parsed.grain === 'tienda') return byStore;
    return String(a.persona_id).localeCompare(String(b.persona_id));
  });
}
