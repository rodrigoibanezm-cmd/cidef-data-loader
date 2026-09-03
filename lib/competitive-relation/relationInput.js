import { parseCompetitiveInput } from '../competitive/competitiveInput.js';

function pageValue(value, fallback, { min, max = null, name }) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || (max != null && parsed > max)) {
    throw new Error(`${name} must be an integer${max == null ? ` >= ${min}` : ` between ${min} and ${max}`}`);
  }
  return parsed;
}

export function parseRelationInput(input = {}, engineName = 'competitive_relation_v01') {
  const scope = parseCompetitiveInput(input);
  if (!scope.originGroup || scope.originGroup === 'UNKNOWN') {
    throw new Error(`origin_group must be CHINESE or NON_CHINESE for ${engineName}`);
  }
  return {
    scope,
    pairOffset: pageValue(input.pair_offset, 0, { min: 0, name: 'pair_offset' }),
    pairLimit: pageValue(input.pair_limit, 20, { min: 1, max: 50, name: 'pair_limit' }),
  };
}

export function signalBacktestInput(parsed) {
  const { scope } = parsed;
  return {
    target_model_ids: scope.targetModelIds,
    date_from: scope.dateFrom,
    date_to: scope.dateTo,
    origin_group: scope.originGroup,
    ...(scope.geography ? {
      geography: { level: scope.geography.level, values: scope.geography.values },
    } : {}),
    output_mode: 'summary',
    pair_offset: 0,
    pair_limit: 1,
  };
}
