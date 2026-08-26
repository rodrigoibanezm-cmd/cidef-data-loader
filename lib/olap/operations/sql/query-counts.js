export function numericRow(rows, field) {
  return Number(rows[0]?.[field] || 0);
}

export async function runCountQueries(sql, plan) {
  const [sourceRows, duplicateRows, eligibleRows, universeRows, filteredRows, usedRows] =
    await Promise.all([
      sql.query(plan.sourceAudit),
      sql.query(plan.duplicateAudit),
      sql.query(plan.eligibleCount),
      sql.query(plan.universeCount),
      sql.query(plan.filteredCount, plan.filterValues || plan.values),
      sql.query(plan.usedCount, plan.filterValues || plan.values),
    ]);
  return {
    sourceAudit:sourceRows[0] || {},
    duplicates:numericRow(duplicateRows, 'duplicate_vin'),
    source:numericRow(sourceRows, 'source_rows'),
    eligible:numericRow(eligibleRows, 'eligible_vin'),
    universe:numericRow(universeRows, 'universe_rows'),
    filtered:numericRow(filteredRows, 'filtered_rows'),
    used:numericRow(usedRows, 'used_rows'),
  };
}
