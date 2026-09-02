export function buildBacktestObservations(monthSnapshots) {
  const companyObservations = [];
  const storeObservations = [];
  const monthCoverage = [];
  let certifiedZeroRows = 0;
  let positiveStoreRows = 0;

  for (const monthEntry of monthSnapshots || []) {
    const final = monthEntry.days.at(-1);
    const eligibleStores = new Map(final.stores.map((row) => [String(row.sucursal_id), row]));

    for (const day of monthEntry.days) {
      companyObservations.push({
        target_month: monthEntry.target_month,
        cutoff_date: day.cutoff_date,
        day_of_month: day.day_of_month,
        observed_to_date: day.cidef_owned_sales_to_date,
        actual_close: final.cidef_owned_sales_to_date,
      });

      const observedStores = new Map(day.stores.map((row) => [String(row.sucursal_id), row]));
      for (const [key, closingStore] of eligibleStores.entries()) {
        const observed = observedStores.get(key)?.month_sales_to_date || 0;
        const semantics = observed > 0 ? 'POSITIVE_OBSERVED' : 'CERTIFIED_ZERO';
        if (observed > 0) positiveStoreRows += 1;
        else certifiedZeroRows += 1;
        storeObservations.push({
          target_month: monthEntry.target_month,
          cutoff_date: day.cutoff_date,
          day_of_month: day.day_of_month,
          sucursal_id: closingStore.sucursal_id,
          sucursal: closingStore.sucursal,
          observed_to_date: observed,
          actual_close: closingStore.month_sales_to_date,
          observation_semantics: semantics,
        });
      }
    }

    monthCoverage.push({
      target_month: monthEntry.target_month,
      company_actual_close: final.cidef_owned_sales_to_date,
      eligible_store_months: eligibleStores.size,
      eligible_store_close_sum: final.stores.reduce((sum, row) => sum + row.month_sales_to_date, 0),
      month_end_unresolved_store: final.unresolved_store,
      month_end_ambiguous_store: final.ambiguous_store,
      month_end_unknown_channel: final.unknown_channel,
      negative_store_state_seen: monthEntry.days.some((day) => day.negative_store_state_seen),
    });
  }

  return {
    companyObservations,
    storeObservations,
    monthCoverage,
    counts: {
      company_observations: companyObservations.length,
      store_observations: storeObservations.length,
      certified_zero_rows: certifiedZeroRows,
      positive_store_rows: positiveStoreRows,
      eligible_store_months: monthCoverage.reduce((sum, row) => sum + row.eligible_store_months, 0),
    },
  };
}
