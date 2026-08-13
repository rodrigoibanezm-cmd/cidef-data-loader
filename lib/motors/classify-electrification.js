import { rvmDb } from '../rvm-db.js';

export const ELECTRIFICATION_VALUES = ['ICE', 'HEV', 'PHEV', 'BEV', 'PENDIENTE'];

export async function run() {
  const sql = rvmDb();
  await sql.query(`UPDATE vehicle_versions_master SET electrificacion=CASE
    WHEN combustible='ELECTRICIDAD' THEN 'BEV'
    WHEN combustible IN ('GASOLINA','DIESEL','GLP') THEN 'ICE'
    WHEN combustible='DUAL GASOLINA ELECTRICO' AND UPPER(version_name) LIKE '%PHEV%' THEN 'PHEV'
    WHEN combustible='DUAL GASOLINA ELECTRICO' AND (UPPER(version_name) LIKE '%HEV%'
      OR UPPER(version_name) LIKE '%HYBRID%' OR UPPER(version_name) LIKE '%HIBRID%') THEN 'HEV'
    ELSE 'PENDIENTE' END`);
  await sql.query(`UPDATE vehicle_versions_master SET electrificacion=CASE
    WHEN UPPER(version_name) LIKE '%PHEV%' OR UPPER(version_name) LIKE '%DM-I%'
      OR UPPER(version_name) LIKE '%DM I%' THEN 'PHEV'
    WHEN UPPER(version_name) LIKE '%HEV%' OR UPPER(version_name) LIKE '%HYBRID%'
      OR UPPER(version_name) LIKE '%HIBRID%' OR UPPER(version_name) LIKE '%E-POWER%' THEN 'HEV'
    WHEN UPPER(version_name) LIKE '%EV%' OR UPPER(version_name) LIKE '%ELECTRIC%' THEN 'BEV'
    ELSE electrificacion END WHERE electrificacion='PENDIENTE'`);
  const rows = await sql.query(`SELECT electrificacion, COUNT(*)::int AS count
    FROM vehicle_versions_master GROUP BY electrificacion`);
  const result = Object.fromEntries(ELECTRIFICATION_VALUES.map(value => [value, 0]));
  for (const row of rows) result[row.electrificacion] = Number(row.count);
  return result;
}
