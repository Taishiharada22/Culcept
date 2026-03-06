import "server-only";

import { NextResponse } from "next/server";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import {
  compareModelPerformance,
  evaluatePromotionCandidate,
  promoteModelCandidate,
  type PromotionThresholds,
} from "@/lib/ai/promotion";
import {
  getEntryTrafficRole,
  isTaskTypeIncluded,
  listModelRegistryEntries,
} from "@/lib/ai/modelRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewBody = {
  taskType?: string;
  modelKey?: string;
  modelVersion?: string;
  lookbackHours?: number;
  minSampleSize?: number;
  minAvgScore?: number;
  minPassRate?: number;
  maxFallbackRate?: number;
  minPositiveFeedbackRate?: number;
  minFeedbackSampleSize?: number;
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

function buildThresholdOverrides(args: {
  minSampleSize?: number;
  minAvgScore?: number;
  minPassRate?: number;
  maxFallbackRate?: number;
  minPositiveFeedbackRate?: number;
  minFeedbackSampleSize?: number;
}): Partial<PromotionThresholds> {
  const overrides: Partial<PromotionThresholds> = {};

  if (typeof args.minSampleSize === "number") {
    overrides.min_sample_size = Math.trunc(args.minSampleSize);
  }
  if (typeof args.minAvgScore === "number") {
    overrides.min_avg_score = args.minAvgScore;
  }
  if (typeof args.minPassRate === "number") {
    overrides.min_pass_rate = args.minPassRate;
  }
  if (typeof args.maxFallbackRate === "number") {
    overrides.max_fallback_rate = args.maxFallbackRate;
  }
  if (typeof args.minPositiveFeedbackRate === "number") {
    overrides.min_positive_feedback_rate = args.minPositiveFeedbackRate;
  }
  if (typeof args.minFeedbackSampleSize === "number") {
    overrides.min_feedback_sample_size = Math.trunc(args.minFeedbackSampleSize);
  }

  return overrides;
}

async function resolveCandidate(args: {
  modelKey?: string;
  modelVersion?: string;
  taskType?: string;
}): Promise<
  | {
      ok: true;
      modelKey: string;
      modelVersion: string | undefined;
      source: "request" | "registry";
    }
  | {
      ok: false;
      error: string;
      detail?: unknown;
    }
> {
  if (args.modelKey) {
    return {
      ok: true,
      modelKey: args.modelKey,
      modelVersion: args.modelVersion,
      source: "request",
    };
  }

  const registry = await listModelRegistryEntries({ includeInactive: false, limit: 200 });
  if (!registry.ok) {
    return {
      ok: false,
      error: "model_registry_unavailable",
      detail: registry.error,
    };
  }

  const challengers = registry.rows.filter((row) => {
    if (getEntryTrafficRole(row) !== "challenger") return false;
    if (args.taskType && !isTaskTypeIncluded(row, args.taskType)) return false;
    return true;
  });

  if (challengers.length === 0) {
    return {
      ok: false,
      error: "challenger_not_found",
    };
  }

  if (challengers.length > 1) {
    return {
      ok: false,
      error: "challenger_ambiguous",
      detail: challengers.map((row) => ({
        modelKey: row.modelKey,
        modelVersion: row.modelVersion,
        taskTypes: row.taskTypes,
      })),
    };
  }

  const row = challengers[0];
  return {
    ok: true,
    modelKey: row.modelKey,
    modelVersion: row.modelVersion,
    source: "registry",
  };
}

function readInput(url: URL, body?: ReviewBody) {
  const taskType = parseString(body?.taskType) ?? parseString(url.searchParams.get("taskType"));
  const modelKey = parseString(body?.modelKey) ?? parseString(url.searchParams.get("modelKey"));
  const modelVersion =
    parseString(body?.modelVersion) ?? parseString(url.searchParams.get("modelVersion"));

  const lookbackHours =
    parseNumber(body?.lookbackHours) ?? parseNumber(url.searchParams.get("lookbackHours"));

  const action =
    (parseString(body?.action) ?? parseString(url.searchParams.get("action")) ?? "review").toLowerCase();

  const dryRun =
    parseBool(body?.dryRun) ?? parseBool(url.searchParams.get("dryRun")) ?? true;

  const thresholdOverrides = buildThresholdOverrides({
    minSampleSize:
      parseNumber(body?.minSampleSize) ?? parseNumber(url.searchParams.get("minSampleSize")),
    minAvgScore:
      parseNumber(body?.minAvgScore) ?? parseNumber(url.searchParams.get("minAvgScore")),
    minPassRate:
      parseNumber(body?.minPassRate) ?? parseNumber(url.searchParams.get("minPassRate")),
    maxFallbackRate:
      parseNumber(body?.maxFallbackRate) ?? parseNumber(url.searchParams.get("maxFallbackRate")),
    minPositiveFeedbackRate:
      parseNumber(body?.minPositiveFeedbackRate) ??
      parseNumber(url.searchParams.get("minPositiveFeedbackRate")),
    minFeedbackSampleSize:
      parseNumber(body?.minFeedbackSampleSize) ??
      parseNumber(url.searchParams.get("minFeedbackSampleSize")),
  });

  return {
    taskType,
    modelKey,
    modelVersion,
    lookbackHours,
    action,
    dryRun,
    thresholdOverrides,
  };
}

async function handle(request: Request, body?: ReviewBody) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(auth.reason ?? "unauthorized", "unauthorized");
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const input = readInput(url, body);

    const candidate = await resolveCandidate({
      modelKey: input.modelKey,
      modelVersion: input.modelVersion,
      taskType: input.taskType,
    });

    if (!candidate.ok) {
      const normalized = normalizeAIOpsError(candidate.error, "promotion_review_failed");
      const status =
        normalized.code === "model_registry_unavailable" ||
        normalized.code === "db_connectivity_error"
          ? 503
          : 409;
      return NextResponse.json(
        toErrorBody({
          ...normalized,
          detail: candidate.detail,
        }),
        { status },
      );
    }

    const review = await evaluatePromotionCandidate({
      modelKey: candidate.modelKey,
      modelVersion: candidate.modelVersion,
      taskType: input.taskType,
      lookbackHours: input.lookbackHours,
      thresholdOverrides: input.thresholdOverrides,
    });

    const comparison = await compareModelPerformance({
      taskType: input.taskType,
      challengerModelKey: candidate.modelKey,
      lookbackHours: input.lookbackHours,
    });

    const wantsPromotion = input.action === "promote";
    let mutation: {
      ok: boolean;
      promotedId?: string;
      demotedIds?: string[];
      error?: string;
    } | null = null;

    if (wantsPromotion && !input.dryRun) {
      if (!review.eligible) {
        const notEligible = normalizeAIOpsError("candidate_not_eligible");
        return NextResponse.json(
          toErrorBody({
            ...notEligible,
            extra: { review },
          }),
          { status: 409 },
        );
      }

      mutation = await promoteModelCandidate({
        modelKey: candidate.modelKey,
        modelVersion: candidate.modelVersion,
        taskType: input.taskType,
        notes: "promoted via /api/internal/ai/review-promotion",
      });

      if (!mutation.ok) {
        const mutationError = normalizeAIOpsError(
          mutation.error ?? "promotion_mutation_failed",
          "promotion_mutation_failed",
        );
        return NextResponse.json(
          toErrorBody({
            ...mutationError,
            extra: { review },
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
      candidate: {
        modelKey: candidate.modelKey,
        modelVersion: candidate.modelVersion ?? null,
        taskType: input.taskType ?? null,
        source: candidate.source,
      },
      review,
      comparison,
      mutation,
    });
  } catch (error) {
    console.error("[api/internal/ai/review-promotion] execution failed:", error);
    const normalized = normalizeAIOpsError(error, "promotion_review_failed");
    return NextResponse.json(toErrorBody(normalized), { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ReviewBody;
  return handle(request, body);
}
