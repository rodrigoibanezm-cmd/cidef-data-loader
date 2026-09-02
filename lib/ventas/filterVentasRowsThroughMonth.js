import { filterVentasRowsThroughCutoff } from './filterVentasRowsThroughCutoff.js';

export function filterVentasRowsThroughMonth(rows, cutoffMonth) {
  const { rows: kept, excluded } = filterVentasRowsThroughCutoff(rows, { cutoffMonth });
  return { rows: kept, excluded };
}
