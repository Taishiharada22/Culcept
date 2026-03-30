import "server-only";

import { NextResponse } from "next/server";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import {
  backfillIdentityTeacherOutputs,
  backfillIdentityShadowEvaluations,
  evaluateIdentityShadowPromotionCandidate,
  inspectIdentityRolloutState,
  listRecentIdentityArtifactSampleChecks,
  runIdentityArtifactSampleChecks,
  runIdentityShadowWarmup,
} from "@/lib/identity/studentOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNumber(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(
      auth.reason ?? "unauthorized",
      "unauthorized",
    );
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const lookbackHours = parseNumber(url.searchParams.get("lookbackHours"));
    const sampleSize = parseNumber(url.searchParams.get("sampleSize"));
    const limit = parseNumber(url.searchParams.get("limit"));
    const backfillLimit = parseNumber(url.searchParams.get("backfillLimit"));
    const warmupMaxActions = parseNumber(url.searchParams.get("warmupMaxActions"));

    const backfill = await backfillIdentityTeacherOutputs({
      lookbackHours,
      limit: backfillLimit,
    });
    const warmup = await runIdentityShadowWarmup({
      lookbackHours,
      maxActions: warmupMaxActions,
    });
    const evalBackfill = await backfillIdentityShadowEvaluations({
      lookbackHours,
    });
    const sampleChecks = await runIdentityArtifactSampleChecks({
      lookbackHours,
      sampleSize,
      limit,
    });
    const [promotionReview, recentSampleChecks, rolloutState] = await Promise.all([
      evaluateIdentityShadowPromotionCandidate({
        lookbackHours,
      }),
      listRecentIdentityArtifactSampleChecks({ limit: 4 }),
      inspectIdentityRolloutState({
        lookbackHours,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      backfill,
      warmup,
      evalBackfill,
      health: promotionReview.health,
      rolloutState,
      promotionReview,
      sampleChecks,
      recentSampleChecks,
    });
  } catch (error) {
    console.error("[api/cron/identity-student-monitor] execution failed:", error);
    const normalized = normalizeAIOpsError(
      error,
      "training_artifact_generation_failed",
    );
    const status =
      normalized.code === "service_role_unavailable" ||
      normalized.code === "db_connectivity_error" ||
      normalized.code === "pending_migration_missing_table" ||
      normalized.code === "pending_migration_missing_column"
        ? 503
        : 500;
    return NextResponse.json(toErrorBody(normalized), { status });
  }
}
