import { VIN_CUBE } from '../../vin-cube-registry.js';
import { auditVinUniverse } from '../../vin-auditors.js';
import { normalizeVin } from '../../vin-normalizers.js';
import { dealerIndex } from '../../semantics/dimensions.js';
import { applyUniverse } from '../../semantics/universes.js';
import { dealerStockCheck } from '../../output/audit-checks.js';
import { failResult } from '../../output/result-envelope.js';

export function preparePureContext(input, sourceRows, dealerRows) {
  const vinAudit = auditVinUniverse(sourceRows, (row) => row[VIN_CUBE.fact.key]);
  if (vinAudit.status === 'FAIL') {
    return { error:failResult('VIN_GRAIN_VIOLATION', 'duplicate VIN detected', input) };
  }
  const eligible = sourceRows.filter((row) => normalizeVin(row[VIN_CUBE.fact.key]).normalized);
  const universe = applyUniverse(eligible, input.universe);
  const checks = [{ name:'VIN Universe Audit', status:'PASS', details:vinAudit }];
  if (input.universe.type === 'DEALER_STOCK') checks.push(dealerStockCheck());
  return {
    sourceRows,
    eligible,
    universe,
    dealers:dealerIndex(dealerRows),
    checks,
  };
}
