import { buildCompetitiveContext } from '../competitive/buildCompetitiveContext.js';

export const ENGINE_NAME = 'competitive_context_v01';
export const ENGINE_VERSION = '0.1';

export async function competitiveContextV01(input = {}) {
  const context = await buildCompetitiveContext(input);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation.ok ? 'ok' : 'warning',
    policy: {
      persistence: 'runtime only; no analytical table or materialized competitor list',
      units: 'SUM(rvm_raw.cantidad)',
      universe_dimensions: ['descripcion_segmento', 'descripcion_tipo', 'combustible'],
      identity: 'contextual RESUELTO before generic; unresolved market units remain in denominator',
      pareto: 'not applied in context; consumers may cut by cumulativeShare at runtime',
    },
    sharedContext: context,
  };
}
