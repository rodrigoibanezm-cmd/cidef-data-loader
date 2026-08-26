import { VIN_CUBE } from '../vin-cube-registry.js';

export const quoteIdentifier = (value) =>
  `"${String(value).replace(/"/g, '""')}"`;

export const normalizedTextSql = (expression) =>
  `NULLIF(UPPER(REGEXP_REPLACE(TRIM(${expression}::text), '\\s+', ' ', 'g')), '')`;

export const booleanSql = (expression) =>
  `CASE WHEN LOWER(TRIM(${expression}::text)) IN ('1','true','t','yes','si','sí') THEN true WHEN LOWER(TRIM(${expression}::text)) IN ('0','false','f','no') THEN false ELSE NULL END`;

export function pushSqlValue(values, value) {
  values.push(value);
  return `$${values.length}`;
}

export function eligibleVinSql(alias = 'i') {
  return `NULLIF(TRIM(${alias}.${quoteIdentifier(VIN_CUBE.fact.key)}::text),'') IS NOT NULL`;
}
