import "server-only";

import { NextResponse } from "next/server";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { generateTrainingArtifact } from "@/lib/ai/trainingArtifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BodyShape = {
  taskTypes?: string[] | string;
  lookbackHours?: number;
  createdAfter?: string;
  createdBefore?: string;
  successOnly?: boolean;
  teacherOnly?: boolean;
  minEvalScore?: number;
  limit?: number;
  artifactType?: string;
  notes?: string;
};

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function parseTaskTypes(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
  }

  if (typeof value === "string") {
    const parsed = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
  }

  return undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function readFilters(url: URL, body?: BodyShape) {
  const taskTypes =
    parseTaskTypes(body?.taskTypes) ??
    parseTaskTypes(url.searchParams.get("taskTypes"));

  const lookbackHours =
    parseNumber(body?.lookbackHours) ??
    parseNumber(url.searchParams.get("lookbackHours"));

  const createdAfter =
    parseString(body?.createdAfter) ??
    parseString(url.searchParams.get("createdAfter"));

  const createdBefore =
    parseString(body?.createdBefore) ??
    parseString(url.searchParams.get("createdBefore"));

  const successOnly =
    parseBool(body?.successOnly) ??
    parseBool(url.searchParams.get("successOnly"));

  const teacherOnly =
    parseBool(body?.teacherOnly) ??
    parseBool(url.searchParams.get("teacherOnly"));

  const minEvalScore =
    parseNumber(body?.minEvalScore) ??
    parseNumber(url.searchParams.get("minEvalScore"));

  const limit = parseNumber(body?.limit) ?? parseNumber(url.searchParams.get("limit"));

  const artifactType =
    parseString(body?.artifactType) ??
    parseString(url.searchParams.get("artifactType"));

  const notes = parseString(body?.notes) ?? parseString(url.searchParams.get("notes"));

  return {
    taskTypes,
    lookbackHours,
    createdAfter,
    createdBefore,
    onlySuccessful: successOnly,
    onlyWithTeacher: teacherOnly,
    minEvalScore,
    limit,
    artifactType,
    notes,
  };
}

async function handle(request: Request, body?: BodyShape) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(auth.reason ?? "unauthorized", "unauthorized");
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const filters = readFilters(url, body);

    const result = await generateTrainingArtifact(filters);
    if (!result.ok) {
      const normalized = normalizeAIOpsError(
        result.error ?? "training_artifact_generation_failed",
        "training_artifact_generation_failed",
      );
      const status =
        normalized.code === "training_artifacts_disabled" ||
        normalized.code === "dataset_export_disabled"
          ? 403
          : normalized.code === "db_connectivity_error" ||
              normalized.code === "service_role_unavailable" ||
              normalized.code === "pending_migration_missing_table" ||
              normalized.code === "pending_migration_missing_column"
            ? 503
          : 500;

      return NextResponse.json(
        toErrorBody({
          ...normalized,
          extra: {
            enabled: result.enabled,
            rowsScanned: result.rowsScanned ?? 0,
          },
        }),
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      artifact: {
        id: result.summary?.id ?? null,
        type: result.summary?.artifactType ?? null,
        version: result.summary?.artifactVersion ?? null,
        rowCount: result.summary?.rowCount ?? 0,
        status: result.summary?.status ?? null,
        checksum: result.summary?.checksum ?? null,
        storeMode: result.summary?.storeMode ?? null,
        storagePath: result.summary?.storagePath ?? null,
        deduped: result.summary?.deduped ?? false,
      },
      rowsScanned: result.rowsScanned ?? 0,
    });
  } catch (error) {
    console.error("[api/internal/ai/generate-training-artifact] execution failed:", error);
    const normalized = normalizeAIOpsError(error, "training_artifact_generation_failed");
    return NextResponse.json(toErrorBody(normalized), { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as BodyShape;
  return handle(request, body);
}
