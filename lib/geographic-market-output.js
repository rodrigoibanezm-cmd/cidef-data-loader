const numeric = value => value == null ? null : Number(value);
const key = row => `${row.geography}\u0000${row.marca}`;

function baseRow(row) {
  return {
    geography: row.geography, marca: row.marca,
    unidades_marca: numeric(row.brand_units),
    unidades_universo: numeric(row.universe_units),
    share_pct: numeric(row.share_pct), ranking: numeric(row.ranking),
  };
}

export function summaryOutput(rows, hasComparison) {
  const current = rows.filter(row => row.period_key === 'current');
  const previous = new Map(rows.filter(row => row.period_key === 'comparison')
    .map(row => [key(row), row]));
  return current.map(row => {
    const result = baseRow(row);
    const before = previous.get(key(row));
    const comparisonShare = before ? numeric(before.share_pct) : null;
    const delta = before ? Number((result.share_pct - comparisonShare).toFixed(4)) : null;
    const comparisonRanking = before ? numeric(before.ranking) : null;
    const rankingDelta = result.ranking != null && comparisonRanking != null
      ? comparisonRanking - result.ranking : null;
    return {
      ...result,
      comparison_share_pct: hasComparison ? comparisonShare : null,
      delta_pp: hasComparison ? delta : null,
      comparison_ranking: hasComparison ? comparisonRanking : null,
      ranking_delta: hasComparison ? rankingDelta : null,
      trend: delta == null ? null : Math.abs(delta) < 0.05 ? 'FLAT' : delta > 0 ? 'UP' : 'DOWN',
    };
  });
}

export function seriesOutput(rows) {
  return rows.map(row => ({
    year_month: row.year_month, geography: row.geography, marca: row.marca,
    unidades_marca: numeric(row.brand_units),
    unidades_universo: numeric(row.universe_units),
    share_pct: numeric(row.share_pct), ranking: numeric(row.ranking),
  }));
}
