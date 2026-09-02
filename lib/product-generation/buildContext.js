import { customGptDb } from '../custom-gpt/db.js';
import { buildGenerationEvidenceQuery } from './evidenceQuery.js';
import { parseProductGenerationInput } from './input.js';
import { buildGenerationsQuery, buildVersionGenerationQuery } from './scopeQuery.js';
import { loadGenerationSummary, loadGenerationTableState } from './tableState.js';

function asNumber(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function normalizeSummary(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, asNumber(value)]));
}

function validate(summary) {
  const checks = {
    membership_covers_versions: summary.membership_rows === summary.version_count,
    resolved_requires_generation: summary.resolved_without_generation === 0,
    nonresolved_has_no_generation: summary.nonresolved_with_generation === 0,
    resolved_stays_inside_model: summary.cross_model_resolved === 0,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export async function buildProductGenerationContext(input = {}) {
  const scope = parseProductGenerationInput(input);
  const sql = customGptDb();
  const tableState = await loadGenerationTableState(sql);
  if (!tableState.ready) {
    return {
      scope,
      tableState,
      summary: null,
      generations: [],
      versions: [],
      evidence: [],
      validation: { ok: false, checks: { generation_tables_ready: false } },
      warnings: ['Generation MASTER schema is not initialized in the connected database'],
    };
  }

  const summary = normalizeSummary(await loadGenerationSummary(sql));
  const versionQuery = buildVersionGenerationQuery(scope);
  const generationQuery = buildGenerationsQuery(scope);
  const [versions, generations] = await Promise.all([
    sql.query(versionQuery.sql, versionQuery.params),
    sql.query(generationQuery.sql, generationQuery.params),
  ]);

  let evidence = [];
  if (scope.includeEvidence) {
    const evidenceQuery = buildGenerationEvidenceQuery(scope);
    evidence = await sql.query(evidenceQuery.sql, evidenceQuery.params);
  }

  const validation = validate(summary);
  const warnings = [];
  if (!validation.ok) warnings.push('Generation membership invariants do not reconcile');
  if (!summary.generation_count) warnings.push('No canonical GENERATION identities have been populated yet');

  return { scope, tableState, summary, generations, versions, evidence, validation, warnings };
}
