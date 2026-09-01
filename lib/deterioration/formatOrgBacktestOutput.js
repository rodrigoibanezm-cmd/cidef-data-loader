function numericRange(values) {
  const known = values.filter((value) => Number.isFinite(value));
  return known.length ? { min: Math.min(...known), max: Math.max(...known) } : null;
}

function summarizeSeries(rows) {
  if (!rows.length) return { periods: 0, first_cutoff: null, last_cutoff: null };
  return {
    periods: rows.length,
    first_cutoff: rows[0].cutoff_month,
    last_cutoff: rows.at(-1).cutoff_month,
    units: numericRange(rows.map((row) => row.units)),
    recognized: numericRange(rows.map((row) => row.recognized)),
    resolved: numericRange(rows.map((row) => row.resolved)),
    unresolved: numericRange(rows.map((row) => row.unresolved)),
    ambiguous: numericRange(rows.map((row) => row.ambiguous)),
  };
}

function candidateKey(row) {
  return `${row.baseline}|${row.deviation_method}|${row.persistence_rule}`;
}

function summarizeStability(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = candidateKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((group) => ({
    baseline: group[0].baseline,
    deviation_method: group[0].deviation_method,
    persistence_rule: group[0].persistence_rule,
    years_with_episodes: group.length,
    first_year: group[0].year,
    last_year: group.at(-1).year,
    episodes: numericRange(group.map((row) => row.episodes)),
    immediate_reversal_rate: numericRange(group.map((row) => row.immediate_reversal_rate)),
    next_2_persistent_rate: numericRange(group.map((row) => row.next_2_persistent_rate)),
    next_3_persistent_rate: numericRange(group.map((row) => row.next_3_persistent_rate)),
  }));
}

function matchesDetail(row, parsed) {
  if (parsed.detailBaseline && row.baseline !== parsed.detailBaseline) return false;
  if (parsed.detailDeviation && row.deviation_method !== parsed.detailDeviation) return false;
  if (parsed.detailPersistence && row.persistence_rule !== parsed.detailPersistence) return false;
  return true;
}

function detailPayload(rows, parsed, field) {
  const matched = rows.filter((row) => matchesDetail(row, parsed));
  return {
    [field]: matched.slice(0, parsed.detailLimit),
    detail: {
      matched_rows: matched.length,
      returned_rows: Math.min(matched.length, parsed.detailLimit),
      truncated: matched.length > parsed.detailLimit,
    },
  };
}

function common(result) {
  return {
    status: result.status,
    identity_audit: result.identity_audit,
    coverage: result.coverage,
    warnings: result.warnings,
    validation: result.validation,
  };
}

export function formatOrgBacktestOutput(result, parsed) {
  const base = common(result);
  if (parsed.outputMode === 'episodes') {
    return { ...base, ...detailPayload(result.episode_backtests, parsed, 'episode_backtests') };
  }
  if (parsed.outputMode === 'stability') {
    return { ...base, ...detailPayload(result.rolling_year_stability, parsed, 'rolling_year_stability') };
  }
  if (parsed.outputMode === 'units') {
    return {
      ...base,
      unit_backtests: result.unit_backtests.slice(0, parsed.detailLimit),
      detail: {
        matched_rows: result.unit_backtests.length,
        returned_rows: Math.min(result.unit_backtests.length, parsed.detailLimit),
        truncated: result.unit_backtests.length > parsed.detailLimit,
      },
    };
  }
  return {
    ...base,
    monthly_series_coverage: summarizeSeries(result.monthly_series_coverage),
    candidate_results: result.candidate_results,
    rolling_year_stability: summarizeStability(result.rolling_year_stability),
    detail_available: {
      output_modes: ['stability', 'episodes', 'units'],
      default_detail_limit: parsed.detailLimit,
      candidate_filters: ['detail_baseline', 'detail_deviation_method', 'detail_persistence_rule'],
    },
  };
}
