import { buildRelativePerformance } from '../relative-performance/buildRelativePerformance.js';
import { parseRelativePerformanceInput } from '../relative-performance/relativePerformanceInput.js';

export const ENGINE_NAME = 'organizational_relative_performance_v01';
export const ENGINE_VERSION = '0.1';

export async function organizationalRelativePerformanceV01(input = {}) {
  const parsed = parseRelativePerformanceInput(input);
  const result = await buildRelativePerformance(parsed);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    inputs: {
      grain: parsed.grain,
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
    },
    policy: {
      family: 'Familia 4 - DESEMPEÑO RELATIVO',
      mode: 'CURRENT_SNAPSHOT',
      target_months: 'closed calendar months only in America/Santiago',
      point_in_time: 'not available in v0.1',
      output_universe: 'units observed in each target month only; missing units are not fabricated as zero',
      missing_history: 'missing calendar lags are never imputed or converted to zero',
      relative_gap_pp: '100 * (actual_share - expected_share); null when expectation is unavailable',
      selection: 'certified baseline is fixed by grain and is not caller-configurable',
    },
    ...result,
  };
}
