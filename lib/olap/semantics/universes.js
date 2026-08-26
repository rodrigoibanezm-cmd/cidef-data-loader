import { VIN_CUBE } from '../vin-cube-registry.js';
import { normalizeText } from '../vin-normalizers.js';
import { parseSourceDate, timeRoleSql } from './time.js';

export const DEALER_STOCK_DEFINITION =
  "es_dealer=true AND vigente='1' AND dealer_venta IS NOT NULL";

export function applyUniverse(rows, universe) {
  if (universe.type === 'DEALER_STOCK') {
    return rows.filter((row) =>
      row.es_dealer === true
      && String(row.vigente ?? '') === '1'
      && normalizeText(row.dealer_venta));
  }
  if (universe.type === 'EVENT_POPULATION') {
    const column = VIN_CUBE.timeRoles[universe.event];
    return rows.filter((row) => parseSourceDate(row[column]).status === 'parsed');
  }
  return rows;
}

export function universeSqlParts(universe) {
  if (universe.type === 'DEALER_STOCK') {
    return [
      'i.es_dealer IS TRUE',
      "i.vigente::text = '1'",
      "NULLIF(TRIM(i.dealer_venta::text),'') IS NOT NULL",
    ];
  }
  if (universe.type === 'EVENT_POPULATION') {
    return [`${timeRoleSql(universe.event)} IS NOT NULL`];
  }
  return [];
}
