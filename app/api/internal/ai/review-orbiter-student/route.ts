import "server-only";

import { NextResponse } from "next/server";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import {
  backfillOrbiterTeacherOutputs,
  getOrbiterShadowHealthSummary,
  listRecentOrbiterArtifactSampleChecks,
  runOrbiterShadowWarmup,
  runOrbiterArtifactSampleChecks,
} from "@/lib/orbiter/studentOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewBody = {
  lookbackHours?: number;
  sampleSize?: number;
  limit?: number;
  backfillLimit?: number;
  warmupMaxActions?: number;
};

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
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
    const backfill = await backfillOrbiterTeacherOutputs({
      lookbackHours: input.lookbackHours,
      limit: input.backfillLimit,
    });
    const warmup = await runOrbiterShadowWarmup({
      lookbackHours: input.lookbackHours,
      maxActions: input.warmupMaxActions,
    });
    const sampleChecks = await runOrbiterArtifactSampleChecks({
      lookbackHours: input.lookbackHours,
      sampleSize: input.sampleSize,
      limit: input.limit,
    });
    const [health, recentSampleChecks] = await Promise.all([
      getOrbiterShadowHealthSummary({
        lookbackHours: input.lookbackHours,
      }),
      listRecentOrbiterArtifactSampleChecks({ limit: 4 }),
    ]);

    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      backfill,
      warmup,
      health,
      sampleChecks,
      recentSampleChecks,
    });
  } catch (error) {
    console.error("[api/internal/ai/review-orbiter-student] execution failed:", error);
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
