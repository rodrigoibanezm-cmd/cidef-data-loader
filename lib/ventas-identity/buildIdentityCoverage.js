import { customGptDb } from '../custom-gpt/db.js';
import { assembleIdentityCoverage } from './assembleIdentityCoverage.js';
import { IDENTITY_COVERAGE_SQL } from './identityCoverageSql.js';

export async function buildIdentityCoverage(sql = customGptDb()) {
  const rows = await sql.query(IDENTITY_COVERAGE_SQL);
  if (!rows?.length) throw new Error('ventas identity coverage query returned no rows');
  return assembleIdentityCoverage(rows[0]);
}
