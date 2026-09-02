function closingStores(monthEntry) {
  return new Map(
    (monthEntry.days.at(-1)?.stores || []).map((row) => [String(row.sucursal_id), row]),
  );
}

function visibleDays(monthEntry, currentMonth, currentDate) {
  if (monthEntry.target_month !== currentMonth) return monthEntry.days;
  const maxDay = Number(currentDate.slice(8, 10));
  return monthEntry.days.filter((day) => day.day_of_month <= maxDay);
}

export function buildHistoryRows(monthSnapshots, range) {
  const cidefDaily = [];
  const storeDaily = [];
  const dailyCoverage = [];

  for (const monthEntry of monthSnapshots || []) {
    const isClosed = monthEntry.target_month < range.currentMonth;
    const final = isClosed ? monthEntry.days.at(-1) : null;
    const finalStores = isClosed ? closingStores(monthEntry) : new Map();

    for (const day of visibleDays(monthEntry, range.currentMonth, range.currentDate)) {
      cidefDaily.push({
        target_month: monthEntry.target_month,
        cutoff_date: day.cutoff_date,
        day_of_month: day.day_of_month,
        accumulated_sales: day.cidef_owned_sales_to_date,
        actual_close: isClosed ? final.cidef_owned_sales_to_date : null,
      });

      for (const store of day.stores) {
        storeDaily.push({
          target_month: monthEntry.target_month,
          cutoff_date: day.cutoff_date,
          day_of_month: day.day_of_month,
          sucursal_id: store.sucursal_id,
          accumulated_sales: store.month_sales_to_date,
          actual_close: isClosed
            ? (finalStores.get(String(store.sucursal_id))?.month_sales_to_date ?? 0)
            : null,
        });
      }

      dailyCoverage.push({
        target_month: monthEntry.target_month,
        cutoff_date: day.cutoff_date,
        recognized_sales_in_target_month_to_date: day.recognized_sales_to_date,
        resolved_store: day.resolved_store,
        unresolved_store: day.unresolved_store,
        ambiguous_store: day.ambiguous_store,
        unknown_channel: day.unknown_channel,
        cidef_owned_sales_to_date: day.cidef_owned_sales_to_date,
      });
    }
  }

  return { cidefDaily, storeDaily, dailyCoverage };
}
