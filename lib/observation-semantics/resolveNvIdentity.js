export function nvIdentityStatus(row) {
  const matches = Number(row?.match_count ?? 0);
  if (matches > 1) return 'AMBIGUOUS';
  if (matches === 1 && row?.sucursal_id != null) return 'RESOLVED';
  return 'UNRESOLVED';
}

export function resolveNvIdentity(rows) {
  const unresolvedKeys = new Set();
  let resolvedRows = 0;
  let unresolvedRows = 0;
  let ambiguousRows = 0;

  const classified = rows.map((row) => {
    const identity_status = nvIdentityStatus(row);
    if (identity_status === 'RESOLVED') resolvedRows += 1;
    else if (identity_status === 'AMBIGUOUS') ambiguousRows += 1;
    else {
      unresolvedRows += 1;
      if (row.desc_sucursal_vta != null) unresolvedKeys.add(String(row.desc_sucursal_vta));
    }
    return { ...row, identity_status };
  });

  return {
    rows: classified,
    audit: {
      total_rows: rows.length,
      resolved_rows: resolvedRows,
      unresolved_rows: unresolvedRows,
      ambiguous_rows: ambiguousRows,
      unresolved_keys: [...unresolvedKeys].sort(),
    },
  };
}
