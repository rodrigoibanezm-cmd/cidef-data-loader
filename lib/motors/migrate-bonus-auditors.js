import { neon } from '@neondatabase/serverless';

export async function run() {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS bonus_auditors (
      id text PRIMARY KEY,
      name text NOT NULL,
      tenant_id text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await sql.query(`
    INSERT INTO bonus_auditors (id, name, tenant_id)
    VALUES
      ('auditor-1', 'Auditor 1', 'bonus-auditors'),
      ('auditor-2', 'Auditor 2', 'bonus-auditors'),
      ('auditor-3', 'Auditor 3', 'bonus-auditors')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      tenant_id = EXCLUDED.tenant_id,
      active = true,
      updated_at = now()
  `);

  const checks = await sql.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bonus_auditors'
      ) AS auditors_table,
      (SELECT count(*)::int FROM bonus_auditors WHERE active = true) AS active_auditors
  `);

  return {
    migration: 'bonus_auditors_v1',
    idempotent: true,
    checks: checks[0],
  };
}
