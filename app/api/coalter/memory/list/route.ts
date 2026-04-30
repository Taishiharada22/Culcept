/**
 * Stage 4 B-3.1 — Memory list API endpoint
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.3 / Core UX v1.1 §10
 *
 * GET /api/coalter/memory/list?threadId={uuid}
 *   - flag OFF: 503 service_unavailable
 *   - missing threadId: 400 missing_thread_id
 *   - unauthorized (no session): 401
 *   - thread/pair not found: 404
 *   - not pair member: 403
 *   - DB error: 200 + items=[], degraded=true (UI 壊さない、CEO 指示)
 *   - success: 200 + { pairId, viewer: "user_a"|"user_b", items: MemoryItem[] }
 *
 * 不変原則 (B-3.1):
 *   - server-side route (anon key + cookie session = RLS 経由で gate)
 *   - threadId → coalter_pair_states.thread_id → pair_id 解決
 *   - pair member 判定: auth.uid() ∈ {user_a, user_b}
 *   - viewer 判定: server-side で確定し response に含める
 *   - expires_at < now の transient_summary は除外 (server-side filter)
 *   - visibility=internal_only は除外 (defense in depth、RLS で既に gate されているが二重防御)
 *   - error fallback: 500 ではなく 200 + degraded=true で UI 継続性を担保
 *
 * Realtime subscribe は本 route 範疇外 (B-3.4 で別 gate)。
 */

import { NextResponse, type NextRequest } from "next/server";

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * flag OFF 時の共通 response (production 不変、503 で fail-fast)。
 *
 * 既存 /api/coalter/presence/state と同じ pattern。
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

/**
 * MemoryItem の DB row → JS type 変換。
 *
 * DB column (snake_case) → JS field (camelCase) + timestamptz → epoch ms。
 */
interface MemoryItemRow {
  id: string;
  content: string;
  origin: string;
  certainty: string;
  visibility: string;
  mode_context: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

function mapRow(row: MemoryItemRow): {
  id: string;
  content: string;
  origin: string;
  certainty: string;
  visibility: string;
  modeContext: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
} {
  return {
    id: row.id,
    content: row.content,
    origin: row.origin,
    certainty: row.certainty,
    visibility: row.visibility,
    modeContext: row.mode_context,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    return flagOffResponse();
  }

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) {
    return NextResponse.json(
      { error: "missing_thread_id", message: "threadId is required" },
      { status: 400 },
    );
  }

  const supabase = await supabaseServer();

  // auth check (cookie session)
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: "unauthorized", message: "auth session required" },
      { status: 401 },
    );
  }
  const userId = authData.user.id;

  // pair lookup (RLS で pair member のみ取得可、外部 thread は null になる)
  const { data: pair, error: pairError } = await supabase
    .from("coalter_pair_states")
    .select("id, user_a, user_b")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (pairError) {
    return NextResponse.json(
      { error: "internal", message: "pair lookup failed" },
      { status: 500 },
    );
  }
  if (!pair) {
    return NextResponse.json(
      { error: "pair_not_found", message: "no pair for thread" },
      { status: 404 },
    );
  }

  // defense in depth: pair member の二重 check (RLS でも gate されている)
  const isMember = pair.user_a === userId || pair.user_b === userId;
  if (!isMember) {
    return NextResponse.json(
      { error: "forbidden", message: "not a pair member" },
      { status: 403 },
    );
  }

  const viewer: "user_a" | "user_b" =
    pair.user_a === userId ? "user_a" : "user_b";

  // memory items fetch
  // - RLS: 片側可視性 (user_a_only / user_b_only) を auth.uid() で gate (DB 側)
  // - 本 server-side filter:
  //     1. visibility != "internal_only" (defense in depth)
  //     2. expires_at IS NULL OR expires_at > now (transient_summary 自動消滅)
  // - order: created_at DESC (新しい順)
  const nowIso = new Date().toISOString();
  const { data: rows, error: itemsError } = await supabase
    .from("coalter_memory_items")
    .select(
      "id, content, origin, certainty, visibility, mode_context, created_at, updated_at, expires_at",
    )
    .eq("pair_id", pair.id)
    .neq("visibility", "internal_only")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false });

  if (itemsError) {
    // CEO 指示: error 時は空配列 fallback (UI 壊さない)
    return NextResponse.json({
      pairId: pair.id,
      viewer,
      items: [],
      degraded: true,
      error: "items_fetch_failed",
    });
  }

  const items = (rows ?? []).map(mapRow);

  return NextResponse.json({
    pairId: pair.id,
    viewer,
    items,
  });
}
