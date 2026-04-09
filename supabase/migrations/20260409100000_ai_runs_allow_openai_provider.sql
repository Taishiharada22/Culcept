-- Allow "openai" as a valid provider in ai_runs, ai_semantic_cache, teacher_outputs, model_registry
-- The existing CHECK constraint "ai_runs_provider_check" blocks "openai" inserts.
-- Existing data includes 'ollama' (267 rows) — must be preserved.

-- ai_runs (existing data: gemini=3515, ollama=267)
ALTER TABLE ai_runs DROP CONSTRAINT IF EXISTS ai_runs_provider_check;
ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_provider_check CHECK (provider IN ('gemini', 'openai', 'ollama'));

-- ai_semantic_cache (may have similar constraint)
ALTER TABLE ai_semantic_cache DROP CONSTRAINT IF EXISTS ai_semantic_cache_provider_check;
ALTER TABLE ai_semantic_cache ADD CONSTRAINT ai_semantic_cache_provider_check CHECK (provider IN ('gemini', 'openai', 'ollama'));

-- teacher_outputs — teacher_provider and student_provider
ALTER TABLE teacher_outputs DROP CONSTRAINT IF EXISTS teacher_outputs_teacher_provider_check;
ALTER TABLE teacher_outputs DROP CONSTRAINT IF EXISTS teacher_outputs_student_provider_check;
ALTER TABLE teacher_outputs ADD CONSTRAINT teacher_outputs_teacher_provider_check CHECK (teacher_provider IN ('gemini', 'openai', 'ollama'));
ALTER TABLE teacher_outputs ADD CONSTRAINT teacher_outputs_student_provider_check CHECK (student_provider IS NULL OR student_provider IN ('gemini', 'openai', 'ollama'));

-- model_registry
ALTER TABLE model_registry DROP CONSTRAINT IF EXISTS model_registry_provider_check;
ALTER TABLE model_registry ADD CONSTRAINT model_registry_provider_check CHECK (provider IN ('gemini', 'openai', 'ollama'));
