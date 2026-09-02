export function validateHistory(built, range) {
  const coverageReconciles = built.dailyCoverage.every((row) => (
    row.recognized_sales_in_target_month_to_date
    === row.resolved_store + row.unresolved_store + row.ambiguous_store
  ));
  const storeRowsPositive = built.storeDaily.every((row) => row.accumulated_sales > 0);
  const openLabelsNull = built.cidefDaily
    .filter((row) => row.target_month === range.currentMonth)
    .every((row) => row.actual_close == null)
    && built.storeDaily
      .filter((row) => row.target_month === range.currentMonth)
      .every((row) => row.actual_close == null);

  const closedEndEqualsLabel = built.cidefDaily
    .filter((row) => row.target_month < range.currentMonth)
    .every((row, index, rows) => {
      const next = rows[index + 1];
      if (next?.target_month === row.target_month) return true;
      return row.accumulated_sales === row.actual_close;
    });

  const noFutureDates = built.cidefDaily.every((row) => row.cutoff_date <= range.currentDate);
  const validations = {
    coverage_reconciles: coverageReconciles,
    store_rows_sparse_positive: storeRowsPositive,
    open_month_labels_null: openLabelsNull,
    closed_month_end_equals_label: closedEndEqualsLabel,
    no_future_cutoff_dates: noFutureDates,
  };
  return { ok: Object.values(validations).every(Boolean), validations };
}
