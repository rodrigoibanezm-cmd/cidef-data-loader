export function auditVinUniverse(rows, vinGetter) {
  const seen = new Map(); let nullVin = 0; let blankVin = 0;
  for (const row of rows) {
    const v = vinGetter(row);
    if (v == null) { nullVin += 1; continue; }
    const t = String(v).trim();
    if (!t) { blankVin += 1; continue; }
    seen.set(t, (seen.get(t) || 0) + 1);
  }
  const duplicateVin = [...seen.values()].filter((n) => n > 1).length;
  const eligibleVin = [...seen.values()].filter((n) => n === 1).length;
  return {
    status: duplicateVin ? 'FAIL' : 'PASS',
    source_rows: rows.length,
    null_vin: nullVin,
    blank_vin: blankVin,
    duplicate_vin: duplicateVin,
    eligible_vin: eligibleVin,
  };
}

export function auditTemporal(values, parser) {
  let nonNull = 0; let parsed = 0; let invalid = 0; let nullCount = 0;
  for (const value of values) {
    const p = parser(value);
    if (p.status === 'null') nullCount += 1;
    else { nonNull += 1; if (p.status === 'parsed') parsed += 1; else invalid += 1; }
  }
  return { status: invalid ? 'WARNING' : 'PASS', non_null: nonNull, parsed, invalid, null: nullCount };
}

export function reconcileUniverse({ source, eligible, filtered, used, excludedIneligible, excludedByFilter, excludedInvalid }) {
  const a = source === eligible + excludedIneligible;
  const b = eligible === filtered + excludedByFilter;
  const c = filtered === used + excludedInvalid;
  return { status: a && b && c ? 'PASS' : 'FAIL', equations: { source: a, eligible: b, filtered: c } };
}

export function reconcileAggregation(total, groupedTotal) {
  return { status: total === groupedTotal ? 'PASS' : 'FAIL', expected: total, actual: groupedTotal };
}
