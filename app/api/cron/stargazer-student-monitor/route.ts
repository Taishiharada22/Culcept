import "server-only";

import { NextResponse } from "next/server";
import { trackCronRun, withTimeout } from "@/lib/ceo/withSkillTelemetry";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import {
  backfillStargazerTeacherOutputs,
  evaluateStargazerShadowPromotionCandidate,
  getStargazerShadowHealthSummary,
  getStargazerStudentProgressTrends,
  recordStargazerStudentMonitorSnapshot,
  runStargazerShadowWarmup,
  runStargazerArtifactSampleChecks,
} from "@/lib/stargazer/studentOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 各ステップの最大実行時間（ms）
const STEP_TIMEOUT = 120_000; // 2分
const TOTAL_TIMEOUT = 540_000; // 9分（Vercel function 10分制限に余裕）

function parseNumber(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(request: Request) {
  const t = await trackCronRun("stargazer-student-monitor");
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(
      auth.reason ?? "unauthorized",
      "unauthorized",
    );
    await t.finish({ ok: false, summary: "unauthorized" });
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  let result: { ok: boolean; summary: string } = { ok: false, summary: "not_started" };

  try {
    const url = new URL(request.url);
    const lookbackHours = parseNumber(url.searchParams.get("lookbackHours"));
    const sampleSize = parseNumber(url.searchParams.get("sampleSize"));
    const limit = parseNumber(url.searchParams.get("limit"));

    const completedSteps: string[] = [];

    const teacherBackfill = await withTimeout(
      backfillStargazerTeacherOutputs({ lookbackHours }),
      STEP_TIMEOUT,
      "backfillTeacherOutputs",
    );
    completedSteps.push("backfill");

    const warmup = await withTimeout(
      runStargazerShadowWarmup({ lookbackHours }),
      STEP_TIMEOUT,
      "shadowWarmup",
    );
    completedSteps.push("warmup");

    const sampleChecks = await withTimeout(
      runStargazerArtifactSampleChecks({ lookbackHours, sampleSize, limit }),
      STEP_TIMEOUT,
      "sampleChecks",
    );
    completedSteps.push("sampleChecks");

    const [shadowHealth, promotionReview] = await withTimeout(
      Promise.all([
        getStargazerShadowHealthSummary({ lookbackHours }),
        evaluateStargazerShadowPromotionCandidate({ lookbackHours }),
      ]),
      STEP_TIMEOUT,
      "healthAndPromotion",
    );
    completedSteps.push("health+promotion");

    const snapshot = await withTimeout(
      recordStargazerStudentMonitorSnapshot({
        lookbackHours,
        shadowHealth,
        promotionReview,
      }),
      STEP_TIMEOUT,
      "snapshot",
    );
    completedSteps.push("snapshot");

    const trends = await withTimeout(
      getStargazerStudentProgressTrends({
        lookbackDays: Math.max(7, Math.ceil((lookbackHours ?? 168) / 24)),
      }),
      STEP_TIMEOUT,
      "trends",
    );
    completedSteps.push("trends");

    result = { ok: true, summary: "ok" };
    await t.finish(result);
    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      teacherBackfill,
      warmup,
      shadowHealth,
      promotionReview,
      snapshot,
      trends,
      sampleChecks,
    });
  } catch (error) {
    console.error("[api/cron/stargazer-student-monitor] execution failed:", error);
    result = { ok: false, summary: error instanceof Error ? error.message.slice(0, 500) : "fatal" };
    await t.finish(result);
    const normalized = normalizeAIOpsError(error, "training_artifact_generation_failed");
    const status =
      normalized.code === "service_role_unavailable" ||
      normalized.code === "db_connectivity_error" ||
      normalized.code === "pending_migration_missing_table" ||
      normalized.code === "pending_migration_missing_column"
        ? 503
        : normalized.code === "shadow_model_not_configured" ||
            normalized.code === "shadow_model_ambiguous"
          ? 409
          : 500;
    return NextResponse.json(toErrorBody(normalized), { status });
  }
}
