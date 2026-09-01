export function rankExpectedCandidates(metrics) {
  return [...metrics]
    .sort((a, b) => {
      const wape = (a.wape ?? Infinity) - (b.wape ?? Infinity);
      if (wape !== 0) return wape;

      const bias = Math.abs(a.bias_pct ?? Infinity) - Math.abs(b.bias_pct ?? Infinity);
      if (bias !== 0) return bias;

      const mae = (a.mae ?? Infinity) - (b.mae ?? Infinity);
      if (mae !== 0) return mae;

      return a.candidate.localeCompare(b.candidate);
    })
    .map((row, index) => ({ rank: index + 1, ...row }));
}
