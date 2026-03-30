import "server-only";

import { NextResponse } from "next/server";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import {
  evaluateStargazerShadowPromotionCandidate,
  getStargazerStudentProgressTrends,
  listRecentStargazerArtifactSampleChecks,
  promoteStargazerShadowToChallenger,
} from "@/lib/stargazer/studentOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewBody = {
  modelKey?: string;
  modelVersion?: string;
  lookbackHours?: number;
  lookbackDays?: number;
  trafficWeight?: number;
  action?: string;
  dryRun?: boolean;
};

function parseString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
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
    modelKey:
      parseString(body?.modelKey) ?? parseString(url.searchParams.get("modelKey")),
    modelVersion:
      parseString(body?.modelVersion) ??
      parseString(url.searchParams.get("modelVersion")),
    lookbackHours:
      parseNumber(body?.lookbackHours) ??
      parseNumber(url.searchParams.get("lookbackHours")),
    lookbackDays:
      parseNumber(body?.lookbackDays) ??
      parseNumber(url.searchParams.get("lookbackDays")),
    trafficWeight:
      parseNumber(body?.trafficWeight) ??
      parseNumber(url.searchParams.get("trafficWeight")),
    action:
      (
        parseString(body?.action) ??
        parseString(url.searchParams.get("action")) ??
        "review"
      ).toLowerCase(),
    dryRun:
      parseBool(body?.dryRun) ??
      parseBool(url.searchParams.get("dryRun")) ??
      true,
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
    const review = await evaluateStargazerShadowPromotionCandidate({
      modelKey: input.modelKey,
      modelVersion: input.modelVersion,
      lookbackHours: input.lookbackHours,
    });
    const sampleChecks = await listRecentStargazerArtifactSampleChecks({ limit: 4 });
    const trends = await getStargazerStudentProgressTrends({
      lookbackDays: input.lookbackDays,
    });

    let mutation: { ok: boolean; updatedId?: string; error?: string } | null = null;
    if (input.action === "promote" && !input.dryRun) {
      if (!review.eligible) {
        const notEligible = normalizeAIOpsError(
          "candidate_not_eligible",
          "candidate_not_eligible",
        );
        return NextResponse.json(
          toErrorBody({
            ...notEligible,
            extra: { review, sampleChecks, trends },
          }),
          { status: 409 },
        );
      }

      mutation = await promoteStargazerShadowToChallenger({
        modelKey: review.candidate.modelKey,
        modelVersion: review.candidate.modelVersion,
        trafficWeight: input.trafficWeight ?? review.rolloutPlan.targetTrafficWeight,
        notes: "promoted via /api/internal/ai/review-stargazer-student",
      });

      if (!mutation.ok) {
        const normalized = normalizeAIOpsError(
          mutation.error ?? "promotion_mutation_failed",
          "promotion_mutation_failed",
        );
        return NextResponse.json(
          toErrorBody({
            ...normalized,
            extra: { review, sampleChecks, trends },
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
      review,
      sampleChecks,
      trends,
      mutation,
    });
  } catch (error) {
    console.error("[api/internal/ai/review-stargazer-student] execution failed:", error);
    const normalized = normalizeAIOpsError(error, "promotion_review_failed");
    const status =
      normalized.code === "service_role_unavailable" ||
      normalized.code === "db_connectivity_error" ||
      normalized.code === "model_registry_unavailable"
        ? 503
        : normalized.code === "shadow_model_not_configured" ||
            normalized.code === "shadow_model_ambiguous"
          ? 409
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
