import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function tableFor(universe) {
  if (universe === 'ALL') return 'market_penetration_monthly_all';
  if (universe === 'CHINA') return 'market_penetration_monthly_china';
  throw new Error('universe must be ALL or CHINA');
}

function monthExpr(offset) {
  return `to_char(($1::date ${offset}), 'YYYY-MM')`;
}

async function periodSummary(sql, table, segment, start, end) {
  return sql.query(`
    WITH base AS (
      SELECT marca,
        SUM(unidades_marca)::numeric AS unidades_marca,
        SUM(unidades_universo)::numeric AS unidades_universo,
        ROUND(100*SUM(unidades_marca)/NULLIF(SUM(unidades_universo),0),4) AS penetracion_pct
      FROM ${table}
      WHERE year_month BETWEEN $1 AND $2 AND segmento=$3
      GROUP BY marca
    )
    SELECT *,
      ROW_NUMBER() OVER (ORDER BY penetracion_pct DESC, unidades_marca DESC, marca) AS ranking
    FROM base
    ORDER BY ranking
  `, [start, end, segment]);
}

export async function run(input = {}) {
  const universe = String(input.universe || input.universe_origin || 'ALL').toUpperCase();
  const table = tableFor(universe);
  const focusBrands = Array.isArray(input.brands)
    ? input.brands.map(v => String(v).trim().toUpperCase()).filter(Boolean)
    : [];
  const segment = String(input.segment || 'TOTAL').toUpperCase();
  const months = Math.min(Math.max(Number(input.months) || 1, 1), 24);
  const comparison = String(input.comparison || 'none').toLowerCase();
  if (!['none','rolling','same_period_last_year'].includes(comparison)) throw new Error('Invalid comparison');

  const sql = db();
  const [latest] = await sql.query(`SELECT COALESCE($1::text, MAX(year_month)) AS ym FROM ${table}`, [input.end_month || null]);
  if (!latest?.ym) throw new Error(`${table} is empty`);
  const endDate = `${latest.ym}-01`;
  const rollingStartOffset = 2 * months - 1;

  const [bounds] = await sql.query(`SELECT
    ${monthExpr(`- interval '${months - 1} month'`)} AS current_start,
    to_char($1::date,'YYYY-MM') AS current_end,
    ${comparison === 'rolling'
      ? monthExpr(`- interval '${rollingStartOffset} month'`)
      : monthExpr(`- interval '1 year' - interval '${months - 1} month'`)} AS compare_start,
    ${comparison === 'rolling'
      ? monthExpr(`- interval '${months} month'`)
      : monthExpr(`- interval '1 year'`)} AS compare_end
  `, [endDate]);

  const series = await sql.query(`
    SELECT year_month, marca, segmento, unidades_marca, unidades_universo,
           penetracion_pct,
           ROW_NUMBER() OVER (
             PARTITION BY year_month
             ORDER BY penetracion_pct DESC, unidades_marca DESC, marca
           ) AS ranking
    FROM ${table}
    WHERE year_month BETWEEN $1 AND $2 AND segmento=$3
    ORDER BY year_month, ranking
  `, [bounds.current_start, bounds.current_end, segment]);

  const current = await periodSummary(sql, table, segment, bounds.current_start, bounds.current_end);
  const previous = comparison === 'none'
    ? []
    : await periodSummary(sql, table, segment, bounds.compare_start, bounds.compare_end);
  const prevMap = new Map(previous.map(r => [r.marca, r]));

  const summary = current.map(r => {
    const p = prevMap.get(r.marca);
    return {
      ...r,
      comparacion_penetracion_pct: p?.penetracion_pct ?? null,
      ranking_comparacion: p?.ranking ?? null,
      delta_ranking: p ? Number(p.ranking) - Number(r.ranking) : null,
      delta_pp: p ? Number((Number(r.penetracion_pct) - Number(p.penetracion_pct)).toFixed(4)) : null,
    };
  });

  return {
    universe,
    segment,
    months,
    comparison,
    periodo_actual: { desde: bounds.current_start, hasta: bounds.current_end },
    periodo_comparacion: comparison === 'none' ? null : { desde: bounds.compare_start, hasta: bounds.compare_end },
    focus_brands: focusBrands,
    summary,
    series,
  };
}
