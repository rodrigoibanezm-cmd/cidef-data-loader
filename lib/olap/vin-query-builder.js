import { VIN_CUBE } from './vin-cube-registry.js';

const QI = (v) => `"${String(v).replace(/"/g, '""')}"`;

export function sourceColumns() {
  const cols = new Set([VIN_CUBE.fact.key, ...Object.values(VIN_CUBE.timeRoles)]);
  for (const d of Object.values(VIN_CUBE.dimensions)) {
    cols.add(d.column); if (d.fallbackColumn) cols.add(d.fallbackColumn);
  }
  return [...cols];
}

export function buildSourceQuery() {
  return `SELECT ${sourceColumns().map(QI).join(', ')} FROM ${QI(VIN_CUBE.source)}`;
}

export function buildDealerMasterQuery() {
  return `SELECT dealer, dealer_id FROM dealers_master WHERE activo IS TRUE AND tipo = 'DEALER'`;
}
