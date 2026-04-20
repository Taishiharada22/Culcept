/**
 * POST /api/coalter/handoff-events — CoAlter 外部導線ハンドオフのイベントログ
 *
 * CoAlter Phase A (2026-04-18): bottom sheet の sheet_open / cta_tap /
 * alternative_tap / source_tap を観測して `coalter_handoff_events` に 1 行書く。
 *
 * 呼び出しは fire-and-forget 想定。本 API の失敗が UX を止めないよう、
 * クライアント側は結果を待たずに続行する。
 *
 * 設計メモ:
 *  - 認可: セッション所有者 (user_a または user_b) のみ書き込める。
 *    セッション lookup は anon (cookie auth) 経由で RLS を通す。
 *  - 書き込み: `coalter_handoff_events` の RLS は service_role のみ許可。
 *    観測ログなので supabaseAdmin で insert する。
 *  - Schema: migration 20260418110000 を参照。
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const EVENT_TYPES = new Set([
  "sheet_open",
  "cta_tap",
  "alternative_tap",
  "source_tap",
]);

// Phase B Commit 3 (2026-04-19): providerType を 5 分類に拡張
//   official / official_site / official_reservation_partner / third_party_listing / unknown
// 後方互換: 旧 "third_party" はイベント側で受け取っても silently 受け入れる
// （過去クライアントからの POST を弾かない）
const PROVIDER_TYPES = new Set([
  "official",
  "official_site",
  "official_reservation_partner",
  "third_party_listing",
  "unknown",
  // legacy compat
  "third_party",
]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

interface Body {
  sessionId?: string;
  candidateKey?: string | null;
  eventType?: string;
  theme?: string | null;
  providerType?: string | null;
  providerName?: string | null;
  url?: string | null;
  label?: string | null;
  confidence?: string | null;
}

function clampText(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const sessionId = body.sessionId?.trim();
    const eventType = body.eventType?.trim();

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });
    }
    if (!eventType || !EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ ok: false, error: "invalid eventType" }, { status: 400 });
    }

    // セッション所有者 (user_a / user_b) のみ書き込み可
    // pair_states 経由で user_a / user_b を引く
    const { data: session, error: sessionErr } = await supabase
      .from("coalter_sessions")
      .select("id, pair_state_id, coalter_pair_states(user_a, user_b)")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !session) {
      return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    }

    // supabase-js は nested select を単一 or 配列として返すことがある
    // （FK 解決の挙動差）。両方に対応する。
    const pairRaw = (session as unknown as {
      coalter_pair_states?:
        | { user_a: string; user_b: string }
        | { user_a: string; user_b: string }[]
        | null;
    }).coalter_pair_states;
    const pair = Array.isArray(pairRaw) ? pairRaw[0] ?? null : pairRaw ?? null;
    if (!pair || (pair.user_a !== user.id && pair.user_b !== user.id)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // provider_type / confidence の型揺れはサーバ側で null に正規化
    const providerType =
      body.providerType && PROVIDER_TYPES.has(body.providerType) ? body.providerType : null;
    const confidence =
      body.confidence && CONFIDENCE_LEVELS.has(body.confidence) ? body.confidence : null;

    const row = {
      session_id: sessionId,
      candidate_key: clampText(body.candidateKey ?? null, 200),
      event_type: eventType,
      theme: clampText(body.theme ?? null, 40),
      provider_type: providerType,
      provider_name: clampText(body.providerName ?? null, 80),
      url: clampText(body.url ?? null, 2048),
      label: clampText(body.label ?? null, 200),
      confidence,
      actor_user_id: user.id,
    };

    // RLS が service_role のみ許可 → supabaseAdmin で insert
    const { error: insertErr } = await supabaseAdmin
      .from("coalter_handoff_events")
      .insert(row);

    if (insertErr) {
      console.error("[CoAlter] handoff-events insert error:", insertErr);
      return NextResponse.json({ ok: false, error: "insert failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[CoAlter] handoff-events error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
