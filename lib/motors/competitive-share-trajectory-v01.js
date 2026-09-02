import { buildCompetitiveTrajectory } from '../competitive-trajectory/buildCompetitiveTrajectory.js';
import { parseTrajectoryOutputInput } from '../competitive-trajectory/trajectoryOutputInput.js';
import { projectTrajectoryOutput } from '../competitive-trajectory/projectTrajectoryOutput.js';

export const ENGINE_NAME = 'competitive_share_trajectory_v01';
export const ENGINE_VERSION = '0.2';

export async function competitiveShareTrajectoryV01(input = {}) {
  const request = parseTrajectoryOutputInput(input);
  const fullContext = await buildCompetitiveTrajectory(input);
  const context = projectTrajectoryOutput(fullContext, request);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation.ok ? 'ok' : 'warning',
    policy: {
      dependency: 'competitive_context_v01',
      persistence: 'runtime only; no materialized competitor or trajectory table',
      peer_dimensions: ['descripcion_segmento', 'descripcion_tipo', 'combustible', 'origin_group optional'],
      monthly_grain: 'month + peer universe + market entity',
      share_denominator: 'monthly units inside the same peer universe after optional origin_group filtering',
      zero_fill: 'entities observed at least once in range are zero-filled in missing months',
      rank: 'monthly deterministic order by units; synthetic zero rows expose rank=null',
      output: 'trajectory default; monthly requires explicit entity_keys to bound transport',
      competitor_rule: 'none; trajectory is evidence and does not label competitors',
    },
    sharedContext: context,
  };
}
