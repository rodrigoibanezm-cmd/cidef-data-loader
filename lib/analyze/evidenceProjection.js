import { projectPublicRequirement } from './publicProjectionRegistry.js';

const PUBLIC_KIND = Object.freeze({
  CURRENT_RESULT:'current_result',
  HISTORICAL_REFERENCE:'historical_reference',
  MARKET_REFERENCE:'market_reference',
  CLOSE_EXPECTATION:'expectation',
  CHANGE_CONTRIBUTION:'change_explanation',
  CRM_CONTEXT_SIGNAL:'demand_context',
  COMMERCIAL_OPERATION_SIGNAL:'commercial_operation_context',
});

export function projectEvidence({ investigation, plan, intent, raw }) {
  const requirements = investigation?.requirements ?? [];
  if (!requirements.length) {
    return { status: 'NOT_EVALUABLE', reason_code: 'PUBLIC_PROJECTION_NOT_REGISTERED', evidence: undefined };
  }
  const projected = requirements.map((requirement) => ({
    requirement,
    projection: projectPublicRequirement({ channel: 'EVIDENCE', requirement, plan, intent, raw }),
  }));
  const failed = projected.find(({ projection }) => projection.status !== 'AVAILABLE');
  if (failed) {
    return {
      status: 'NOT_EVALUABLE',
      reason_code: failed.projection.reason_code ?? 'PUBLIC_CONTRACT_INSUFFICIENT_INPUT',
      evidence: failed.projection.data,
      ...(failed.projection.coverage ? { coverage: failed.projection.coverage } : {}),
    };
  }
  if (projected.length === 1) {
    const projection = projected[0].projection;
    return { status: 'AVAILABLE', evidence: projection.data, ...(projection.coverage ? { coverage: projection.coverage } : {}) };
  }
  return {
    status: 'AVAILABLE',
    evidence: {
      items: projected.map(({ requirement, projection }) => ({
        kind: PUBLIC_KIND[requirement.type] ?? String(requirement.type).toLowerCase(),
        data: projection.data,
        ...(projection.coverage ? { coverage: projection.coverage } : {}),
      })),
    },
    coverage: { status: 'AVAILABLE' },
  };
}
