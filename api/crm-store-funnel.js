import { getDb, handleApiError } from '../lib/weekly-projections/db.js';

function parseMonths(value) {
  const n = Number(value ?? 8);
  if (!Number.isInteger(n) || n < 3 || n > 12) {
    const error = new Error('months must be an integer between 3 and 12');
    error.statusCode = 400;
    throw error;
  }
  return n;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'GET required' });
    }

    const months = parseMonths(req.query?.months);
    const sql = getDb();

    const stores = await sql.query(`
      SELECT DISTINCT
        sm.sucursal_id::text AS sucursal_id,
        sm.nombre_canonico AS sucursal
      FROM public.sucursal_aliases sa
      JOIN public.sucursales_master sm ON sm.sucursal_id = sa.sucursal_id
      WHERE sa.fuente = 'CRM_Cidef_raw'
        AND sa.validated = true
        AND sm.tipo_canal = 'CIDEF'
        AND sm.vigente = true
      ORDER BY sm.nombre_canonico
    `);

    const rows = await sql.query(`
      WITH latest AS (
        SELECT DISTINCT ON (c."ID") c.*
        FROM public."CRM_Cidef_raw" c
        WHERE NULLIF(c."ID", '') IS NOT NULL
        ORDER BY c."ID", c.loaded_at DESC NULLS LAST, c.source_file DESC NULLS LAST
      ),
      parsed AS (
        SELECT
          l.*,
          CASE
            WHEN l."Creado el" ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN l."Creado el"::timestamp
            WHEN l."Creado el" ~ '^\\d{2}/\\d{2}/\\d{4}' THEN to_timestamp(l."Creado el", 'DD/MM/YYYY HH24:MI:SS')::timestamp
            ELSE NULL
          END AS created_at
        FROM latest l
      ),
      resolved AS (
        SELECT
          p.*,
          store.sucursal_id,
          store.sucursal
        FROM parsed p
        JOIN LATERAL (
          SELECT sm.sucursal_id, sm.nombre_canonico AS sucursal
          FROM public.sucursal_aliases sa
          JOIN public.sucursales_master sm ON sm.sucursal_id = sa.sucursal_id
          WHERE sa.fuente = 'CRM_Cidef_raw'
            AND sa.validated = true
            AND sa.valor_raw = p."Sucursal Asignada"
            AND sm.tipo_canal = 'CIDEF'
          ORDER BY sm.vigente DESC, sa.sucursal_alias_id
          LIMIT 1
        ) store ON true
        WHERE p.created_at >= date_trunc('month', CURRENT_DATE) - (($1::int - 1) * interval '1 month')
          AND p.created_at < date_trunc('month', CURRENT_DATE) + interval '1 month'
      )
      SELECT
        r.sucursal_id::text AS sucursal_id,
        r.sucursal,
        to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS leads,
        COUNT(*) FILTER (WHERE r."Estado" = 'Sin Gestion')::int AS sin_gestion,
        COUNT(*) FILTER (WHERE r."Estado" = 'En Gestion')::int AS en_gestion,
        COUNT(*) FILTER (WHERE r."Estado" = 'Oportunidad')::int AS oportunidad,
        COUNT(*) FILTER (WHERE r."Vendido" = 'Si')::int AS ganados,
        COUNT(*) FILTER (WHERE r."Estado" = 'Cerrado' AND COALESCE(r."Vendido", 'No') <> 'Si')::int AS perdidos,
        COUNT(*) FILTER (WHERE r."Estado" IN ('Sin Gestion','En Gestion','Oportunidad'))::int AS pipeline_abierto,
        COUNT(*) FILTER (WHERE NULLIF(r."Gestionado el", '') IS NOT NULL)::int AS con_gestion_registrada,
        ROUND(100.0 * COUNT(*) FILTER (WHERE r."Vendido" = 'Si') / NULLIF(COUNT(*), 0), 1)::float AS conversion_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE r."Vendido" = 'Si') /
          NULLIF(COUNT(*) FILTER (WHERE r."Estado" = 'Cerrado'), 0), 1)::float AS win_rate_closed_pct,
        (date_trunc('month', r.created_at) = date_trunc('month', CURRENT_DATE)) AS partial_month
      FROM resolved r
      GROUP BY r.sucursal_id, r.sucursal, date_trunc('month', r.created_at)
      ORDER BY r.sucursal, date_trunc('month', r.created_at)
    `, [months]);

    const coverageRows = await sql.query(`
      WITH latest AS (
        SELECT DISTINCT ON (c."ID") c.*
        FROM public."CRM_Cidef_raw" c
        WHERE NULLIF(c."ID", '') IS NOT NULL
        ORDER BY c."ID", c.loaded_at DESC NULLS LAST, c.source_file DESC NULLS LAST
      )
      SELECT
        COUNT(*)::int AS crm_ids,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM public.sucursal_aliases sa
          JOIN public.sucursales_master sm ON sm.sucursal_id = sa.sucursal_id
          WHERE sa.fuente = 'CRM_Cidef_raw'
            AND sa.validated = true
            AND sa.valor_raw = latest."Sucursal Asignada"
            AND sm.tipo_canal = 'CIDEF'
        ))::int AS cidef_store_resolved
      FROM latest
    `);

    const coverage = coverageRows[0] || { crm_ids: 0, cidef_store_resolved: 0 };

    return res.status(200).json({
      ok: true,
      version: '1.0',
      months,
      generated_at: new Date().toISOString(),
      stores,
      monthly: rows,
      coverage: {
        crm_ids: Number(coverage.crm_ids || 0),
        cidef_store_resolved: Number(coverage.cidef_store_resolved || 0),
      },
      semantics: {
        grain: 'distinct CRM opportunity ID, latest loaded snapshot',
        cohort: 'month of Creado el',
        ganados: 'Vendido = Si',
        perdidos: 'Estado = Cerrado and Vendido != Si',
        pipeline_abierto: 'current Estado in Sin Gestion, En Gestion, Oportunidad',
        caveat: 'Estado is the latest observed state. This v1 does not reconstruct historical state transitions.',
      },
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
