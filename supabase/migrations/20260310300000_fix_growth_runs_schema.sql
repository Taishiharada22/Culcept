-- Fix stargazer_growth_runs schema mismatches
-- Adds missing columns that growthOrchestrator.ts references

-- 1. updated_at: referenced in insert + all update calls
ALTER TABLE stargazer_growth_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. result_summary: stores actions, stats, and error info as JSONB
ALTER TABLE stargazer_growth_runs
  ADD COLUMN IF NOT EXISTS result_summary JSONB;

-- 3. run_type default: code creates runs without explicit run_type
ALTER TABLE stargazer_growth_runs
  ALTER COLUMN run_type SET DEFAULT 'full_cycle';
