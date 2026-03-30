import "server-only";

import { NextResponse } from "next/server";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { runAutoEvalBatch } from "@/lib/ai/judge";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTaskTypes(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseNumber(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.trunc(value);
}

function parseBool(raw: string | null): boolean | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

export async function GET(request: Request) {
  const t = await trackCronRun("ai-auto-eval");
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(auth.reason ?? "unauthorized", "unauthorized");
    await t.finish({ ok: false, summary: "unauthorized" });
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const batchSize = parseNumber(url.searchParams.get("batch"));
    const lookbackHours = parseNumber(url.searchParams.get("lookbackHours"));
    const taskTypes = parseTaskTypes(url.searchParams.get("taskTypes"));
    const allowReeval = parseBool(url.searchParams.get("allowReeval"));
    const dryRun = parseBool(url.searchParams.get("dryRun"));

    const summary = await runAutoEvalBatch({
      batchSize,
      lookbackHours,
      taskTypes,
      allowReeval,
      dryRun,
    });

    await t.finish({ ok: true, summary: "ok" });
    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      ...summary,
    });
  } catch (error) {
    console.error("[api/cron/ai-auto-eval] execution failed:", error);
    await t.finish({ ok: false, summary: error instanceof Error ? error.message : "fatal" });
    const normalized = normalizeAIOpsError(error, "auto_eval_failed");
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
