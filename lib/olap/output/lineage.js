import { VIN_CUBE } from '../vin-cube-registry.js';

function usesDealerMaster(input, mode) {
  const fields = [
    ...(input.dimensions || []),
    ...(mode === 'all'
      ? (input.filters || []).map((filter) => filter.field).filter(Boolean)
      : []),
  ];
  return fields.some((field) => field.name === 'dealer_supervisor' ||
    (field.name === 'dealer_sale' && field.level === 'canonical'));
}

export function lineageOutput(input, { operation, sql = false, identity = 'all' } = {}) {
  if (input.options?.include_lineage === false) return undefined;
  const lineage = {
    physical_source: VIN_CUBE.source,
    fact: VIN_CUBE.fact.name,
    cube_version: VIN_CUBE.version,
    universe: input.universe,
    time_role: input.time?.role || null,
    normalizations: [
      'VIN:TRIM',
      `text:TRIM+${sql ? 'whitespace' : 'control-whitespace'}+UPPER`,
    ],
    identity_masters: identity !== 'none' && usesDealerMaster(input, identity)
      ? ['dealers_master'] : [],
  };
  if (operation) lineage.operation = operation;
  return lineage;
}
