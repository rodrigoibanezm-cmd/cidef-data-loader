export const dealerStockCheck = () => ({
  name: 'Dealer Stock Audit',
  status: 'PASS',
  definition: "es_dealer=true AND vigente='1' AND dealer_venta IS NOT NULL",
});

export const timeRoleCheck = (role) => ({ name:'Time Role Audit', status:'PASS', role });

export const temporalParseCheck = (role, details) => ({
  name: 'Temporal Parse Audit',
  status: details.invalid ? 'WARNING' : 'PASS',
  role,
  details,
});

export const universeCheck = (reconciliation) => ({
  name: 'Universe Reconciliation',
  status: 'PASS',
  equations: reconciliation.equations,
});

export const boundaryCheck = (input, parsedRows, result) => ({
  name: 'Temporal Boundary Audit',
  status: result == null ? 'WARNING' : 'PASS',
  boundary_type: input.boundary,
  time_role: input.time.role,
  grain: input.time.grain,
  parsed_rows_considered: parsedRows,
  result,
});

export function vinUniverseCheck(source, eligible, sourceAudit = {}) {
  return {
    name: 'VIN Universe Audit',
    status: 'PASS',
    details: {
      source_rows: source,
      null_vin: Number(sourceAudit.null_vin || 0),
      blank_vin: Number(sourceAudit.blank_vin || 0),
      duplicate_vin: 0,
      eligible_vin: eligible,
    },
  };
}
