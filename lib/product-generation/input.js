const MEMBERSHIP_STATUSES = new Set(['RESOLVED', 'UNRESOLVED', 'CONFLICT']);

function optionalId(value, name) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function parseProductGenerationInput(input = {}) {
  const modeloId = optionalId(input.modelo_id, 'modelo_id');
  const versionId = optionalId(input.version_id, 'version_id');
  const generationId = optionalId(input.generation_id, 'generation_id');
  const membershipStatus = input.membership_status ?? null;
  if (membershipStatus !== null && !MEMBERSHIP_STATUSES.has(membershipStatus)) {
    throw new Error('membership_status must be RESOLVED, UNRESOLVED or CONFLICT');
  }

  const limit = input.limit === undefined ? 100 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('limit must be an integer between 1 and 200');
  }

  return {
    modeloId,
    versionId,
    generationId,
    membershipStatus,
    includeEvidence: input.include_evidence === true,
    limit,
  };
}
