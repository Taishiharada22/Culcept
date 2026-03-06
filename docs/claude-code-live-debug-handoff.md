# Claude Code Live Debug Handoff

This document is the operational handoff after pre-Claude preparation.

## A) Implemented Subsystems
- Router: `lib/ai/router.ts`, integrated via `lib/ai/index.ts`
- Fallback: router decision + provider retry in `runAI`
- Cache: `lib/ai/cache.ts` (`ai_semantic_cache`)
- Teacher: `lib/ai/eval.ts` + `teacher_outputs`
- Eval: `lib/ai/judge.ts` + `ai_eval_runs`
- Export: `lib/ai/exportDataset.ts` + `/api/internal/ai/export-dataset`
- Training artifacts: `lib/ai/trainingArtifacts.ts` + `/api/internal/ai/generate-training-artifact`
- Promotion review: `lib/ai/promotion.ts` + `/api/internal/ai/review-promotion`
- Rollout: `lib/ai/modelSelection.ts` + `model_registry`
- model_registry bootstrap: `lib/ai/bootstrapModelRegistry.ts` + `/api/internal/ai/bootstrap-model-registry`
- Smoke helper: `lib/ai/smokeTest.ts` + `/api/internal/ai/smoke-test`

## B) Expected to Work Immediately (After Migrations + Env)
- Internal auth-protected routes return structured JSON.
- Router decision path works even with rollout disabled.
- model_registry bootstrap dry-run works.
- Auto-eval cron endpoint is reachable (may report `enabled=false` by default).
- Promotion review endpoint is reachable and fails safely when candidate data is absent.

## C) Intentionally OFF by Default
- `AI_MODEL_ROLLOUT_ENABLED=false`
- `AI_PROMOTION_CRON_ENABLED=false`
- `AI_AUTO_EVAL_ENABLED=false`
- `AI_TRAINING_ARTIFACTS_ENABLED=false`
- `AI_EXPORT_ENABLED=false`
- `AI_TEACHER_ENABLED=false` (cost-control default)

## D) Most Likely Live Issues to Investigate First
1. Remote DB missing migrations (`pending_migration_missing_table/column`)
2. Service-role configuration (`service_role_unavailable`)
3. Internal auth mismatch (`internal_auth_not_configured` / `unauthorized`)
4. model_registry not bootstrapped (`challenger_not_found`, no active champion/challenger rows)
5. Rollout ambiguity (multiple active champions/challengers)
6. Provider endpoint unreachable (Gemini key missing, Ollama host unreachable)
7. Artifact storage mode configured without bucket/permissions (`artifact_storage_unavailable`)

## E) Prioritized Live-Debug Order
1. Verify migrations (`npx supabase migration list`, then `npx supabase db push` if needed)
2. Verify internal auth path (`CRON_SECRET` / `AI_INTERNAL_API_KEY`)
3. Verify DB-backed internal routes:
- `/api/internal/ai/bootstrap-model-registry?dryRun=true`
- `/api/internal/ai/smoke-test?mode=all`
4. Verify live provider response:
- `/api/internal/ai/smoke-test?mode=router_basic&liveProvider=true`
5. Verify cache hit path:
- `/api/internal/ai/smoke-test?mode=cache_cycle&liveProvider=true`
6. Verify model_registry bootstrap apply (`dryRun=false`)
7. Verify promotion dry-run:
- `/api/internal/ai/review-promotion?dryRun=true`
8. Only then test rollout traffic with explicit model_registry configuration

## F) Most Relevant Files and Routes

## Core files
- `lib/ai/index.ts`
- `lib/ai/router.ts`
- `lib/ai/modelSelection.ts`
- `lib/ai/modelRegistry.ts`
- `lib/ai/cache.ts`
- `lib/ai/eval.ts`
- `lib/ai/judge.ts`
- `lib/ai/exportDataset.ts`
- `lib/ai/trainingArtifacts.ts`
- `lib/ai/promotion.ts`
- `lib/ai/bootstrapModelRegistry.ts`
- `lib/ai/smokeTest.ts`
- `lib/ai/errors.ts`

## Internal/cron routes
- `/api/internal/ai/smoke-test`
- `/api/internal/ai/bootstrap-model-registry`
- `/api/internal/ai/export-dataset`
- `/api/internal/ai/generate-training-artifact`
- `/api/internal/ai/review-promotion`
- `/api/cron/ai-auto-eval`
- `/api/cron/ai-promotion-review`

## DB tables to inspect
- `ai_runs`
- `ai_semantic_cache`
- `teacher_outputs`
- `ai_eval_runs`
- `ai_feedback`
- `ai_training_artifacts`
- `model_registry`

## What Claude Should NOT Change First
- Do not enable rollout/promotion cron before migration/auth/bootstrap checks pass.
- Do not change threshold values first; validate data availability and grouping first.
- Do not introduce auto-promotion mutations before dry-run evidence is stable.
- Do not switch artifact storage mode to `storage` before bucket/permission verification.
