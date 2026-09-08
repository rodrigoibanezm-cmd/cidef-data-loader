ALTER TABLE public.rvm_raw
  ADD COLUMN IF NOT EXISTS data_status text,
  ADD COLUMN IF NOT EXISTS snapshot_date date;

UPDATE public.rvm_raw
SET data_status = 'CONSOLIDATED'
WHERE data_status IS NULL;

ALTER TABLE public.rvm_raw
  ALTER COLUMN data_status SET DEFAULT 'CONSOLIDATED';

ALTER TABLE public.rvm_raw
  ALTER COLUMN data_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rvm_raw_data_status_check'
      AND conrelid = 'public.rvm_raw'::regclass
  ) THEN
    ALTER TABLE public.rvm_raw
      ADD CONSTRAINT rvm_raw_data_status_check
      CHECK (data_status IN ('CONSOLIDATED', 'PRELIMINARY'));
  END IF;
END $$;
