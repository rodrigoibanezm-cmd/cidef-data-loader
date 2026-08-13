import { rvmDb } from '../rvm-db.js';
import { duplicateSql, QUALITY_CHECKS, qualitySql } from '../rvm-quality-query.js';

export async function run() {
  const sql = rvmDb();
  const [latest] = await sql.query(`SELECT
    to_char(date_trunc('month',MAX(fecha)),'YYYY-MM') AS period FROM rvm_raw`);
  if (!latest?.period) throw new Error('rvm_raw has no dated rows');
  const [raw] = await sql.query(qualitySql());
  const [active] = await sql.query(`SELECT COUNT(*)::int AS count FROM active_vehicle_models
    WHERE model_key IS NULL OR brand_id IS NULL`);
  const [duplicates] = await sql.query(duplicateSql());
  const [missingBrand] = await sql.query(`SELECT COUNT(*)::int AS count
    FROM vehicle_models_master WHERE brand_id IS NULL`);
  const checks = {
    ...raw, active_without_master: Number(active.count),
    relevant_duplicates: Number(duplicates.count), missing_brand_id: Number(missingBrand.count),
  };
  for (const key of QUALITY_CHECKS) checks[key] = Number(checks[key] || 0);
  const criticalKeys = ['unmapped_brands','unmapped_models','active_without_master','missing_brand_id'];
  const criticalIssues = criticalKeys.reduce((sum, key) => sum + checks[key], 0);
  const warnings = QUALITY_CHECKS.filter(key => !criticalKeys.includes(key))
    .reduce((sum, key) => sum + checks[key], 0);
  return { ok: criticalIssues + warnings === 0, period: latest.period,
    checks, critical_issues: criticalIssues, warnings };
}
