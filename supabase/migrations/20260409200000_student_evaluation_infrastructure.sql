-- Student LLM Evaluation Infrastructure
-- Tables: student_eval_cases, student_eval_runs, student_comparison_metrics

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Evaluation Cases: curated input-output pairs for Student assessment
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS student_eval_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Source traceability
  source_ai_run_id UUID REFERENCES ai_runs(id),
  source_teacher_output_id UUID REFERENCES teacher_outputs(id),

  -- Task classification
  task_type TEXT NOT NULL,
  domain TEXT NOT NULL,               -- greeting, daily_guidance, work, self_understanding, relationship, general
  difficulty TEXT NOT NULL DEFAULT 'medium', -- easy, medium, hard

  -- Input
  prompt_text TEXT NOT NULL,
  system_prompt TEXT,

  -- Gold standard (Teacher output)
  gold_response TEXT NOT NULL,
  gold_structured JSONB,

  -- Quality tier: gold, silver, negative
  quality_tier TEXT NOT NULL DEFAULT 'gold' CHECK (quality_tier IN ('gold', 'silver', 'negative')),

  -- Metadata
  teacher_provider TEXT,
  teacher_model TEXT,
  teacher_latency_ms INT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_student_eval_cases_task_type ON student_eval_cases(task_type);
CREATE INDEX IF NOT EXISTS idx_student_eval_cases_domain ON student_eval_cases(domain);
CREATE INDEX IF NOT EXISTS idx_student_eval_cases_quality_tier ON student_eval_cases(quality_tier);
ALTER TABLE student_eval_cases ENABLE ROW LEVEL SECURITY;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Evaluation Runs: each time Student is evaluated against eval cases
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS student_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Student model info
  student_model_key TEXT NOT NULL,     -- e.g. "stargazer_student"
  student_model_version TEXT NOT NULL, -- e.g. "openai-gpt4o-mini-v1"
  student_provider TEXT NOT NULL,
  student_model TEXT NOT NULL,         -- e.g. "gpt-4o-mini"

  -- Run scope
  eval_case_count INT NOT NULL DEFAULT 0,
  domain_filter TEXT,                  -- null = all domains
  task_type_filter TEXT,               -- null = all task types

  -- Aggregate metrics
  task_match_rate NUMERIC(5,4),        -- % of task judgment matches
  mode_match_rate NUMERIC(5,4),        -- % of mode matches
  validator_pass_rate NUMERIC(5,4),    -- % passing Aneurasync validators
  generic_rate NUMERIC(5,4),           -- % flagged as generic
  personality_consistency NUMERIC(5,4),-- % consistent with Alter personality model
  overall_score NUMERIC(5,4),          -- weighted composite

  -- Status
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_student_eval_runs_model_key ON student_eval_runs(student_model_key);
CREATE INDEX IF NOT EXISTS idx_student_eval_runs_created_at ON student_eval_runs(created_at DESC);
ALTER TABLE student_eval_runs ENABLE ROW LEVEL SECURITY;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Per-case comparison results within an eval run
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS student_comparison_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  eval_run_id UUID NOT NULL REFERENCES student_eval_runs(id),
  eval_case_id UUID NOT NULL REFERENCES student_eval_cases(id),

  -- Student output
  student_response TEXT,
  student_structured JSONB,
  student_latency_ms INT,
  student_ai_run_id UUID REFERENCES ai_runs(id),

  -- Comparison metrics (per-case)
  task_match BOOLEAN,                -- Did Student produce same task judgment?
  mode_match BOOLEAN,                -- Did Student choose same mode?
  validator_passed BOOLEAN,          -- Did Student output pass validators?
  is_generic BOOLEAN,                -- Was Student output flagged as generic?
  personality_consistent BOOLEAN,    -- Consistent with Alter personality model?

  -- Detailed scores
  directness_score NUMERIC(3,2),     -- 0-1
  specificity_score NUMERIC(3,2),    -- 0-1
  personalization_score NUMERIC(3,2),-- 0-1
  actionability_score NUMERIC(3,2),  -- 0-1

  -- Overall
  pass BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_student_comparison_eval_run ON student_comparison_results(eval_run_id);
CREATE INDEX IF NOT EXISTS idx_student_comparison_eval_case ON student_comparison_results(eval_case_id);
CREATE INDEX IF NOT EXISTS idx_student_comparison_pass ON student_comparison_results(pass);
ALTER TABLE student_comparison_results ENABLE ROW LEVEL SECURITY;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Shadow comparison view: join primary run + shadow run for live monitoring
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE VIEW student_shadow_pairs AS
SELECT
  p.id AS primary_run_id,
  p.task_type,
  p.provider AS teacher_provider,
  p.model AS teacher_model,
  p.response_text AS teacher_response,
  p.latency_ms AS teacher_latency_ms,
  p.success AS teacher_success,
  s.id AS shadow_run_id,
  s.provider AS student_provider,
  s.model AS student_model,
  s.response_text AS student_response,
  s.latency_ms AS student_latency_ms,
  s.success AS student_success,
  p.created_at,
  p.user_id,
  p.session_id
FROM ai_runs p
INNER JOIN ai_runs s ON s.metadata->>'shadowOfAiRunId' = p.id::text
WHERE p.success = true
  AND s.metadata->>'shadowPass' = 'true'
ORDER BY p.created_at DESC;
