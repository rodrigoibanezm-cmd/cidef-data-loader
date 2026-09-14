CREATE TABLE IF NOT EXISTS public.dashboard_company_snapshot_v01 (
  snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_month date NOT NULL,
  snapshot_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  published boolean NOT NULL DEFAULT true,
  contract_version text NOT NULL DEFAULT 'dashboard_snapshot_v01',
  payload jsonb NOT NULL,
  CHECK (date_trunc('month', period_month)::date = period_month)
);

CREATE TABLE IF NOT EXISTS public.dashboard_store_snapshot_v01 (
  snapshot_id bigint NOT NULL REFERENCES public.dashboard_company_snapshot_v01(snapshot_id) ON DELETE CASCADE,
  sucursal_id bigint NOT NULL REFERENCES public.sucursales_master(sucursal_id),
  payload jsonb NOT NULL,
  PRIMARY KEY (snapshot_id, sucursal_id)
);

CREATE TABLE IF NOT EXISTS public.dashboard_signal_v01 (
  signal_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id bigint NOT NULL REFERENCES public.dashboard_company_snapshot_v01(snapshot_id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('COMPANY','STORE')),
  scope_id bigint,
  signal_type text NOT NULL CHECK (signal_type IN ('EXPLANATION','ACTION')),
  priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 5),
  tone text NOT NULL CHECK (tone IN ('POSITIVE','WARNING','CRITICAL','NEUTRAL')),
  title text NOT NULL,
  summary text NOT NULL,
  impact_value numeric,
  impact_unit text,
  domains text[] NOT NULL DEFAULT '{}',
  evidence_as_of date,
  evidence jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS dashboard_company_latest_v01
  ON public.dashboard_company_snapshot_v01 (published, snapshot_date DESC, generated_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_signal_snapshot_v01
  ON public.dashboard_signal_v01 (snapshot_id, scope_type, scope_id, signal_type, priority);
