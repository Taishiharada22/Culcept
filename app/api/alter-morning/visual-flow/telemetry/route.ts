/**
 * POST /api/alter-morning/visual-flow/telemetry — W3-PR-13 M4
 *
 * 責務（意識的に薄く）:
 *   1. 認証（Supabase session 必須、anonymous 拒否）
 *   2. body を `validateVisualFlowClientPayload` で whitelist 検証
 *   3. server-side `user.id` で上書き（client 入力の user_id は信頼しない）
 *   4. `emitVisualFlowClientEventFromServer` に委譲（fire-and-forget）
 *
 * 本 route は **visual-flow 専用**（CEO decision #4）。
 * 汎用 telemetry endpoint にはしない。event 名・metadata shape は
 * discriminated union で厳格に検証。許可されない shape はすべて 400。
 *
 * dead-code 方針:
 *   M4 merge 後も MorningMapView は flag OFF default + key 未投入で render しない。
 *   → 本 route への到達は allowlist 登録ユーザーのみ（M5+ 以降）。
 *
 * 設計書: docs/alter-morning-pr13-visual-flow-rollout-plan.md
 */

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { validateVisualFlowClientPayload } from "@/lib/alter-morning/visualFlow/analytics";
import { emitVisualFlowClientEventFromServer } from "@/lib/alter-morning/visualFlow/analyticsServer";

export const runtime = "nodejs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. auth — session 必須 + anonymous 拒否
  let userId: string;
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || user.is_anonymous) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    userId = user.id;
  } catch {
    // supabase server client 組立て失敗は server 側の fault として 500
    return NextResponse.json({ error: "auth_unavailable" }, { status: 500 });
  }

  // 2. body parse + whitelist validation
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = validateVisualFlowClientPayload(rawBody);
  if (!result.ok) {
    // reason は client に返さない（internal shape 露出を避ける）
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // 3. server-side user.id で上書き + emit (fire-and-forget)
  //    trackStargazerEvent 内部で DB error を swallow するため、
  //    await して `ok` を確認するが、client へは 202 を返す（処理継続は非保証）。
  try {
    await emitVisualFlowClientEventFromServer({
      userId,
      payload: result.payload,
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "emit_failed" }, { status: 500 });
  }
}
