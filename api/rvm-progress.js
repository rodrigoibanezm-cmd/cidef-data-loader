import { neon } from '@neondatabase/serverless';

const EXPECTED_TOTAL = 512178;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

async function tableExists(sql, name) {
  const rows = await sql.query('SELECT to_regclass($1) AS name', [name]);
  return Boolean((rows.rows?.[0] ?? rows[0])?.name);
}

async function count(sql, table) {
  const rows = await sql.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
  return Number((rows.rows?.[0] ?? rows[0])?.count ?? 0);
}

async function status() {
  const sql = db();
  const hasProgress = await tableExists(sql, 'rvm_import_progress');
  const hasStaging = await tableExists(sql, 'rvm_raw__loading');
  const hasFinal = await tableExists(sql, 'rvm_raw');

  let rowsLoaded = 0;
  let files = [];
  let complete = false;

  if (hasProgress) {
    const result = await sql.query('SELECT file_name, last_row, done, rows_loaded FROM rvm_import_progress ORDER BY file_name');
    files = result.rows ?? result;
  }

  if (hasStaging) rowsLoaded = await count(sql, 'rvm_raw__loading');
  else if (hasFinal) {
    rowsLoaded = await count(sql, 'rvm_raw');
    complete = rowsLoaded >= EXPECTED_TOTAL;
  }

  const percent = Math.min(100, Math.round((rowsLoaded / EXPECTED_TOTAL) * 1000) / 10);
  return { rowsLoaded, expectedTotal: EXPECTED_TOTAL, percent, complete, files };
}

export default async function handler(req, res) {
  try {
    const s = await status();
    if (req.query?.json === '1') return res.status(200).json(s);

    const rows = s.files.map((f) => `<tr><td>${f.file_name}</td><td>${Number(f.rows_loaded).toLocaleString('es-CL')}</td><td>${f.done ? 'Listo' : 'Procesando'}</td></tr>`).join('');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="15"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RVM Progress</title>
<style>body{font-family:Arial,sans-serif;max-width:760px;margin:50px auto;padding:0 20px;color:#222}.bar{height:30px;background:#eee;border-radius:8px;overflow:hidden}.fill{height:100%;width:${s.percent}%;background:#222;transition:width .4s}.n{font-size:34px;font-weight:700;margin:18px 0 6px}.muted{color:#666}table{width:100%;border-collapse:collapse;margin-top:28px}td,th{padding:10px 6px;border-bottom:1px solid #ddd;text-align:left}</style></head>
<body><h1>Import RVM</h1><div class="bar"><div class="fill"></div></div><div class="n">${s.percent}%</div><div class="muted">${s.rowsLoaded.toLocaleString('es-CL')} / ${s.expectedTotal.toLocaleString('es-CL')} registros</div>
<table><thead><tr><th>Archivo</th><th>Filas</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table><p class="muted">Actualiza automáticamente cada 15 segundos.</p></body></html>`);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
