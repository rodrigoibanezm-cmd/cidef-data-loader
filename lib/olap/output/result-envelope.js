import { VIN_CUBE } from '../vin-cube-registry.js';

export function failResult(code, message, query = {}) {
  return {
    ok: false,
    status: 'FAIL',
    cube: { name:VIN_CUBE.name, version:VIN_CUBE.version },
    query,
    result: null,
    coverage: null,
    audit: { status:'FAIL', checks:[{ name:code, status:'FAIL', message }] },
    warnings: [],
    lineage: {},
  };
}

export function resultStatus(checks, extraWarnings = []) {
  const warnings = [
    ...checks.filter((check) => check.status === 'WARNING').map((check) => check.name),
    ...extraWarnings,
  ];
  return { status:warnings.length ? 'WARNING' : 'PASS', warnings };
}
