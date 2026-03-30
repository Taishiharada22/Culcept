import "server-only";

import { NextResponse } from "next/server";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import {
  bootstrapModelRegistry,
  checkModelRegistryReadable,
  type BootstrapModelRegistryInput,
} from "@/lib/ai/bootstrapModelRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BootstrapBody = {
  dryRun?: boolean;
  challengerEnabled?: boolean;
  championProvider?: "gemini";
  championModelKey?: string;
  championModelVersion?: string;
  championTaskTypes?: string[] | string;
  challengerProvider?: "gemini";
  challengerModelKey?: string;
  challengerModelVersion?: string;
  challengerTaskTypes?: string[] | string;
  challengerTrafficWeight?: number;
  challengerActive?: boolean;
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

function parseText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function parseProvider(value: unknown): "gemini" | undefined {
  const normalized = parseText(value)?.toLowerCase();
  if (normalized === "gemini") return normalized;
  return undefined;
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

function readInput(url: URL, body?: BootstrapBody): BootstrapModelRegistryInput {
  const dryRun =
    parseBool(body?.dryRun) ??
    parseBool(url.searchParams.get("dryRun")) ??
    true;

  const challengerEnabled =
    parseBool(body?.challengerEnabled) ??
    parseBool(url.searchParams.get("challengerEnabled")) ??
    false;

  return {
    dryRun,
    champion: {
      provider:
        parseProvider(body?.championProvider) ??
        parseProvider(url.searchParams.get("championProvider")),
      modelKey:
        parseText(body?.championModelKey) ??
        parseText(url.searchParams.get("championModelKey")),
      modelVersion:
        parseText(body?.championModelVersion) ??
        parseText(url.searchParams.get("championModelVersion")),
      taskTypes:
        parseTaskTypes(body?.championTaskTypes) ??
        parseTaskTypes(url.searchParams.get("championTaskTypes")),
    },
    challenger: {
      enabled: challengerEnabled,
      provider:
        parseProvider(body?.challengerProvider) ??
        parseProvider(url.searchParams.get("challengerProvider")),
      modelKey:
        parseText(body?.challengerModelKey) ??
        parseText(url.searchParams.get("challengerModelKey")),
      modelVersion:
        parseText(body?.challengerModelVersion) ??
        parseText(url.searchParams.get("challengerModelVersion")),
      taskTypes:
        parseTaskTypes(body?.challengerTaskTypes) ??
        parseTaskTypes(url.searchParams.get("challengerTaskTypes")),
      trafficWeight:
        parseNumber(body?.challengerTrafficWeight) ??
        parseNumber(url.searchParams.get("challengerTrafficWeight")),
      isActive:
        parseBool(body?.challengerActive) ??
        parseBool(url.searchParams.get("challengerActive")),
    },
  };
}

async function handle(request: Request, body?: BootstrapBody) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(auth.reason ?? "unauthorized", "unauthorized");
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const input = readInput(url, body);

    const [readability, result] = await Promise.all([
      checkModelRegistryReadable(),
      bootstrapModelRegistry(input),
    ]);

    if (!result.ok) {
      const normalized = normalizeAIOpsError(
        result.error ?? "bootstrap_failed",
        "bootstrap_failed",
      );
      return NextResponse.json(
        toErrorBody({
          ...normalized,
          extra: {
            authSource: auth.source,
            dryRun: result.dryRun,
            schemaMode: result.schemaMode,
            actions: result.actions,
            counts: result.counts,
            readability,
          },
        }),
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      authSource: auth.source,
      dryRun: result.dryRun,
      schemaMode: result.schemaMode,
      actions: result.actions,
      counts: result.counts,
      readability,
    });
  } catch (error) {
    const normalized = normalizeAIOpsError(error, "bootstrap_failed");
    console.error("[api/internal/ai/bootstrap-model-registry] execution failed:", error);
    return NextResponse.json(toErrorBody(normalized), { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as BootstrapBody;
  return handle(request, body);
}
