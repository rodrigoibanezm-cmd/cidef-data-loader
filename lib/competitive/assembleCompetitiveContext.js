const numberOrZero = (value) => Number(value ?? 0);
const numberOrNull = (value) => (value == null ? null : Number(value));

function warningCodes({ targets, observations, validation, missingTargetIds }) {
  const warnings = [];
  if (missingTargetIds.length) warnings.push('TARGET_NOT_IN_CIDEF_PORTFOLIO');
  const observedIds = new Set(observations.map((row) => Number(row.target_model_id)));
  if (targets.some((row) => !observedIds.has(Number(row.modelo_id)))) warnings.push('TARGET_WITHOUT_RVM_IDENTITY');
  if (numberOrZero(validation.contextual_rows) > 0) warnings.push('CONTEXTUAL_IDENTITY_USED');
  if (numberOrZero(validation.ambiguous_rows) > 0) warnings.push('AMBIGUOUS_IDENTITY_PRESENT');
  if (numberOrZero(validation.unresolved_rows) > 0) warnings.push('UNRESOLVED_IDENTITY_PRESENT');
  if (numberOrZero(validation.resolved_rows) < numberOrZero(validation.raw_rows)) warnings.push('INCOMPLETE_IDENTITY_COVERAGE');
  if (numberOrZero(validation.negative_quantity_rows) > 0) warnings.push('NEGATIVE_QUANTITY_PRESENT');
  if (numberOrZero(validation.quantity_not_one_rows) > 0) warnings.push('QUANTITY_NOT_ONE_PRESENT');
  return warnings;
}

function groupUniverses(rows) {
  const universes = new Map();
  for (const row of rows) {
    const key = `${row.segment_key ?? ''}|${row.type_key ?? ''}|${row.fuel_key ?? ''}`;
    if (!universes.has(key)) {
      universes.set(key, {
        key: { segment: row.segment ?? null, type: row.type ?? null, fuel: row.fuel ?? null },
        targetModelIds: (row.target_model_ids || []).map(Number),
        totalUnits: numberOrZero(row.total_units), totalModels: numberOrZero(row.total_models),
        totalBrands: numberOrZero(row.total_brands), models: [],
      });
    }
    universes.get(key).models.push({
      entityKey: row.entity_key, modelId: numberOrNull(row.model_id), identityStatus: row.identity_status,
      brand: row.brand ?? null, model: row.model ?? null, rvmBrand: row.rvm_brand ?? null,
      rvmModel: row.rvm_model ?? null, units: numberOrZero(row.units), rowCount: numberOrZero(row.row_count),
      rank: numberOrZero(row.rank), share: numberOrNull(row.share), cumulativeShare: numberOrNull(row.cumulative_share),
    });
  }
  return [...universes.values()];
}

export function assembleCompetitiveContext(scope, payload = {}) {
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const observations = Array.isArray(payload.target_observations) ? payload.target_observations : [];
  const missingTargetIds = (payload.missing_target_ids || []).map(Number);
  const rawValidation = payload.validation || {};
  const rawUnits = numberOrZero(rawValidation.raw_units);
  const resolvedUnits = numberOrZero(rawValidation.resolved_units);
  const warnings = warningCodes({ targets, observations, validation: rawValidation, missingTargetIds });
  const validation = {
    ...Object.fromEntries(Object.entries(rawValidation).map(([k, v]) => [k, typeof v === 'boolean' ? v : numberOrZero(v)])),
    identityCoverage: rawUnits ? resolvedUnits / rawUnits : null,
    ok: missingTargetIds.length === 0 && rawValidation.universe_reconciled === true,
  };
  return {
    context: 'competitive_context_v01', version: '0.2',
    scope: { dateFrom: scope.dateFrom, dateTo: scope.dateTo,
      geography: scope.geography ? { level: scope.geography.level, values: scope.geography.values } : null },
    targets: targets.map((row) => ({ modelId: Number(row.modelo_id), brandId: Number(row.marca_id), brand: row.brand, model: row.model })),
    targetObservations: observations.map((row) => ({
      targetModelId: Number(row.target_model_id), segment: row.segment, type: row.type, fuel: row.fuel,
      units: numberOrZero(row.target_units), targetUniverseShare: numberOrNull(row.target_universe_share),
    })),
    universes: groupUniverses(payload.ranked_models || []), validation, warnings,
  };
}
