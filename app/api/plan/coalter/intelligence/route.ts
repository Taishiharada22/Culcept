/**
 * GET /api/plan/coalter/intelligence — C6-A-1 CoAlter proposal engine live（**server・fixture 入力・display-safe**）
 *
 * 役割: CoAlter fixture session を travel engine に通し、**合意形成知性**（角度別提案 / 2 人適合 /
 *   なぜ / 却下理由 / 不確実性 / 確認 / 質問）の display-safe ViewModel を返す。
 *   engine は **server に留める**（private slot を扱う）。client へは VM（display-safe）のみ返す。
 *
 * 厳守（production 安全）:
 *   - flag OFF（本番既定 `NEXT_PUBLIC_PLAN_COALTER_ENGINE_LIVE` 未設定）→ **404 inert**（live 経路を出さない）。
 *   - **fixture 入力のみ**（DB / Supabase / personalization runtime / fetch / 外部 API なし）。**書き込みゼロ**。
 *   - gate = `{ fixtureAllowed: false }`（production-like）。events は構造化 surface 由来なので通る
 *     （dev_fixture provenance ではない）。
 *   - 距離 / 経路 / 時刻は engine が持たない（solver 未実装）→ VM は物理未確定を明示（捏造しない）。
 */

import { NextResponse, type NextRequest } from "next/server";

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import {
  COALTER_PLAN_SESSION_FIXTURES,
  type CoAlterPlanMode,
} from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { coalterSessionToTravelEvents } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionToTravelEvents";
import { buildPlanIntelligenceLiveVM } from "@/app/(culcept)/plan/tabs/coalter/planIntelligenceLiveViewModel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // flag OFF（本番既定）→ 404 inert。live 経路を一切出さない。
  if (!PLAN_FLAGS.coalterEngineLive) {
    return NextResponse.json({ vm: null }, { status: 404 });
  }

  // mode（daily / travel）。未知値は daily（fixture が存在する安全側）。
  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode: CoAlterPlanMode = modeParam === "travel" ? "travel" : "daily";

  // fixture session → 構造化 events → engine（server pure・DB/書き込みなし）→ display-safe VM。
  const session = COALTER_PLAN_SESSION_FIXTURES[mode];
  const events = coalterSessionToTravelEvents(session);
  const result = buildTravelPlanDisplayResult(events, { fixtureAllowed: false });
  const vm = buildPlanIntelligenceLiveVM(result);

  return NextResponse.json({ vm });
}
