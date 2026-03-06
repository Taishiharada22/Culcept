import "server-only";

import { NextResponse } from "next/server";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { normalizeAIOpsError, toErrorBody } from "@/lib/ai/errors";
import { normalizeSmokeMode, runAISmokeTest } from "@/lib/ai/smokeTest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SmokeBody = {
  mode?: string;
  liveProvider?: boolean;
  mutate?: boolean;
};

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseMode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function readInput(url: URL, body?: SmokeBody) {
  const mode = normalizeSmokeMode(
    parseMode(body?.mode) ?? parseMode(url.searchParams.get("mode")),
  );

  const liveProvider =
    parseBool(body?.liveProvider) ??
    parseBool(url.searchParams.get("liveProvider")) ??
    false;

  const mutate =
    parseBool(body?.mutate) ??
    parseBool(url.searchParams.get("mutate")) ??
    false;

  return {
    mode,
    liveProvider,
    mutate,
  };
}

async function handle(request: Request, body?: SmokeBody) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    const unauthorized = normalizeAIOpsError(auth.reason ?? "unauthorized", "unauthorized");
    return NextResponse.json(toErrorBody(unauthorized), { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const input = readInput(url, body);

    const result = await runAISmokeTest(input);

    return NextResponse.json({
      authSource: auth.source,
      ...result,
    });
  } catch (error) {
    const normalized = normalizeAIOpsError(error, "smoke_test_failed");
    console.error("[api/internal/ai/smoke-test] execution failed:", error);
    return NextResponse.json(toErrorBody(normalized), { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SmokeBody;
  return handle(request, body);
}
