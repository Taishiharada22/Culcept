import "server-only";

import { NextResponse } from "next/server";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { exportAIDataset, toJsonl } from "@/lib/ai/exportDataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBool(raw: string | null): boolean | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

function parseNumber(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function parseTaskTypes(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseText(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(auth.reason ?? "unauthorized", "unauthorized");
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "json").trim().toLowerCase();

    const result = await exportAIDataset({
      taskTypes: parseTaskTypes(url.searchParams.get("taskTypes")),
      lookbackHours: parseNumber(url.searchParams.get("lookbackHours")),
      createdAfter: parseText(url.searchParams.get("createdAfter")),
      createdBefore: parseText(url.searchParams.get("createdBefore")),
      limit: parseNumber(url.searchParams.get("limit")),
      onlySuccessful: parseBool(url.searchParams.get("onlySuccessful")),
      onlyWithTeacher: parseBool(url.searchParams.get("onlyWithTeacher")),
      minEvalScore: parseNumber(url.searchParams.get("minEvalScore")),
    });

    if (!result.enabled) {
      return NextResponse.json(
        toErrorBody({
          code: "dataset_export_disabled",
          message: "Dataset export is disabled. Enable AI_EXPORT_ENABLED=true.",
        }),
        { status: 403 },
      );
    }

    console.info("[ai/export] dataset export executed", {
      rows: result.rows.length,
      scanned: result.totalRunsScanned,
      format,
    });

    if (format === "jsonl") {
      return new Response(toJsonl(result.rows), {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      totalRunsScanned: result.totalRunsScanned,
      rows: result.rows,
    });
  } catch (error) {
    console.error("[api/internal/ai/export-dataset] execution failed:", error);
    const normalized = normalizeAIOpsError(error, "export_dataset_failed");
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
