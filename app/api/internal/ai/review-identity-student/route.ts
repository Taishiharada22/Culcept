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
  promoteIdentityShadowToChallenger,
  runIdentityArtifactSampleChecks,
  runIdentityShadowWarmup,
} from "@/lib/identity/studentOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewBody = {
  lookbackHours?: number;
  sampleSize?: number;
  limit?: number;
  backfillLimit?: number;
  warmupMaxActions?: number;
  action?: string;
  dryRun?: boolean;
  trafficWeight?: number;
  modelKey?: string;
  modelVersion?: string;
};

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function readInput(url: URL, body?: ReviewBody) {
  return {
    lookbackHours:
      parseNumber(body?.lookbackHours) ??
      parseNumber(url.searchParams.get("lookbackHours")),
    sampleSize:
      parseNumber(body?.sampleSize) ??
      parseNumber(url.searchParams.get("sampleSize")),
    limit:
      parseNumber(body?.limit) ??
      parseNumber(url.searchParams.get("limit")),
    backfillLimit:
      parseNumber(body?.backfillLimit) ??
      parseNumber(url.searchParams.get("backfillLimit")),
    warmupMaxActions:
      parseNumber(body?.warmupMaxActions) ??
      parseNumber(url.searchParams.get("warmupMaxActions")),
    action:
      (parseString(body?.action) ?? parseString(url.searchParams.get("action")) ?? "review").toLowerCase(),
    dryRun:
      parseBool(body?.dryRun) ?? parseBool(url.searchParams.get("dryRun")) ?? true,
    trafficWeight:
      parseNumber(body?.trafficWeight) ??
      parseNumber(url.searchParams.get("trafficWeight")),
    modelKey:
      parseString(body?.modelKey) ?? parseString(url.searchParams.get("modelKey")),
    modelVersion:
      parseString(body?.modelVersion) ??
      parseString(url.searchParams.get("modelVersion")),
  };
}

async function handle(request: Request, body?: ReviewBody) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(
      auth.reason ?? "unauthorized",
      "unauthorized",
    );
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const input = readInput(new URL(request.url), body);
    const backfill = await backfillIdentityTeacherOutputs({
      lookbackHours: input.lookbackHours,
      limit: input.backfillLimit,
    });
    const warmup = await runIdentityShadowWarmup({
      lookbackHours: input.lookbackHours,
      maxActions: input.warmupMaxActions,
    });
    const evalBackfill = await backfillIdentityShadowEvaluations({
      lookbackHours: input.lookbackHours,
    });
    const sampleChecks = await runIdentityArtifactSampleChecks({
      lookbackHours: input.lookbackHours,
      sampleSize: input.sampleSize,
      limit: input.limit,
    });
    const [promotionReview, recentSampleChecks, rolloutState] = await Promise.all([
      evaluateIdentityShadowPromotionCandidate({
        modelKey: input.modelKey,
        modelVersion: input.modelVersion,
        lookbackHours: input.lookbackHours,
      }),
      listRecentIdentityArtifactSampleChecks({ limit: 4 }),
      inspectIdentityRolloutState({
        lookbackHours: input.lookbackHours,
      }),
    ]);

    let mutation: { ok: boolean; updatedId?: string; error?: string } | null = null;
    if (input.action === "promote" && !input.dryRun) {
      if (!promotionReview.eligible) {
        const notEligible = normalizeAIOpsError(
          "candidate_not_eligible",
          "candidate_not_eligible",
        );
        return NextResponse.json(
          toErrorBody({
            ...notEligible,
            extra: { promotionReview, sampleChecks, recentSampleChecks },
          }),
          { status: 409 },
        );
      }

      mutation = await promoteIdentityShadowToChallenger({
        modelKey: promotionReview.candidate.modelKey,
        modelVersion: promotionReview.candidate.modelVersion,
        trafficWeight: input.trafficWeight ?? promotionReview.rolloutPlan.targetTrafficWeight,
        notes: "promoted via /api/internal/ai/review-identity-student",
      });

      if (!mutation.ok) {
        const normalized = normalizeAIOpsError(
          mutation.error ?? "promotion_mutation_failed",
          "promotion_mutation_failed",
        );
        return NextResponse.json(
          toErrorBody({
            ...normalized,
            extra: { promotionReview, sampleChecks, recentSampleChecks },
          }),
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      dryRun: input.dryRun,
      action: input.action,
      backfill,
      warmup,
      evalBackfill,
      health: promotionReview.health,
      rolloutState,
      promotionReview,
      sampleChecks,
      recentSampleChecks,
      mutation,
    });
  } catch (error) {
    console.error("[api/internal/ai/review-identity-student] execution failed:", error);
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

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ReviewBody;
  return handle(request, body);
}
