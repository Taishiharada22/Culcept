import "server-only";

import { NextResponse } from "next/server";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
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

  try {
    const url = new URL(request.url);
    const lookbackHours = parseNumber(url.searchParams.get("lookbackHours"));
    const sampleSize = parseNumber(url.searchParams.get("sampleSize"));
    const limit = parseNumber(url.searchParams.get("limit"));

    const teacherBackfill = await backfillStargazerTeacherOutputs({
      lookbackHours,
    });
    const warmup = await runStargazerShadowWarmup({
      lookbackHours,
    });
    const sampleChecks = await runStargazerArtifactSampleChecks({
      lookbackHours,
      sampleSize,
      limit,
    });
    const [shadowHealth, promotionReview] = await Promise.all([
      getStargazerShadowHealthSummary({
        lookbackHours,
      }),
      evaluateStargazerShadowPromotionCandidate({
        lookbackHours,
      }),
    ]);
    const snapshot = await recordStargazerStudentMonitorSnapshot({
      lookbackHours,
      shadowHealth,
      promotionReview,
    });
    const trends = await getStargazerStudentProgressTrends({
      lookbackDays: Math.max(7, Math.ceil((lookbackHours ?? 168) / 24)),
    });

    await t.finish({ ok: true, summary: "ok" });
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
    await t.finish({ ok: false, summary: error instanceof Error ? error.message : "fatal" });
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
