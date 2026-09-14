import { getDb, handleApiError, parsePositiveBigInt } from '../lib/weekly-projections/db.js';

function round1(value) {
  return value == null ? null : Math.round(Number(value) * 10) / 10;
}

function trendTone(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length < 2) return 'neutral';
  const delta = valid.at(-1) - valid[0];
  if (delta > 0.05) return 'positive';
  if (delta < -0.05) return 'critical';
  return 'warning';
}

function trendDescription(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length < 2) return 'Sin tendencia comparable';
  const delta = valid.at(-1) - valid[0];
  if (delta > 0.05) return 'Share subiendo en los últimos 6 meses';
  if (delta < -0.05) return 'Share bajando en los últimos 6 meses';
  return 'Share estable en los últimos 6 meses';
}

async function loadRvmShareTrend(sql, company) {
  const rvmCutoff = company?.payload?.cards?.rvm?.cutoff || company.snapshot_date;
  const currentMonth = String(rvmCutoff || company.period_month).slice(0, 7);
  const rows = await sql.query(`
    WITH months AS (
      SELECT to_char(m, 'YYYY-MM') AS month,
             m::date AS month_start,
             (m + interval '1 month - 1 day')::date AS month_end
      FROM generate_series(
        date_trunc('month', $1::date) - interval '5 months',
        date_trunc('month', $1::date),
        interval '1 month'
      ) m
    ), current_snapshot AS (
      SELECT max(snapshot_date)::date AS snapshot_date
      FROM public.rvm_raw
      WHERE data_status='PRELIMINARY'
        AND snapshot_date <= $1::date
        AND fecha >= date_trunc('month', $1::date)
        AND fecha <= $1::date
    ), aggregated AS (
      SELECT
        m.month,
        coalesce(sum(r.cantidad),0)::numeric AS market_units,
        coalesce(sum(r.cantidad) FILTER (WHERE master_norm(r.marca)=master_norm('DFM')),0)::numeric AS cidef_units
      FROM months m
      LEFT JOIN public.rvm_raw r ON r.fecha BETWEEN m.month_start AND
        CASE WHEN m.month=$2 THEN $1::date ELSE m.month_end END
       AND (
         (m.month=$2 AND r.data_status='PRELIMINARY' AND r.snapshot_date=(SELECT snapshot_date FROM current_snapshot))
         OR
         (m.month<>$2 AND r.data_status='CONSOLIDATED')
       )
      GROUP BY m.month
      ORDER BY m.month
    )
    SELECT month,
           market_units::float AS market_units,
           cidef_units::float AS cidef_units,
           CASE WHEN market_units>0 THEN round((100.0*cidef_units/market_units)::numeric, 2)::float ELSE NULL END AS share_pct
    FROM aggregated
    ORDER BY month
  `, [rvmCutoff, currentMonth]);
  const usable = rows.filter((row) => row.share_pct != null);
  const periods = usable.map((row) => row.month);
  const values = usable.map((row) => round1(row.share_pct));
  return {
    trend: values,
    trend_periods: periods,
    trend_tone: trendTone(values),
    trend_description: trendDescription(values),
  };
}

function attachRvmTrend(payload, trend) {
  if (!payload?.cards?.rvm) return payload;
  return {
    ...payload,
    cards: {
      ...payload.cards,
      rvm: { ...payload.cards.rvm, ...trend },
    },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'GET required' });
    }
    const sql = getDb();
    const requestedStore = req.query?.sucursal_id
      ? parsePositiveBigInt(req.query.sucursal_id, 'sucursal_id') : null;
    const companyRows = await sql.query(`
      SELECT snapshot_id::text AS snapshot_id, period_month::text AS period_month,
             snapshot_date::text AS snapshot_date, generated_at, contract_version, payload
      FROM public.dashboard_company_snapshot_v01
      WHERE published = true
      ORDER BY generated_at DESC, snapshot_id DESC
      LIMIT 1
    `);
    if (!companyRows.length) {
      return res.status(503).json({ ok: false, error: 'DASHBOARD_SNAPSHOT_NOT_AVAILABLE' });
    }
    const company = companyRows[0];
    const [stores, signals, rvmTrend] = await Promise.all([
      sql.query(`
        SELECT dss.sucursal_id::text AS sucursal_id, sm.nombre_canonico AS sucursal, dss.payload
        FROM public.dashboard_store_snapshot_v01 dss
        JOIN public.sucursales_master sm ON sm.sucursal_id = dss.sucursal_id
        WHERE dss.snapshot_id = $1::bigint
          AND ($2::bigint IS NULL OR dss.sucursal_id = $2::bigint)
        ORDER BY sm.nombre_canonico
      `, [company.snapshot_id, requestedStore]),
      sql.query(`
        SELECT signal_id::text AS signal_id, scope_type, scope_id::text AS scope_id,
               signal_type, priority, tone, title, summary,
               impact_value::float AS impact_value, impact_unit, domains,
               evidence_as_of::text AS evidence_as_of, evidence
        FROM public.dashboard_signal_v01
        WHERE snapshot_id = $1::bigint
          AND (scope_type = 'COMPANY' OR ($2::bigint IS NOT NULL AND scope_id = $2::bigint))
        ORDER BY signal_type, priority, signal_id
      `, [company.snapshot_id, requestedStore]),
      loadRvmShareTrend(sql, company),
    ]);
    const companyPayload = attachRvmTrend(company.payload, rvmTrend);
    const storesWithTrend = stores.map((row) => ({ ...row, payload: attachRvmTrend(row.payload, rvmTrend) }));
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      contract_version: company.contract_version,
      snapshot_id: company.snapshot_id,
      period_month: company.period_month,
      snapshot_date: company.snapshot_date,
      generated_at: company.generated_at,
      company: companyPayload,
      stores: storesWithTrend,
      signals,
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
