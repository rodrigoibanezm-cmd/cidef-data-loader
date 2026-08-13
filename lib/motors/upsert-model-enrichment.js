import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function normalizeRow(row) {
  const modelKey = Number(row?.model_key);
  const largo = row?.largo_mm == null ? null : Number(row.largo_mm);
  const cc = row?.cilindrada_cc == null ? null : Number(row.cilindrada_cc);

  if (!Number.isInteger(modelKey) || modelKey <= 0) throw new Error('Invalid model_key');
  if (largo != null && (!Number.isInteger(largo) || largo < 2000 || largo > 8000)) throw new Error(`Invalid largo_mm for model_key ${modelKey}`);
  if (cc != null && (!Number.isInteger(cc) || cc < 0 || cc > 10000)) throw new Error(`Invalid cilindrada_cc for model_key ${modelKey}`);

  return { modelKey, largo, cc };
}

function rangoMotor(cc) {
  if (cc == null || cc === 0) return 'PENDIENTE';
  if (cc < 1500) return 'LT_1_5';
  if (cc <= 2500) return '1_5_TO_2_5';
  return 'GT_2_5';
}

export async function run(input = {}) {
  const rows = Array.isArray(input.rows) ? input.rows.map(normalizeRow) : [];
  if (!rows.length) throw new Error('input.rows must contain at least one model');
  if (rows.length > 500) throw new Error('Maximum 500 rows per call');

  const sql = db();
  await sql.query(`
    ALTER TABLE vehicle_models_master
      ADD COLUMN IF NOT EXISTS largo_mm integer,
      ADD COLUMN IF NOT EXISTS cilindrada_cc integer,
      ADD COLUMN IF NOT EXISTS rango_motor text
  `);

  const updated = [];
  for (const row of rows) {
    const [result] = await sql.query(`
      UPDATE vehicle_models_master
      SET largo_mm = COALESCE($2::int, largo_mm),
          cilindrada_cc = COALESCE($3::int, cilindrada_cc),
          rango_motor = CASE
            WHEN $3::int IS NOT NULL THEN $4::text
            ELSE COALESCE(rango_motor, 'PENDIENTE')
          END
      WHERE model_key = $1::bigint
      RETURNING model_key, largo_mm, cilindrada_cc, rango_motor
    `, [row.modelKey, row.largo, row.cc, rangoMotor(row.cc)]);

    if (!result) throw new Error(`model_key not found: ${row.modelKey}`);
    updated.push(result);
  }

  return { updated_models: updated.length, rows: updated };
}
