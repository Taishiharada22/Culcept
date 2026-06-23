/**
 * GET /api/plan/coalter/intelligence — CoAlter proposal engine live（**server・fixture 入力・display-safe**）
 *
 * 役割: CoAlter fixture session を travel engine に通し、**合意形成知性**（角度別提案 / 2 人適合 /
 *   なぜ / 却下理由 / 不確実性 / 確認 / 質問）の display-safe ViewModel を返す。
 *   engine は **server に留める**（private slot を扱う）。client へは VM（display-safe）のみ返す。
 *
 *   S2: さらに **demo personalization**（self の観測軸）を engine に注入し、提案順位を本人傾向で
 *   パーソナライズする＋ 2 人の噛み合わせ（説明レイヤ）を載せる。
 *
 * 厳守（production 安全）:
 *   - flag OFF（本番既定 `NEXT_PUBLIC_PLAN_COALTER_ENGINE_LIVE` 未設定）→ **404 inert**（live 経路を出さない）。
 *   - **fixture 入力のみ**（DB / Supabase / snapshotReader / personalization runtime / fetch / 外部 API なし）。**書き込みゼロ**。
 *     personalization は **demo 軸 fixture** を pure derive に通すだけ（実 DB の軸 read には踏み込まない＝M2-B 不可侵）。
 *   - self 軸のみ engine scoring（adapter が owner=participantIds[0] に限定）。partner 軸は説明レイヤ専用。
 *   - VM は personalization を `demo: true` 付きで返す（live 実データと誤認させない）。
 *   - gate = `{ fixtureAllowed: false }`（production-like）。events は構造化 surface 由来なので通る。
 *   - 距離 / 経路 / 時刻は engine が持たない（solver 未実装）→ VM は物理未確定を明示（捏造しない）。
 */

import { NextResponse, type NextRequest } from "next/server";

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import { derivePlanParams, deriveTravelTraits } from "@/lib/shared/personalization/derive";
import { mapPersonalizationToM2SoftPreference } from "@/lib/shared/travel/personalization-to-m2-soft-preference";
import {
  COALTER_PLAN_SESSION_FIXTURES,
  type CoAlterPlanMode,
} from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import { coalterSessionToTravelEvents } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionToTravelEvents";
import { buildCoAlterPairTraitReadout } from "@/app/(culcept)/plan/tabs/coalter/coalterPairTraitReadout";
import { buildCoAlterConflictForecast } from "@/app/(culcept)/plan/tabs/coalter/coalterConflictForecast";
import { buildCoAlterFairnessNudge } from "@/app/(culcept)/plan/tabs/coalter/coalterFairnessNudge";
import { COALTER_DEMO_FAIRNESS_LEDGER } from "@/app/(culcept)/plan/tabs/coalter/coalterFairnessFixture";
import { buildCoAlterRhythmFit } from "@/app/(culcept)/plan/tabs/coalter/coalterRhythmFit";
import { buildCoAlterMomentSurface } from "@/app/(culcept)/plan/tabs/coalter/coalterMomentSurface";
import { COALTER_DEMO_TIMELINE } from "@/app/(culcept)/plan/tabs/coalter/coalterMomentTimeline";
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

  // fixture session → 構造化 events（server pure・DB/書き込みなし）。
  const session = COALTER_PLAN_SESSION_FIXTURES[mode];
  const events = coalterSessionToTravelEvents(session);

  // S2: demo personalization。self 軸 → pure derive → bounded soft preference → engine 注入（順位に効く）。
  //   demo 軸 fixture を pure 関数に通すだけ（snapshotReader/DB/runtime なし）。
  const demo = COALTER_DEMO_PERSONALIZATION[mode];
  const selfPlanParams = derivePlanParams(demo.self);
  const selfTravelTraits = deriveTravelTraits(demo.self);
  const softPersonalization = mapPersonalizationToM2SoftPreference(selfPlanParams, selfTravelTraits);

  const result = buildTravelPlanDisplayResult(events, { fixtureAllowed: false }, { softPersonalization });

  // self + partner の demo 軸 → 2 人の一致点 readout（説明レイヤ・engine 順位には入らない）。
  const partnerName = session.participants[1]?.name ?? "お相手";
  const readout = buildCoAlterPairTraitReadout(demo.self, demo.partner, partnerName);

  // S4-1: 公平性台帳（demo・読み取りのみ・DB 書込なし）→ 「今回はどちらの番」。均衡/履歴なしは null。
  const fairness = buildCoAlterFairnessNudge(COALTER_DEMO_FAIRNESS_LEDGER, partnerName);

  // S3-1: 2 人が引っ張り合いやすい決定を摩擦順に検出 + 橋渡し（説明レイヤ・engine 順位には入らない）。
  const forecast = buildCoAlterConflictForecast(demo.self, demo.partner, partnerName);

  // S3-3: 2 人の energy_rhythm（充電↔消費）→ 二人に合う一日の構成的なかたち（材料不足は null）。
  const rhythm = buildCoAlterRhythmFit(demo.self, demo.partner, partnerName);

  // S3-2: 当日 demo タイムライン + 固定 nowMin で、次の負荷 moment の状態ケア一言を先回り。
  //   demo timeline（Date.now なし）+ demo 軸を pure 関数に通すだけ（DB/runtime なし）。
  const timeline = COALTER_DEMO_TIMELINE[mode];
  const moment = buildCoAlterMomentSurface(timeline.moments, timeline.nowMin, demo.self, demo.partner, partnerName);

  const vm = buildPlanIntelligenceLiveVM(result, {
    personalization: { demo: true, ...readout },
    fairnessNudge: fairness ? { demo: true, ...fairness } : null,
    conflictForecast: { demo: true, items: forecast.items },
    rhythmFit: rhythm ? { demo: true, ...rhythm } : null,
    momentSurface: moment ? { demo: true, ...moment } : null,
  });

  return NextResponse.json({ vm });
}
