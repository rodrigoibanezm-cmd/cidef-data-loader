import { buildProductGenerationContext } from '../product-generation/buildContext.js';

export const ENGINE_NAME = 'product_generation_context_v01';
export const ENGINE_VERSION = '0.1';

export async function productGenerationContextV01(input = {}) {
  const context = await buildProductGenerationContext(input);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation.ok ? 'ok' : 'warning',
    policy: {
      persistence: 'MASTER identity + canonical VERSION→GENERATION membership state',
      inference: 'no generation membership is inferred from names, portfolio, fuel or textual similarity',
      unresolved: 'known VERSION with unknown GENERATION remains UNRESOLVED',
      evidence: 'generation evidence is returned only when include_evidence=true',
      mutation: 'read-only motor; no backfill or DDL/DML',
    },
    sharedContext: context,
  };
}
