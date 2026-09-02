function bounded(rows, parsed) {
  const filtered = parsed.detailUnitId == null
    ? rows
    : rows.filter((row) => String(row.unit_id) === parsed.detailUnitId);
  return {
    rows: filtered.slice(0, parsed.detailLimit),
    detail: {
      matched_rows: filtered.length,
      returned_rows: Math.min(filtered.length, parsed.detailLimit),
      truncated: filtered.length > parsed.detailLimit,
    },
  };
}

export function formatObservationAudit(result, parsed) {
  const units = bounded(result.units, parsed);
  const oldEpisodes = bounded(result.old_only_episodes, parsed);
  const newEpisodes = bounded(result.new_only_episodes, parsed);
  return {
    ...result.base,
    coverage: result.coverage,
    detail: units.detail,
    units: units.rows,
    old: result.old,
    new: result.new,
    comparison: result.comparison,
    episode_comparison: {
      old_only: oldEpisodes.detail,
      old_only_episodes: oldEpisodes.rows,
      new_only: newEpisodes.detail,
      new_only_episodes: newEpisodes.rows,
    },
  };
}
