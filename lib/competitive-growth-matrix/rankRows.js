const FIELDS = Object.freeze({
  GROWTH_DIFFERENTIAL_PP: 'growth_differential_pp',
  CIDEF_GROWTH_ABS: 'cidef_growth_abs',
  CIDEF_GROWTH_PCT: 'cidef_growth_pct',
});

function idCompare(left, right, nullsFirst = false) {
  if (left == null || right == null) {
    if (left == null && right == null) return 0;
    return left == null ? (nullsFirst ? -1 : 1) : (nullsFirst ? 1 : -1);
  }
  return Number(left) - Number(right);
}

function numberDesc(left, right) {
  if (left == null || right == null) {
    if (left == null && right == null) return 0;
    return left == null ? 1 : -1;
  }
  return Number(right) - Number(left);
}

export function compareRankRows(left, right, ranking) {
  const field = FIELDS[ranking.metric];
  const primary = ranking.direction === 'ASC'
    ? left[field] - right[field] : right[field] - left[field];
  return primary
    || numberDesc(left.benchmark_vin_current, right.benchmark_vin_current)
    || numberDesc(left.cidef_vin_current, right.cidef_vin_current)
    || idCompare(left.brand_id, right.brand_id)
    || idCompare(left.model_id, right.model_id, true);
}

export function rankRows(rows, requests = []) {
  return requests.map((request) => {
    const field = FIELDS[request.metric];
    const groups = new Map();
    for (const row of rows) {
      if (!['BRAND', 'MODEL'].includes(row.comparison_scope) || row[field] == null) continue;
      const key = `${row.period}|${row.temporal_comparison}|${row.comparison_scope}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return {
      ...request,
      groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, candidates]) => {
        const [period, temporalComparison, comparisonScope] = key.split('|');
        return {
          period,
          temporal_comparison: temporalComparison,
          comparison_scope: comparisonScope,
          rows: candidates.sort((a, b) => compareRankRows(a, b, request)).slice(0, request.limit),
        };
      }),
    };
  });
}
