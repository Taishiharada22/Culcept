import "server-only";

import { runAI } from "./index";
import { resolveRouterDecision } from "./router";
import { resolveModelSelection } from "./modelSelection";
import { buildAICacheKey, resolveCacheEligibility } from "./cache";
import { shouldGenerateTeacherOutput } from "./eval";
import { runAutoEvalBatch } from "./judge";
import { generateTrainingArtifact } from "./trainingArtifacts";
import { runPromotionReviewBatch } from "./promotion";
import { bootstrapModelRegistry, checkModelRegistryReadable } from "./bootstrapModelRegistry";

export type SmokeMode =
  | "router_basic"
  | "cache_cycle"
  | "teacher_eligibility"
  | "auto_eval_reachability"
  | "training_artifact_reachability"
  | "promotion_review_reachability"
  | "model_registry_bootstrap_readability"
  | "all";

export type SmokeCheckResult = {
  ok: boolean;
  mode: Exclude<SmokeMode, "all">;
  status: "passed" | "failed" | "skipped";
  code: string;
  details: Record<string, unknown>;
};

export type SmokeRunResult = {
  ok: boolean;
  mode: SmokeMode;
  liveProvider: boolean;
  mutate: boolean;
  checks: SmokeCheckResult[];
};

const KNOWN_MODES = new Set<SmokeMode>([
  "router_basic",
  "cache_cycle",
  "teacher_eligibility",
  "auto_eval_reachability",
  "training_artifact_reachability",
  "promotion_review_reachability",
  "model_registry_bootstrap_readability",
  "all",
]);

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function detailError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown_error";
  }
}

export function normalizeSmokeMode(value: string | null | undefined): SmokeMode {
  const normalized = (value ?? "").trim().toLowerCase() as SmokeMode;
  if (KNOWN_MODES.has(normalized)) return normalized;
  return "all";
}

function makeSkipped(
  mode: Exclude<SmokeMode, "all">,
  code: string,
  details: Record<string, unknown>,
): SmokeCheckResult {
  return {
    ok: true,
    mode,
    status: "skipped",
    code,
    details,
  };
}

function makePassed(
  mode: Exclude<SmokeMode, "all">,
  code: string,
  details: Record<string, unknown>,
): SmokeCheckResult {
  return {
    ok: true,
    mode,
    status: "passed",
    code,
    details,
  };
}

function makeFailed(
  mode: Exclude<SmokeMode, "all">,
  code: string,
  details: Record<string, unknown>,
): SmokeCheckResult {
  return {
    ok: false,
    mode,
    status: "failed",
    code,
    details,
  };
}

async function runRouterBasicCheck(args: {
  liveProvider: boolean;
}): Promise<SmokeCheckResult> {
  const mode: Exclude<SmokeMode, "all"> = "router_basic";
  const prompt = `smoke-router-${Date.now()}`;

  const params = {
    taskType: "summary",
    prompt,
    allowFallback: true,
    metadata: {
      smokeTest: true,
      smokeMode: mode,
      suppressTeacher: true,
    },
    maxOutputTokens: 80,
    temperature: 0.2,
  };

  const routerDecision = resolveRouterDecision(params);

  try {
    const selection = await resolveModelSelection(params);

    if (!args.liveProvider) {
      return makePassed(mode, "decision_only", {
        liveProvider: false,
        routerDecision,
        modelSelection: {
          reason: selection.reason,
          selectedRole: selection.selectedRole,
          selectedModelKey: selection.selectedModelKey,
          selectedModelVersion: selection.selectedModelVersion,
          preferredProvider: selection.preferredProvider,
        },
      });
    }

    const run = await runAI(params);
    if (!run.success) {
      return makeFailed(mode, "provider_path_failed", {
        provider: run.provider,
        errorMessage: run.errorMessage,
      });
    }

    return makePassed(mode, "provider_path_ok", {
      provider: run.provider,
      model: run.model,
      aiRunId: run.aiRunId,
      cacheHit: run.cacheHit ?? false,
      fallbackUsed: run.fallbackUsed ?? false,
    });
  } catch (error) {
    return makeFailed(mode, "router_basic_check_failed", {
      error: detailError(error),
      routerDecision,
    });
  }
}

async function runCacheCycleCheck(args: {
  liveProvider: boolean;
}): Promise<SmokeCheckResult> {
  const mode: Exclude<SmokeMode, "all"> = "cache_cycle";
  const prompt = `smoke-cache-${Date.now()}`;

  const params = {
    taskType: "summary",
    prompt,
    allowFallback: true,
    metadata: {
      smokeTest: true,
      smokeMode: mode,
      suppressTeacher: true,
    },
    maxOutputTokens: 80,
    temperature: 0.1,
  };

  const eligibility = resolveCacheEligibility(params);
  const cacheKey = buildAICacheKey(params);

  if (!eligibility.enabled) {
    return makeSkipped(mode, "cache_disabled", {
      eligibility,
      cacheKey,
    });
  }

  if (!eligibility.eligible) {
    return makeSkipped(mode, "cache_not_eligible", {
      eligibility,
      cacheKey,
    });
  }

  if (!args.liveProvider) {
    return makeSkipped(mode, "live_provider_required", {
      eligibility,
      cacheKey,
    });
  }

  try {
    const first = await runAI(params);
    const second = await runAI(params);

    if (!first.success || !second.success) {
      return makeFailed(mode, "cache_cycle_run_failed", {
        first: {
          success: first.success,
          provider: first.provider,
          errorMessage: first.errorMessage,
        },
        second: {
          success: second.success,
          provider: second.provider,
          errorMessage: second.errorMessage,
        },
      });
    }

    return makePassed(mode, "cache_cycle_completed", {
      cacheKey,
      firstCacheHit: first.cacheHit ?? false,
      secondCacheHit: second.cacheHit ?? false,
      secondExpectedHit: second.cacheHit === true,
      firstAiRunId: first.aiRunId,
      secondAiRunId: second.aiRunId,
    });
  } catch (error) {
    return makeFailed(mode, "cache_cycle_exception", {
      error: detailError(error),
      cacheKey,
    });
  }
}

function runTeacherEligibilityCheck(): SmokeCheckResult {
  const mode: Exclude<SmokeMode, "all"> = "teacher_eligibility";

  const eligible = shouldGenerateTeacherOutput({
    params: {
      taskType: "high_quality_chat",
      prompt: "smoke teacher eligibility",
      metadata: {
        needsTeacher: true,
      },
    },
    result: {
      text: "短い返答",
      provider: "ollama",
      model: "llama3.1",
      latencyMs: 5,
      success: true,
      fallbackUsed: false,
      cacheHit: false,
    },
  });

  return makePassed(mode, "teacher_eligibility_checked", {
    teacherEnabled: envBool("AI_TEACHER_ENABLED", false),
    eligible,
  });
}

async function runAutoEvalReachabilityCheck(): Promise<SmokeCheckResult> {
  const mode: Exclude<SmokeMode, "all"> = "auto_eval_reachability";

  try {
    const summary = await runAutoEvalBatch({
      dryRun: true,
      batchSize: 1,
      lookbackHours: 1,
    });

    return makePassed(mode, "auto_eval_reachable", {
      enabled: summary.enabled,
      scanned: summary.scanned,
      evaluated: summary.evaluated,
      failed: summary.failed,
      dryRun: summary.dryRun,
    });
  } catch (error) {
    return makeFailed(mode, "auto_eval_unreachable", {
      error: detailError(error),
    });
  }
}

async function runTrainingArtifactReachabilityCheck(): Promise<SmokeCheckResult> {
  const mode: Exclude<SmokeMode, "all"> = "training_artifact_reachability";

  try {
    const result = await generateTrainingArtifact({
      lookbackHours: 1,
      limit: 5,
    });

    if (!result.ok) {
      return makeSkipped(mode, result.error ?? "artifact_unavailable", {
        enabled: result.enabled,
        rowsScanned: result.rowsScanned ?? 0,
      });
    }

    return makePassed(mode, "training_artifact_reachable", {
      artifactId: result.summary?.id ?? null,
      artifactType: result.summary?.artifactType ?? null,
      rowCount: result.summary?.rowCount ?? 0,
      status: result.summary?.status ?? null,
    });
  } catch (error) {
    return makeFailed(mode, "training_artifact_unreachable", {
      error: detailError(error),
    });
  }
}

async function runPromotionReviewReachabilityCheck(): Promise<SmokeCheckResult> {
  const mode: Exclude<SmokeMode, "all"> = "promotion_review_reachability";

  try {
    const summary = await runPromotionReviewBatch({
      lookbackHours: 1,
    });

    return makePassed(mode, "promotion_review_reachable", {
      enabled: summary.enabled,
      reviewed: summary.reviewed,
      eligible: summary.eligible,
      insufficient: summary.insufficient,
    });
  } catch (error) {
    return makeFailed(mode, "promotion_review_unreachable", {
      error: detailError(error),
    });
  }
}

async function runModelRegistryBootstrapReadabilityCheck(args: {
  mutate: boolean;
}): Promise<SmokeCheckResult> {
  const mode: Exclude<SmokeMode, "all"> = "model_registry_bootstrap_readability";

  try {
    const readability = await checkModelRegistryReadable();
    const bootstrap = await bootstrapModelRegistry({
      dryRun: !args.mutate,
      challenger: {
        enabled: false,
      },
    });

    if (!bootstrap.ok) {
      return makeFailed(mode, "bootstrap_failed", {
        readability,
        bootstrap,
      });
    }

    return makePassed(mode, args.mutate ? "bootstrap_applied" : "bootstrap_dry_run_ok", {
      mutate: args.mutate,
      readability,
      bootstrap: {
        schemaMode: bootstrap.schemaMode,
        dryRun: bootstrap.dryRun,
        actions: bootstrap.actions,
      },
    });
  } catch (error) {
    return makeFailed(mode, "model_registry_check_failed", {
      error: detailError(error),
    });
  }
}

export async function runAISmokeTest(args: {
  mode: SmokeMode;
  liveProvider?: boolean;
  mutate?: boolean;
}): Promise<SmokeRunResult> {
  const liveProvider = Boolean(args.liveProvider);
  const mutate = Boolean(args.mutate);

  const checks: SmokeCheckResult[] = [];

  const run = async (mode: Exclude<SmokeMode, "all">) => {
    if (mode === "router_basic") {
      checks.push(await runRouterBasicCheck({ liveProvider }));
      return;
    }
    if (mode === "cache_cycle") {
      checks.push(await runCacheCycleCheck({ liveProvider }));
      return;
    }
    if (mode === "teacher_eligibility") {
      checks.push(runTeacherEligibilityCheck());
      return;
    }
    if (mode === "auto_eval_reachability") {
      checks.push(await runAutoEvalReachabilityCheck());
      return;
    }
    if (mode === "training_artifact_reachability") {
      checks.push(await runTrainingArtifactReachabilityCheck());
      return;
    }
    if (mode === "promotion_review_reachability") {
      checks.push(await runPromotionReviewReachabilityCheck());
      return;
    }
    checks.push(await runModelRegistryBootstrapReadabilityCheck({ mutate }));
  };

  if (args.mode === "all") {
    await run("router_basic");
    await run("cache_cycle");
    await run("teacher_eligibility");
    await run("auto_eval_reachability");
    await run("training_artifact_reachability");
    await run("promotion_review_reachability");
    await run("model_registry_bootstrap_readability");
  } else {
    await run(args.mode);
  }

  return {
    ok: checks.every((check) => check.ok),
    mode: args.mode,
    liveProvider,
    mutate,
    checks,
  };
}
