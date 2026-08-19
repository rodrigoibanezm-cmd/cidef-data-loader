import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

const CUBES = {
  rvm: {
    table: 'rvm_raw',
    dateExpr: 'fecha',
    measureExpr: 'COALESCE(cantidad, 1)',
    dimensions: {
      region: 'region_propietario',
      comuna: 'comuna_adquisicion',
      tipo: 'tipo',
      segmento: 'descripcion_segmento',
      marca: 'marca',
      modelo: 'modelo_homologado',
      version: 'modeo_version',
      combustible: 'combustible',
      ano_fabricacion: 'ano_fabricacion',
      pais_vin: 'pais_vin',
      preinscrito: 'preinscrito',
      prenda: 'prenda'
    }
  },
  inventario: {
    table: 'inventario_vehiculos_global_raw',
    dateExpr: `CASE
      WHEN fecha_factura ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(fecha_factura, 10)::date
      WHEN fecha_nv ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(fecha_nv, 10)::date
      WHEN fecha_ingreso_stk ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(fecha_ingreso_stk, 10)::date
      ELSE NULL
    END`,
    measureExpr: '1',
    dimensions: {
      marca: 'marca',
      modelo: 'desc_abrev',
      ano: 'ano',
      ano_fabricacion: 'ano_fabricacion',
      etapa: 'etapa',
      bodega: 'bodega',
      vigente: 'vigente',
      vendedor: 'vendedor',
      sucursal: 'sucursal_venta',
      dealer: 'dealer_nombre',
      dealer_rut: 'dealer_rut',
      es_dealer: 'es_dealer',
      dealer_venta: 'dealer_venta',
      tipo_motor: 'tipo_motor',
      tipo_ficha: 'tipo_ficha',
      norma: 'norma',
      en_patio: 'en_patio',
      reservado: 'esta_reservado',
      en_transito: 'esta_en_transito',
      pendiente_entrega: 'pendiente_entrega'
    }
  }
};

function normalizeCube(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!CUBES[key]) throw new Error(`cube must be one of: ${Object.keys(CUBES).join(', ')}`);
  return key;
}

function normalizePeriod(value) {
  const period = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('period must be YYYY-MM');
  return period;
}

function buildFilters(cube, filters = {}, startIndex = 1) {
  const cfg = CUBES[cube];
  const clauses = [];
  const params = [];
  let idx = startIndex;

  for (const [key, rawValue] of Object.entries(filters || {})) {
    const column = cfg.dimensions[key];
    if (!column) throw new Error(`Invalid dimension for ${cube}: ${key}`);
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const cleaned = values.filter(v => v !== undefined && v !== null && String(v).trim() !== '');
    if (!cleaned.length) continue;

    if (cleaned.length === 1) {
      clauses.push(`${column}::text = $${idx}`);
      params.push(String(cleaned[0]));
      idx += 1;
    } else {
      const placeholders = cleaned.map(() => `$${idx++}`);
      clauses.push(`${column}::text IN (${placeholders.join(', ')})`);
      params.push(...cleaned.map(String));
    }
  }

  return { clauses, params, nextIndex: idx };
}

function stats(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return { n: 0, min: null, p25: null, median: null, p75: null, max: null, mean: null };

  const quantile = q => {
    const pos = (nums.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return nums[base + 1] === undefined ? nums[base] : nums[base] + rest * (nums[base + 1] - nums[base]);
  };

  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return {
    n: nums.length,
    min: nums[0],
    p25: Number(quantile(0.25).toFixed(4)),
    median: Number(quantile(0.5).toFixed(4)),
    p75: Number(quantile(0.75).toFixed(4)),
    max: nums[nums.length - 1],
    mean: Number(mean.toFixed(4))
  };
}

function average(rows, count) {
  const vals = rows.slice(-count).map(r => Number(r.value)).filter(Number.isFinite);
  if (!vals.length) return null;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4));
}

function trend(rows) {
  const vals = rows.slice(-6).map(r => Number(r.value)).filter(Number.isFinite);
  if (vals.length < 3) return { direction: 'insufficient_data', slope: null };
  const n = vals.length;
  const xMean = (n - 1) / 2;
  const yMean = vals.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (vals[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den ? num / den : 0;
  const threshold = Math.max(Math.abs(yMean) * 0.02, 0.1);
  return {
    direction: slope > threshold ? 'up' : slope < -threshold ? 'down' : 'flat',
    slope: Number(slope.toFixed(4))
  };
}

export async function run(input = {}) {
  const cube = normalizeCube(input.cube);
  const period = normalizePeriod(input.period);
  const filters = input.filters || input.dimensions || {};
  const cfg = CUBES[cube];
  const sql = db();

  const built = buildFilters(cube, filters, 2);
  const whereFilters = built.clauses.length ? `AND ${built.clauses.join(' AND ')}` : '';
  const dateExpr = cfg.dateExpr;
  const measureExpr = cfg.measureExpr;

  const currentRows = await sql.query(`
    SELECT COALESCE(SUM(${measureExpr}), 0)::numeric AS value
    FROM ${cfg.table}
    WHERE to_char(${dateExpr}, 'YYYY-MM') = $1
      ${whereFilters}
  `, [period, ...built.params]);

  const history = await sql.query(`
    SELECT to_char(${dateExpr}, 'YYYY-MM') AS period,
           COALESCE(SUM(${measureExpr}), 0)::numeric AS value
    FROM ${cfg.table}
    WHERE ${dateExpr} IS NOT NULL
      AND ${dateExpr} < ($1 || '-01')::date + interval '1 month'
      AND ${dateExpr} >= ($1 || '-01')::date - interval '24 months'
      ${whereFilters}
    GROUP BY 1
    ORDER BY 1
  `, [period, ...built.params]);

  const currentValue = Number(currentRows?.[0]?.value || 0);
  const histBeforeCurrent = history.filter(r => r.period < period);
  const priorYearPeriod = `${Number(period.slice(0, 4)) - 1}-${period.slice(5, 7)}`;
  const priorYear = history.find(r => r.period === priorYearPeriod);
  const previous = histBeforeCurrent.at(-1);
  const distribution = stats(histBeforeCurrent.map(r => r.value));
  const avg3 = average(histBeforeCurrent, 3);
  const avg12 = average(histBeforeCurrent, 12);
  const t = trend(histBeforeCurrent);

  return {
    cube,
    focus: {
      period,
      filters
    },
    measure: {
      name: 'units',
      value: currentValue
    },
    context: {
      self_history: {
        previous_period: previous ? { period: previous.period, value: Number(previous.value) } : null,
        same_period_last_year: priorYear ? { period: priorYear.period, value: Number(priorYear.value) } : null,
        avg_3m: avg3,
        avg_12m: avg12,
        delta_vs_avg_3m_pct: avg3 ? Number((((currentValue / avg3) - 1) * 100).toFixed(2)) : null,
        delta_vs_avg_12m_pct: avg12 ? Number((((currentValue / avg12) - 1) * 100).toFixed(2)) : null,
        delta_yoy_pct: priorYear && Number(priorYear.value) !== 0
          ? Number((((currentValue / Number(priorYear.value)) - 1) * 100).toFixed(2))
          : null,
        trend_6m: t
      },
      distribution,
      history: history.map(r => ({ period: r.period, value: Number(r.value) }))
    },
    meta: {
      generated_on_demand: true,
      history_window_months: 24,
      allowed_dimensions: Object.keys(cfg.dimensions)
    }
  };
}
