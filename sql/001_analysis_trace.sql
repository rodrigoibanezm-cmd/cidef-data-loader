CREATE TABLE IF NOT EXISTS analysis_runs (
  run_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  question_raw TEXT,
  intent TEXT,
  request_json JSONB,
  snapshot_cutoff TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS analysis_steps (
  step_id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES analysis_runs(run_id),
  step_order INTEGER NOT NULL,
  motor TEXT NOT NULL,
  motor_version TEXT,
  input_json JSONB,
  output_hash TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_text TEXT,
  UNIQUE (run_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_tenant_created
  ON analysis_runs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_steps_run
  ON analysis_steps (run_id, step_order);
