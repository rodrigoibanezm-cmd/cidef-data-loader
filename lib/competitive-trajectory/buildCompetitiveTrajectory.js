import { customGptDb } from '../custom-gpt/db.js';
import { buildCompetitiveContext } from '../competitive/buildCompetitiveContext.js';
import { parseCompetitiveInput } from '../competitive/competitiveInput.js';
import { assembleMonthlyRows } from './assembleMonthlyRows.js';
import { summarizeTrajectory } from './summarizeTrajectory.js';
import { buildTrajectoryQuery } from './trajectoryQuery.js';

function monthlySharesReconcile(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.month}|${row.universeKey}`;
    if (!groups.has(key)) groups.set(key, { totalUnits: row.totalUnits, share: 0 });
    if (row.share != null) groups.get(key).share += row.share;
  }
  return [...groups.values()].every((group) => group.totalUnits === 0
    || Math.abs(group.share - 1) < 1e-9);
}

function peerUniverses(baseContext) {
  return baseContext.universes.map((row) => ({
    key: row.key,
    targetModelIds: row.targetModelIds,
    totalUnits: row.totalUnits,
    totalModels: row.totalModels,
    totalBrands: row.totalBrands,
    marketOriginCoverage: row.marketOriginCoverage,
  }));
}

export async function buildCompetitiveTrajectory(input = {}) {
  const scope = parseCompetitiveInput(input);
  const baseContext = await buildCompetitiveContext(input);
  const sql = customGptDb();
  const query = buildTrajectoryQuery(scope);
  const rawRows = await sql.query(query.sql, query.params);
  const monthly = assembleMonthlyRows(scope, rawRows);
  const trajectory = summarizeTrajectory(monthly.rows);
  const warnings = [...baseContext.warnings];
  if (!rawRows.length) warnings.push('NO_TRAJECTORY_ROWS');
  if (scope.originGroup && !monthly.rows.length) warnings.push('NO_ROWS_IN_REQUESTED_ORIGIN_GROUP');
  const validation = {
    base_context_ok: baseContext.validation.ok,
    monthly_share_reconciles: monthlySharesReconcile(monthly.rows),
    months_returned: monthly.months.length,
    universes_returned: monthly.universeCount,
    raw_monthly_rows: rawRows.length,
    dense_monthly_rows: monthly.rows.length,
  };
  validation.ok = validation.base_context_ok && validation.monthly_share_reconciles;
  return {
    context: 'competitive_share_trajectory_v01',
    version: '0.2',
    scope: baseContext.scope,
    targets: baseContext.targets,
    peerUniverses: peerUniverses(baseContext),
    monthly: monthly.rows,
    trajectory,
    validation,
    warnings: [...new Set(warnings)],
  };
}
