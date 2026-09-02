import { shiftMonth } from '../expectation/monthSeries.js';
import { evaluateOrgCandidates } from '../deterioration/evaluateOrgCandidates.js';

function groups(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.unit_id}|${row.baseline}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const group of map.values()) group.sort((a, b) => a.month.localeCompare(b.month));
  return map.values();
}

function segments(group) {
  const output = [];
  let current = [];
  for (const row of group) {
    if (current.length && shiftMonth(current.at(-1).month, 1) !== row.month) {
      output.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length) output.push(current);
  return output;
}

export function evaluateSparseEpisodes(rows, parsed) {
  const episodes = [];
  for (const group of groups(rows)) {
    for (const segment of segments(group)) {
      episodes.push(...evaluateOrgCandidates(segment, parsed).episodes);
    }
  }
  episodes.sort((a, b) => `${a.unit_id}|${a.confirmation_month}`.localeCompare(`${b.unit_id}|${b.confirmation_month}`));
  return { episodes };
}
