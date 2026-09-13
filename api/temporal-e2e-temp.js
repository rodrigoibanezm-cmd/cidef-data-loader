import { resolveSemanticParse } from '../lib/resolve/resolveSemanticParse.js';
import { analyzeIntent } from '../lib/analyze/analyzeIntent.js';

const question = '¿Hay señales de riesgo en Foton durante el último trimestre frente al mismo trimestre del año anterior?';
const semantic_parse = {
  version: 'semantic_parse.v1',
  question_type: 'RISK',
  entity: { type: 'BRAND', value: 'Foton' },
  period: { date_from: '2026-04-01', date_to: '2026-06-30' },
  comparison: 'YOY',
  scope: { organization_scope: 'CIDEF', commercial_universe: 'COMPANY' },
  depth: 'DEEP',
};

const forbidden = ['target_model_ids','capability','motor','domain','dependency','canonical_id'];
function leaked(value){
  const text = JSON.stringify(value).toLowerCase();
  return forbidden.filter(term => text.includes(term));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'GET required' });
  try {
    const resolution = await resolveSemanticParse({ question, semantic_parse });
    const first = await analyzeIntent({ resolution_id: resolution.resolution_id, intent: {} });
    let second = null;
    if (first.analysis_iteration.status === 'CONTINUE' && first.analysis_iteration.continuation_id) {
      second = await analyzeIntent({
        resolution_id: resolution.resolution_id,
        intent: {},
        continuation_id: first.analysis_iteration.continuation_id,
      });
    }
    const iterations = [first.analysis_iteration, second?.analysis_iteration].filter(Boolean);
    return res.status(200).json({
      ok: true,
      resolution: {
        ready: resolution.ready,
        entity: resolution.resolved?.entity,
        period: resolution.resolved?.period,
        availability: resolution.availability,
        missing: resolution.missing,
      },
      iterations: iterations.map((it, index) => ({
        index: index + 1,
        status: it.status,
        sufficiency: it.sufficiency,
        response_payload: it.response_payload,
        context_payload: it.context_payload,
        leaks: leaked(it),
        bytes: Buffer.byteLength(JSON.stringify(it)),
      })),
    });
  } catch (error) {
    return res.status(error?.code ? 400 : 500).json({
      ok:false,
      error:error?.message || 'TEMPORAL_E2E_FAILED',
      ...(error?.code ? { error_code:error.code } : {}),
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    });
  }
}
