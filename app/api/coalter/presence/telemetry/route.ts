/**
 * Stage 4 L4-j — Telemetry collection endpoint (flag OFF で 503)
 *
 * 正本: layout plan v0.3 §7.10
 *
 * client → server で emit された TelemetryEvent を batch で受信。
 * flag OFF (既定) で 503 fail-fast (production 影響ゼロ)。
 */

import { NextResponse, type NextRequest } from "next/server";
import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { TELEMETRY_EVENT_TYPES } from "@/lib/coalter/presence/telemetryEvents";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    return NextResponse.json(
      {
        error: "presence_executor_disabled",
        message: "Telemetry collection disabled (flag OFF)",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const events = Array.isArray((body as { events?: unknown })?.events)
    ? (body as { events: unknown[] }).events
    : null;

  if (!events) {
    return NextResponse.json(
      { error: "events_required", message: "body.events must be an array" },
      { status: 400 },
    );
  }

  // schema validation: 各 event は type が固定 8 種のいずれか
  const accepted: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as { type?: string };
    if (
      typeof e?.type === "string" &&
      (TELEMETRY_EVENT_TYPES as ReadonlyArray<string>).includes(e.type)
    ) {
      accepted.push(i);
    }
  }

  // L4-l flip 時に実 sink (DB / PostHog) へ書き込む。本 phase は集計のみ。
  return NextResponse.json(
    {
      accepted: accepted.length,
      total: events.length,
      // flag ON でも本 phase は持続化未実装 (L4-l 別審議)
      persisted: false,
    },
    { status: 200 },
  );
}
