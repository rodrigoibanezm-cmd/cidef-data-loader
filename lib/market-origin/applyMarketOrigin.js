import { getMarketBrandOrigin, marketOriginMetadata } from './loadMarketOrigin.js';

const n = (value) => Number(value ?? 0);
const text = (value) => String(value || '');

function annotate(model) {
  return { ...model, marketOrigin: getMarketBrandOrigin(model.brand) };
}

function rank(models) {
  const sorted = [...models].sort((a, b) =>
    n(b.units) - n(a.units)
    || text(a.brand).localeCompare(text(b.brand))
    || text(a.model).localeCompare(text(b.model))
    || text(a.entityKey).localeCompare(text(b.entityKey))
  );
  const totalUnits = sorted.reduce((sum, row) => sum + n(row.units), 0);
  let cumulative = 0;
  return sorted.map((row, index) => {
    cumulative += n(row.units);
    return {
      ...row,
      rank: index + 1,
      share: totalUnits ? n(row.units) / totalUnits : null,
      cumulativeShare: totalUnits ? cumulative / totalUnits : null,
    };
  });
}

function applyUniverse(universe, requestedGroup) {
  const annotated = universe.models.map(annotate);
  const unknown = annotated.filter((row) => row.marketOrigin.originGroup === 'UNKNOWN');
  const selected = requestedGroup
    ? annotated.filter((row) => row.marketOrigin.originGroup === requestedGroup)
    : annotated;
  const models = requestedGroup ? rank(selected) : annotated;
  const totalUnits = models.reduce((sum, row) => sum + n(row.units), 0);
  return {
    ...universe,
    totalUnits: requestedGroup ? totalUnits : universe.totalUnits,
    totalModels: requestedGroup ? models.length : universe.totalModels,
    totalBrands: requestedGroup ? new Set(models.map((row) => row.brand)).size : universe.totalBrands,
    models,
    marketOriginCoverage: {
      requestedGroup: requestedGroup || 'ALL',
      sourceTotalUnits: n(universe.totalUnits),
      selectedUnits: totalUnits,
      unknownUnits: unknown.reduce((sum, row) => sum + n(row.units), 0),
      unknownModels: unknown.length,
    },
  };
}

function recalcObservation(row, universes) {
  const universe = universes.find((item) =>
    item.key.segment === row.segment && item.key.type === row.type && item.key.fuel === row.fuel
  );
  const model = universe?.models.find((item) => item.modelId === row.targetModelId);
  return {
    ...row,
    targetUniverseShare: universe?.totalUnits && model ? n(model.units) / n(universe.totalUnits) : null,
  };
}

export function applyMarketOrigin(context, requestedGroup = null) {
  const targets = context.targets.map((row) => ({
    ...row,
    marketOrigin: getMarketBrandOrigin(row.brand),
  }));
  const universes = context.universes.map((row) => applyUniverse(row, requestedGroup));
  const targetUnknown = targets.some((row) => row.marketOrigin.originGroup === 'UNKNOWN');
  const targetMismatch = requestedGroup && targets.some((row) => row.marketOrigin.originGroup !== requestedGroup);
  const unknownUnits = universes.reduce((sum, row) => sum + row.marketOriginCoverage.unknownUnits, 0);
  const warnings = [...context.warnings];
  if (unknownUnits) warnings.push('MARKET_ORIGIN_UNKNOWN_PRESENT');
  if (targetUnknown) warnings.push('TARGET_MARKET_ORIGIN_UNKNOWN');
  if (targetMismatch) warnings.push('TARGET_ORIGIN_GROUP_MISMATCH');
  const validationOk = context.validation.ok && !targetUnknown && !targetMismatch && unknownUnits === 0;
  return {
    ...context,
    scope: { ...context.scope, originGroup: requestedGroup },
    targets,
    targetObservations: requestedGroup
      ? context.targetObservations.map((row) => recalcObservation(row, universes))
      : context.targetObservations,
    universes,
    marketOrigin: { ...marketOriginMetadata(), requestedGroup: requestedGroup || 'ALL' },
    validation: { ...context.validation, market_origin_complete: unknownUnits === 0, ok: validationOk },
    warnings: [...new Set(warnings)],
  };
}
