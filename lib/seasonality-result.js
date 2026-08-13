export function coverageOutput(row) {
  if (!row) return { rvm_cidef: 0, matched: 0, unmatched: 0, match_pct: null };
  return {
    rvm_cidef: Number(row.rvm_cidef), matched: Number(row.matched),
    unmatched: Number(row.unmatched), match_pct: row.match_pct == null ? null : Number(row.match_pct),
  };
}

export function paginationOutput(input, totalGroups) {
  if (input.group_by === 'TOTAL') return null;
  return {
    page: input.page, page_size: input.page_size, total_groups: Number(totalGroups),
    total_pages: Math.ceil(Number(totalGroups) / input.page_size),
  };
}
