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
            WHEN trim(l."Creado el") ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN trim(l."Creado el")::timestamp
            WHEN trim(l."Creado el") ~ '^\\d{2}/\\d{2}/\\d{4}' THEN to_timestamp(trim(l."Creado el"), 'DD/MM/YYYY HH24:MI:SS')::timestamp
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
        COUNT(*) FILTER (WHERE r."Estado" = 'Cerrado')::int AS cerrados,
        COUNT(*) FILTER (WHERE r."Estado" IN ('En Gestion','Oportunidad','Cerrado'))::int AS gestionados,
        COUNT(*) FILTER (WHERE r."Vendido" = 'Si')::int AS ganados,
        COUNT(*) FILTER (WHERE r."Estado" = 'Cerrado' AND COALESCE(r."Vendido", 'No') <> 'Si')::int AS perdidos,
        COUNT(*) FILTER (WHERE r."Estado" IN ('Sin Gestion','En Gestion','Oportunidad'))::int AS pipeline_abierto,
        COUNT(*) FILTER (WHERE r."Grado de Interes" = '1 - Sin Contactar')::int AS interes_sin_contactar,
        COUNT(*) FILTER (WHERE r."Grado de Interes" = '2 - Indeciso')::int AS interes_indeciso,
        COUNT(*) FILTER (WHERE r."Grado de Interes" = '3 - Interesado')::int AS interes_interesado,
        COUNT(*) FILTER (WHERE r."Grado de Interes" = '4 - Listo para comprar')::int AS interes_listo,
        COUNT(*) FILTER (WHERE r."Grado de Interes" = 'FILTRADO POR CPC')::int AS interes_filtrado_cpc,
        COUNT(*) FILTER (WHERE r."Grado de Interes" = 'Pendiente informacion')::int AS interes_pendiente_info,
        COUNT(*) FILTER (WHERE NULLIF(r."Grado de Interes", '') IS NULL)::int AS interes_sin_grado,
        ROUND(100.0 * COUNT(*) FILTER (WHERE r."Estado" IN ('En Gestion','Oportunidad','Cerrado')) / NULLIF(COUNT(*), 0), 1)::float AS gestion_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE r."Estado" = 'Oportunidad') / NULLIF(COUNT(*), 0), 1)::float AS oportunidad_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE r."Vendido" = 'Si') / NULLIF(COUNT(*), 0), 1)::float AS conversion_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE r."Vendido" = 'Si') /
          NULLIF(COUNT(*) FILTER (WHERE r."Estado" = 'Cerrado'), 0), 1)::float AS win_rate_closed_pct,
        (date_trunc('month', r.created_at) = date_trunc('month', CURRENT_DATE)) AS partial_month
      FROM resolved r
      GROUP BY r.sucursal_id, r.sucursal, date_trunc('month', r.created_at)
      ORDER BY r.sucursal, date_trunc('month', r.created_at)
    `, [months]);

    const sellers = await sql.query(`
      WITH latest AS (
        SELECT DISTINCT ON (c."ID") c.*
        FROM public."CRM_Cidef_raw" c
        WHERE NULLIF(c."ID", '') IS NOT NULL
        ORDER BY c."ID", c.loaded_at DESC NULLS LAST, c.source_file DESC NULLS LAST
      ),
      parsed AS (
        SELECT l.*,
          CASE
            WHEN trim(l."Creado el") ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN trim(l."Creado el")::timestamp
            WHEN trim(l."Creado el") ~ '^\\d{2}/\\d{2}/\\d{4}' THEN to_timestamp(trim(l."Creado el"), 'DD/MM/YYYY HH24:MI:SS')::timestamp
            ELSE NULL
          END AS created_at
        FROM latest l
      ),
      resolved AS (
        SELECT p.*, store.sucursal_id, store.sucursal
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
        sucursal_id::text AS sucursal_id,
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COALESCE(NULLIF("Asignado a", ''), 'Sin vendedor identificado') AS vendedor,
        COUNT(*)::int AS leads,
        COUNT(*) FILTER (WHERE "Estado" = 'Sin Gestion')::int AS sin_gestion,
        COUNT(*) FILTER (WHERE "Grado de Interes" = '1 - Sin Contactar')::int AS sin_contactar,
        COUNT(*) FILTER (WHERE "Grado de Interes" = '2 - Indeciso')::int AS indeciso,
        COUNT(*) FILTER (WHERE "Grado de Interes" = '3 - Interesado')::int AS interesado,
        COUNT(*) FILTER (WHERE "Grado de Interes" = '4 - Listo para comprar')::int AS listo,
        COUNT(*) FILTER (WHERE "Estado" = 'Oportunidad')::int AS oportunidades,
        COUNT(*) FILTER (WHERE "Vendido" = 'Si')::int AS ganados
      FROM resolved
      GROUP BY sucursal_id, date_trunc('month', created_at), COALESCE(NULLIF("Asignado a", ''), 'Sin vendedor identificado')
      ORDER BY sucursal_id, date_trunc('month', created_at), leads DESC
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
    const currentMonth = new Date().toISOString().slice(0, 7);
    const latestAvailableMonth = rows.reduce((max, r) => !max || r.month > max ? r.month : max, null);

    return res.status(200).json({
      ok: true,
      version: '1.1',
      months,
      generated_at: new Date().toISOString(),
      current_month: currentMonth,
      latest_available_month: latestAvailableMonth,
      stores,
      monthly: rows,
      seller_monthly: sellers,
      coverage: {
        crm_ids: Number(coverage.crm_ids || 0),
        cidef_store_resolved: Number(coverage.cidef_store_resolved || 0),
      },
      semantics: {
        grain: 'distinct CRM opportunity ID, latest loaded snapshot',
        cohort: 'month of Creado el',
        gestionados: 'current Estado in En Gestion, Oportunidad, Cerrado',
        quality: 'current Grado de Interes buckets; categories are mutually exclusive current labels, not sequential funnel stages',
        ganados: 'Vendido = Si',
        caveat: 'Latest observed snapshot only. Historical transitions between Estado or Grado de Interes are not reconstructed.',
      },
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
