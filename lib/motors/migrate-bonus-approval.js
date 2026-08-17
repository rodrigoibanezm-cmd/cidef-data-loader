import { neon } from '@neondatabase/serverless';

export async function run() {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  await sql.query(`
    ALTER TABLE bonus_requests
      ADD COLUMN IF NOT EXISTS approved_by_user_id text,
      ADD COLUMN IF NOT EXISTS approved_by_tenant_id text,
      ADD COLUMN IF NOT EXISTS approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS rejected_by_user_id text,
      ADD COLUMN IF NOT EXISTS rejected_by_tenant_id text,
      ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
      ADD COLUMN IF NOT EXISTS rejection_reason text,
      ADD COLUMN IF NOT EXISTS paid_at timestamptz
  `);

  await sql.query(`
    ALTER TABLE bonus_request_documents
      ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'PENDIENTE',
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id text,
      ADD COLUMN IF NOT EXISTS reviewed_by_tenant_id text,
      ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
      ADD COLUMN IF NOT EXISTS reviewed_extraction jsonb
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS bonus_request_events (
      id bigserial PRIMARY KEY,
      request_id text NOT NULL,
      document_type text,
      action text NOT NULL,
      actor_user_id text NOT NULL,
      actor_tenant_id text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await sql.query(`CREATE INDEX IF NOT EXISTS bonus_request_events_request_idx ON bonus_request_events (request_id, created_at)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS bonus_requests_queue_idx ON bonus_requests (estado, submitted_at)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS bonus_requests_tenant_history_idx ON bonus_requests (tenant_id, approved_at DESC)`);

  const checks = await sql.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bonus_request_events'
      ) AS events_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bonus_requests' AND column_name = 'approved_by_user_id'
      ) AS request_approval_columns,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bonus_request_documents' AND column_name = 'review_status'
      ) AS document_review_columns
  `);

  return {
    migration: 'bonus_approval_v1',
    idempotent: true,
    checks: checks[0],
  };
}
