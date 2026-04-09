-- Build Student Evaluation Set from existing teacher_outputs
-- Strategy: Traffic-weighted stratified sampling from Gold-tier data
--
-- Gold criteria:
--   1. Teacher output exists and is non-empty
--   2. Primary run succeeded (not fallback)
--   3. Teacher latency < 8000ms (fast = confident = higher quality)
--   4. Not a shadow pass (real user-facing run)
--
-- Sampling: Proportional to traffic distribution per task_type,
-- with minimum 5 cases per task_type to cover long-tail

-- Step 1: Identify Gold candidates
WITH gold_candidates AS (
  SELECT
    t.id AS teacher_output_id,
    a.id AS ai_run_id,
    a.task_type,
    a.prompt_text,
    a.system_prompt,
    t.teacher_response AS gold_response,
    t.teacher_provider,
    t.teacher_model,
    a.latency_ms AS teacher_latency_ms,
    a.structured_json AS gold_structured,
    -- Domain classification
    CASE
      WHEN a.task_type LIKE '%utterance_reading%' THEN 'utterance_reading'
      WHEN a.task_type LIKE '%alter_home%' THEN 'daily_guidance'
      WHEN a.task_type IN ('stargazer_alter_response') THEN 'conversation'
      WHEN a.task_type IN ('stargazer_question_generation', 'stargazer_question_expansion') THEN 'question_gen'
      WHEN a.task_type IN ('stargazer_ai_prediction', 'stargazer_prophecy_enhance') THEN 'prediction'
      WHEN a.task_type IN ('stargazer_aha_insight', 'stargazer_pattern_narrative') THEN 'insight'
      WHEN a.task_type LIKE '%lens%' THEN 'lens'
      WHEN a.task_type LIKE '%alter_letter%' THEN 'letter'
      WHEN a.task_type LIKE '%blind_spot%' OR a.task_type LIKE '%vanishing%' THEN 'reflection'
      ELSE 'general'
    END AS domain,
    -- Difficulty heuristic: longer prompts + complex tasks = harder
    CASE
      WHEN LENGTH(a.prompt_text) > 3000 THEN 'hard'
      WHEN LENGTH(a.prompt_text) > 1000 THEN 'medium'
      ELSE 'easy'
    END AS difficulty,
    ROW_NUMBER() OVER (PARTITION BY a.task_type ORDER BY RANDOM()) AS rn,
    COUNT(*) OVER (PARTITION BY a.task_type) AS task_total
  FROM teacher_outputs t
  JOIN ai_runs a ON a.id = t.ai_run_id
  WHERE a.success = true
    AND a.latency_ms < 8000
    AND (a.metadata->>'shadowPass' IS NULL OR a.metadata->>'shadowPass' = 'false')
    AND a.fallback_used = false
    AND LENGTH(COALESCE(t.teacher_response, '')) > 50
),
-- Step 2: Calculate sampling quotas (proportional, min 5 per task_type)
task_quotas AS (
  SELECT
    task_type,
    task_total,
    GREATEST(5, ROUND(task_total::numeric / (SELECT SUM(task_total) FROM (SELECT DISTINCT task_type, task_total FROM gold_candidates) sq) * 150)) AS quota
  FROM (SELECT DISTINCT task_type, task_total FROM gold_candidates) t
)
-- Step 3: Sample
INSERT INTO student_eval_cases (
  source_ai_run_id,
  source_teacher_output_id,
  task_type,
  domain,
  difficulty,
  prompt_text,
  system_prompt,
  gold_response,
  gold_structured,
  quality_tier,
  teacher_provider,
  teacher_model,
  teacher_latency_ms,
  metadata
)
SELECT
  gc.ai_run_id,
  gc.teacher_output_id,
  gc.task_type,
  gc.domain,
  gc.difficulty,
  gc.prompt_text,
  gc.system_prompt,
  gc.gold_response,
  gc.gold_structured,
  'gold',
  gc.teacher_provider,
  gc.teacher_model,
  gc.teacher_latency_ms,
  jsonb_build_object(
    'sampling_method', 'traffic_weighted_stratified',
    'task_total', gc.task_total,
    'quota', tq.quota,
    'build_date', now()::text
  )
FROM gold_candidates gc
JOIN task_quotas tq ON tq.task_type = gc.task_type
WHERE gc.rn <= tq.quota
ORDER BY gc.task_type, gc.rn;
