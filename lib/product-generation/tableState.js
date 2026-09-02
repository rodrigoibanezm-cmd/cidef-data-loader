export const GENERATION_TABLES = Object.freeze([
  'generaciones_master_v01',
  'version_generation_v01',
  'generation_evidence_v01',
]);

export async function loadGenerationTableState(sql) {
  const rows = await sql.query(
    `SELECT
       to_regclass('public.generaciones_master_v01')::text AS generations,
       to_regclass('public.version_generation_v01')::text AS memberships,
       to_regclass('public.generation_evidence_v01')::text AS evidence`,
  );
  const row = rows[0] ?? {};
  return {
    ready: Boolean(row.generations && row.memberships && row.evidence),
    tables: {
      generaciones_master_v01: Boolean(row.generations),
      version_generation_v01: Boolean(row.memberships),
      generation_evidence_v01: Boolean(row.evidence),
    },
  };
}

export async function loadGenerationSummary(sql) {
  const rows = await sql.query(`
    SELECT
      (SELECT count(*)::bigint FROM versiones_master_v01) AS version_count,
      (SELECT count(*)::bigint FROM generaciones_master_v01) AS generation_count,
      count(*)::bigint AS membership_rows,
      count(*) FILTER (WHERE vg.status='RESOLVED')::bigint AS resolved,
      count(*) FILTER (WHERE vg.status='UNRESOLVED')::bigint AS unresolved,
      count(*) FILTER (WHERE vg.status='CONFLICT')::bigint AS conflict,
      count(*) FILTER (WHERE vg.status='RESOLVED' AND vg.generation_id IS NULL)::bigint
        AS resolved_without_generation,
      count(*) FILTER (WHERE vg.status<>'RESOLVED' AND vg.generation_id IS NOT NULL)::bigint
        AS nonresolved_with_generation,
      count(*) FILTER (
        WHERE vg.status='RESOLVED' AND v.modelo_id IS DISTINCT FROM g.model_id
      )::bigint AS cross_model_resolved
    FROM version_generation_v01 vg
    JOIN versiones_master_v01 v ON v.version_id=vg.version_id
    LEFT JOIN generaciones_master_v01 g ON g.generation_id=vg.generation_id
  `);
  return rows[0] ?? {};
}
