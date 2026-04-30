/**
 * Stage 4 L4-e — Presence State API (flag OFF 既定で 503 / production 不変)
 *
 * 正本: layout plan v0.3 §7.5 / runtime contract §2.2
 *
 * 本 API は presenceExecutorEnabled flag ON 時のみ動作。flag OFF (既定) で全 request を
 * 503 (Service Unavailable) で reject。production behavior 不変原則を維持。
 *
 * GET /api/coalter/presence/state?pair_id=xxx — 現 SharedState fetch
 * PATCH /api/coalter/presence/state           — operation を broadcast
 *
 * RLS で pair_id 経由のメンバーのみ access 可 (migration §5)。
 *
 * NOTE: migration が未実行の状態では DB read/write が失敗する。本 phase は API 経路の
 * 凍結 + flag gate のみ、E2E は L4-l flip 時 (migration 実行後) に実施。
 */

import { NextResponse, type NextRequest } from "next/server";
import { COALTER_FLAGS } from "@/lib/coalter/flags";

export const runtime = "nodejs";

/**
 * flag OFF 時の共通 response (production 不変、503 で fail-fast)。
 */
function flagOffResponse() {
  return NextResponse.json(
    {
      error: "presence_executor_disabled",
      message:
        "CoAlter Presence executor is disabled (Stage 4 L4-l flip まで OFF)。",
    },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    return flagOffResponse();
  }

  const { searchParams } = new URL(req.url);
  const pairId = searchParams.get("pair_id");
  if (!pairId) {
    return NextResponse.json(
      { error: "missing_pair_id", message: "pair_id is required" },
      { status: 400 },
    );
  }

  // L4-l flip 時に Supabase fetch 経路を有効化 (本 phase は flag OFF で到達しない)
  return NextResponse.json(
    {
      error: "not_implemented_until_l4_l",
      message: "Supabase 経路は L4-l flip 時に CEO 別審議で有効化",
    },
    { status: 501 },
  );
}

export async function PATCH(req: NextRequest) {
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    return flagOffResponse();
  }

  // L4-l flip 時に Supabase update 経路を有効化
  void req; // 未使用警告を抑止
  return NextResponse.json(
    {
      error: "not_implemented_until_l4_l",
      message: "Supabase 経路は L4-l flip 時に CEO 別審議で有効化",
    },
    { status: 501 },
  );
}
