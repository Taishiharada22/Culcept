import "server-only";

import { NextResponse } from "next/server";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { runPromotionReviewBatch } from "@/lib/ai/promotion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNumber(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(auth.reason ?? "unauthorized", "unauthorized");
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const lookbackHours = parseNumber(url.searchParams.get("lookbackHours"));

    const summary = await runPromotionReviewBatch({
      lookbackHours,
    });

    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      ...summary,
    });
  } catch (error) {
    console.error("[api/cron/ai-promotion-review] execution failed:", error);
    const normalized = normalizeAIOpsError(error, "promotion_review_cron_failed");
    const status =
      normalized.code === "db_connectivity_error" ||
      normalized.code === "service_role_unavailable" ||
      normalized.code === "pending_migration_missing_table" ||
      normalized.code === "pending_migration_missing_column"
        ? 503
        : 500;
    return NextResponse.json(toErrorBody(normalized), { status });
  }
}
