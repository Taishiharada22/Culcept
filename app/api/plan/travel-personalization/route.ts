/**
 * GET /api/plan/travel-personalization — UX-6b-2b-1 real personalization read **caller 配管**（server・user-RLS）
 *
 * gate = **flag ∧ consent ∧ solo**（1つでも欠ければ snapshotReader を呼ばず null＝fixture fallback）。
 *
 * 厳守:
 *   - flag OFF（本番既定 `PLAN_TRAVEL_PERSONALIZATION_REAL_READ` 未設定）→ **404 inert**（real read 経路を出さない）。
 *   - **service_role 厳禁**: `supabaseServer()`（cookie auth・user-RLS）のみ。`supabaseAdmin` 不使用。
 *   - **production 不触**: staging link 中。production の axis は読まない（設計上 staging に axis なし）。
 *   - staging に axis なし → `getPersonalizationSnapshot` 空 snapshot → derive neutral → m2 drop → **null（no-op）**。
 *   - consent は client が local gate（6b-2a）。本 route は query `consent=1` で受け gate に含める（6b-2c で DB consent 化）。
 */

import { NextResponse, type NextRequest } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { resolveRealSoftPersonalization } from "@/lib/plan/travel/realPersonalizationGate";
import { createRealSnapshotReader } from "@/lib/plan/travel/realSnapshotReader";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // flag OFF（本番既定）→ 404 inert。real read 経路を一切出さない。
  if (!PLAN_FLAGS.travelPersonalizationRealRead) {
    return NextResponse.json({ softPersonalization: null }, { status: 404 });
  }

  const supabase = await supabaseServer(); // user-RLS（cookie auth・service_role 厳禁）
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ softPersonalization: null }, { status: 401 });
  }

  // consent（local-only・client が consent=1 を渡す）。solo 固定（companions は HOLD）。
  const consentGranted = req.nextUrl.searchParams.get("consent") === "1";
  const asOf = new Date().toISOString();
  const reader = createRealSnapshotReader(supabase, auth.user.id, asOf);

  // gate: flag（上で確認済み）∧ consent ∧ solo。gate false → reader 不実行。
  // gate true でも staging は axis なし → snapshot 空 → derive neutral → m2 drop → null（no-op）。
  const soft = await resolveRealSoftPersonalization(
    { flagEnabled: true, consentGranted, mode: "solo" },
    reader,
  );

  // null → client は fixture fallback（性格反映なし）。非 null → adapter に softPersonalization 注入可能。
  return NextResponse.json({ softPersonalization: soft });
}
