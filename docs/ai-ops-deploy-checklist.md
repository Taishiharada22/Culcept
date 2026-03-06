# AI Ops Deploy Checklist (Pre-Claude)

This runbook covers safe deployment of Aneurasync AI ops foundation (v1/v1.1/v1.2) before live debugging in Claude Code.

## Scope
- Router + fallback
- Semantic cache
- Teacher outputs
- Auto-eval
- Dataset export
- Training artifacts
- Promotion review
- Champion/challenger rollout
- model_registry bootstrap
- Internal smoke checks

## 1) Migration Chain (Required Order)
Apply these in timestamp order:
1. `20260305113000_ai_router_foundation.sql`
2. `20260305150000_ai_v11_cache_eval.sql`
3. `20260305190000_ai_v12_training_rollout.sql`

### Deploy commands
```bash
npx supabase migration list
npx supabase db push
npx supabase migration list
```

Expected after push:
- `20260305190000` no longer appears as Local-only.

### Notes
- Migrations are additive and backward-compatible.
- Schema compatibility check across `20260305113000`, `20260305150000`, `20260305190000`: no destructive overlap found (new tables/columns/indexes only).
- `ai_semantic_cache`, `ai_eval_runs`, and `ai_training_artifacts` are RLS-enabled and intended for trusted service-role access.
- If routes return `pending_migration_missing_table` or `pending_migration_missing_column`, re-run migration checks before debugging app logic.
- If remote DB is unreachable from this environment, run the same commands from a network-permitted CI/ops host and re-check `migration list`.

## 2) Required Environment Variables

## Core (required)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` or `AI_INTERNAL_API_KEY` (internal route auth)

## Provider (required for live provider smoke)
- Gemini path:
- `GEMINI_API_KEY`
- optional: `GEMINI_MODEL_DEFAULT`, `GEMINI_TIMEOUT_MS`
- Ollama path:
- optional: `OLLAMA_BASE_URL` (default: `http://127.0.0.1:11434`)
- optional: `OLLAMA_MODEL_DEFAULT`, `OLLAMA_TIMEOUT_MS`

## Feature flags and thresholds
- Router/fallback:
- `AI_ROUTER_ENABLED`
- `AI_FALLBACK_ENABLED`
- `AI_DEFAULT_PROVIDER`
- Cache:
- `AI_CACHE_ENABLED`
- `AI_CACHE_TTL_SECONDS`
- `AI_CACHE_TASK_TYPES`
- Teacher/eval:
- `AI_TEACHER_ENABLED`
- `AI_AUTO_EVAL_ENABLED`
- Export/artifacts:
- `AI_EXPORT_ENABLED`
- `AI_TRAINING_ARTIFACTS_ENABLED`
- `AI_TRAINING_ARTIFACT_MAX_ROWS`
- `AI_TRAINING_ARTIFACT_STORE_MODE`
- optional: `AI_TRAINING_ARTIFACT_BUCKET` (or `AI_STORAGE_BUCKET`)
- Rollout/promotion:
- `AI_MODEL_ROLLOUT_ENABLED`
- `AI_MODEL_ROLLOUT_STICKY_MODE`
- `AI_PROMOTION_CRON_ENABLED`
- `AI_PROMOTION_MIN_SAMPLE_SIZE`
- `AI_PROMOTION_MIN_AVG_SCORE`
- `AI_PROMOTION_MIN_PASS_RATE`
- `AI_PROMOTION_MAX_FALLBACK_RATE`

## 3) Safe Initial Values (Recommended)
Use this posture for first deployment:

```dotenv
AI_ROUTER_ENABLED=true
AI_FALLBACK_ENABLED=true
AI_CACHE_ENABLED=true
AI_TEACHER_ENABLED=false
AI_AUTO_EVAL_ENABLED=false
AI_EXPORT_ENABLED=false
AI_TRAINING_ARTIFACTS_ENABLED=false
AI_TRAINING_ARTIFACT_STORE_MODE=db
AI_MODEL_ROLLOUT_ENABLED=false
AI_MODEL_ROLLOUT_DEFAULT_CHALLENGER_PERCENT=0
AI_PROMOTION_CRON_ENABLED=false
```

Keep OFF initially:
- rollout (`AI_MODEL_ROLLOUT_ENABLED`)
- promotion cron (`AI_PROMOTION_CRON_ENABLED`)
- automatic artifact generation (`AI_TRAINING_ARTIFACTS_ENABLED` unless intentionally testing)

## 4) Internal Auth Conventions
Accepted auth inputs for internal routes:
- `Authorization: Bearer <AI_INTERNAL_API_KEY or CRON_SECRET>`
- `x-internal-token: <...>`
- `x-cron-secret: <...>`
- `?secret=<...>`

If secrets are missing, routes return:
- `error=internal_auth_not_configured`

## 5) First Activation Order (Deployment-Safe)
1. Apply migrations (`migration list` -> `db push` -> `migration list`)
2. Set env vars with safe values above
3. Keep rollout/promotion cron OFF
4. Bootstrap model registry champion (dry-run first)
5. Verify router path (decision-only smoke)
6. Verify cache path (decision or live cache cycle)
7. Verify export route reachability
8. Verify promotion review dry-run reachability
9. Only then enable rollout for controlled slices
10. Only later enable promotion cron

## 6) Smoke Test Endpoints (Internal)
Set once:
```bash
BASE_URL="https://<your-deployment-domain>"
SECRET="<CRON_SECRET or AI_INTERNAL_API_KEY>"
```

### A. All-in-one smoke (safe, no provider call)
```bash
curl -s "$BASE_URL/api/internal/ai/smoke-test" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" -d '{"mode":"all"}' | jq .
```
Expected:
- `ok` may still be `true` with `skipped` checks if features are intentionally disabled.

### B. Router + cache live path (optional, incurs provider call)
```bash
curl -s "$BASE_URL/api/internal/ai/smoke-test" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" -d '{"mode":"cache_cycle","liveProvider":true}' | jq .
```
Expected when providers are reachable:
- first run may miss cache
- second run should hit cache (`secondCacheHit=true`)

### C. Bootstrap model_registry (dry-run)
```bash
curl -s "$BASE_URL/api/internal/ai/bootstrap-model-registry" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" -d '{"dryRun":true}' | jq .
```

### D. Apply bootstrap champion row
```bash
curl -s -X POST "$BASE_URL/api/internal/ai/bootstrap-model-registry" \
  -H "Authorization: Bearer $SECRET" \
  -H 'content-type: application/json' \
  -d '{"dryRun":false,"challengerEnabled":false}' | jq .
```

### E. Auto-eval route reachability
```bash
curl -s "$BASE_URL/api/cron/ai-auto-eval?dryRun=true&batch=1" -H "Authorization: Bearer $SECRET" | jq .
```

### F. Training artifact route reachability
```bash
curl -s "$BASE_URL/api/internal/ai/generate-training-artifact?lookbackHours=24&limit=20" -H "Authorization: Bearer $SECRET" | jq .
```
Expected safe failure if disabled:
- `error=training_artifacts_disabled` or `error=dataset_export_disabled`

### G. Promotion review dry-run reachability
```bash
curl -s "$BASE_URL/api/internal/ai/review-promotion?dryRun=true" -H "Authorization: Bearer $SECRET" | jq .
```
Expected safe failure before bootstrap/data:
- `error=challenger_not_found` or `error=model_registry_unavailable`

## 7) Rollback Switches
Immediate rollback = flip flags and redeploy:
- Router off: `AI_ROUTER_ENABLED=false`
- Cache off: `AI_CACHE_ENABLED=false`
- Teacher off: `AI_TEACHER_ENABLED=false`
- Auto-eval off: `AI_AUTO_EVAL_ENABLED=false`
- Export off: `AI_EXPORT_ENABLED=false`
- Rollout off: `AI_MODEL_ROLLOUT_ENABLED=false`
- Promotion cron off: `AI_PROMOTION_CRON_ENABLED=false`
- Training artifacts off: `AI_TRAINING_ARTIFACTS_ENABLED=false`

Safe fallback behavior:
- With rollout disabled, selection layer is bypassed.
- Promotion endpoint defaults to dry-run and does not mutate unless explicit action is passed.

## 8) What Should Stay OFF Initially
- `AI_MODEL_ROLLOUT_ENABLED`
- `AI_PROMOTION_CRON_ENABLED`
- any non-dry-run promotion mutation automation

Enable these only after DB + auth + smoke paths are green.

## 9) Claude Code Handoff (Live)
Claude should verify in this order:
1. Migrations applied (`migration list` + missing table/column errors)
2. Internal auth alignment (`CRON_SECRET` / `AI_INTERNAL_API_KEY`)
3. model_registry bootstrap/readability
4. DB-backed internal routes
5. Provider reachability for live smoke (`liveProvider=true`)
6. Cache miss->hit cycle
7. Promotion review dry-run stability
8. Controlled rollout tests only after above

If something fails, check first:
- logs from internal routes under `app/api/internal/ai/*`
- `ai_runs`, `ai_semantic_cache`, `ai_eval_runs`, `ai_training_artifacts`, `model_registry`
- `lib/ai/errors.ts` mapping for canonical error code interpretation
