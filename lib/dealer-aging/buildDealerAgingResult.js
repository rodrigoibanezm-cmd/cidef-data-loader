function numberOrNull(value) {
  return value == null ? null : Number(value);
}

function normalizeDealer(row) {
  return {
    dealer_id: numberOrNull(row.dealer_id),
    dealer: row.dealer,
    dealer_group_id: numberOrNull(row.dealer_group_id),
    dealer_group: row.dealer_group,
    vins: Number(row.vins),
    aging_min: numberOrNull(row.aging_min),
    aging_max: numberOrNull(row.aging_max),
    aging_promedio: numberOrNull(row.aging_promedio),
  };
}

function normalizeDetail(row) {
  return {
    ...row,
    version_id: numberOrNull(row.version_id),
    dealer_id: numberOrNull(row.dealer_id),
    dealer_group_id: numberOrNull(row.dealer_group_id),
    aging_days: Number(row.aging_days),
  };
}

export function buildDealerAgingResult({ input, summaryRow = {}, dealerRows = [], detailRows = [] }) {
  const summary = {
    dealer_stock_current: Number(summaryRow.dealer_stock_current || 0),
    with_fecha_ingreso: Number(summaryRow.with_fecha_ingreso || 0),
    missing_fecha_ingreso: Number(summaryRow.missing_fecha_ingreso || 0),
    over_min_days: Number(summaryRow.over_min_days || 0),
    aged_unresolved_dealer: Number(summaryRow.aged_unresolved_dealer || 0),
    aging_min: numberOrNull(summaryRow.aging_min),
    aging_max: numberOrNull(summaryRow.aging_max),
    aging_avg: numberOrNull(summaryRow.aging_avg),
  };
  const byDealer = dealerRows.map(normalizeDealer);
  const detail = detailRows.map(normalizeDetail);
  const unresolvedPreserved = summary.aged_unresolved_dealer === 0
    || byDealer.some((row) => row.dealer_id == null && row.vins > 0);

  return {
    summary,
    by_dealer: byDealer,
    detail,
    validation: {
      coverage_reconciles: summary.with_fecha_ingreso + summary.missing_fecha_ingreso === summary.dealer_stock_current,
      aged_not_above_dated_stock: summary.over_min_days <= summary.with_fecha_ingreso,
      detail_bounded: detail.length <= input.detailLimit,
      detail_all_over_threshold: detail.every((row) => row.aging_days > input.minDays),
      unresolved_dealer_stock_preserved: unresolvedPreserved,
    },
  };
}
