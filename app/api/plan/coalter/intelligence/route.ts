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
import { supabaseServer } from "@/lib/supabase/server";
import { getPersonalizationSnapshot } from "@/lib/shared/personalization/snapshotReader";
import type { PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import {
  COALTER_PLAN_SESSION_FIXTURES,
  type CoAlterPlanMode,
} from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { resolveCoAlterPersonalizationPair } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationResolver";
import { coalterSessionToTravelEvents } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionToTravelEvents";
import { buildCoAlterPairTraitReadout } from "@/app/(culcept)/plan/tabs/coalter/coalterPairTraitReadout";
import { buildCoAlterConflictForecast } from "@/app/(culcept)/plan/tabs/coalter/coalterConflictForecast";
import { buildCoAlterFairnessNudge } from "@/app/(culcept)/plan/tabs/coalter/coalterFairnessNudge";
import { COALTER_DEMO_FAIRNESS_LEDGER } from "@/app/(culcept)/plan/tabs/coalter/coalterFairnessFixture";
import { buildCoAlterRhythmFit } from "@/app/(culcept)/plan/tabs/coalter/coalterRhythmFit";
import { buildCoAlterMomentSurface } from "@/app/(culcept)/plan/tabs/coalter/coalterMomentSurface";
import { COALTER_DEMO_TIMELINE } from "@/app/(culcept)/plan/tabs/coalter/coalterMomentTimeline";
import { generateTravelItineraries } from "@/lib/coalter/travel/itinerary";
import {
  COALTER_DEMO_TRAVEL_SEEDS,
  COALTER_DEMO_PLACE_LABELS,
} from "@/app/(culcept)/plan/tabs/coalter/coalterTravelSeedFixture";
import { buildCoAlterTravelItineraryVM } from "@/app/(culcept)/plan/tabs/coalter/coalterTravelItineraryVM";
import {
  buildCoAlterSolverIntentOverride,
  mergeIntentOverridesConservative,
} from "@/app/(culcept)/plan/tabs/coalter/coalterSolverPersonalization";
import {
  COALTER_DEMO_REGRET_LEDGER,
  deriveNextTripConstraints,
  regretReflectionLabels,
  regretToIntentOverride,
} from "@/app/(culcept)/plan/tabs/coalter/coalterRegretLedger";
import { buildFitSubjectFromPair } from "@/app/(culcept)/plan/tabs/coalter/coalterFitBridge";
import { selectFittingEntities } from "@/app/(culcept)/plan/tabs/coalter/coalterFitSelection";
import { COALTER_DEMO_ENTITIES } from "@/app/(culcept)/plan/tabs/coalter/coalterTravelEntityCatalog";
import { buildPersonalizedTravelSeeds } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizedSeeds";
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

  // S2/P4: personalization 源を resolver で 1 点集約（**実読み swap 点**）。self 軸 → pure derive →
  //   bounded soft preference → engine 注入（順位に効く）。
  //   ★ 実データ接続（#9・本番）: PLAN_FLAGS.coalterPersonalizationRealRead を gate に、auth client +
  //     getPersonalizationSnapshot(viewer) を read して下の realSelf に渡すだけで全 downstream が実軸で動く
  //     （partner は M2-B/RLS で demo 固定）。staging は軸なし→null→demo（挙動不変）。本 fetch は #9 の作業。
  //   #9 実データ接続: flag ON のとき viewer 自身の実軸を user-RLS client で read（self のみ）。
  //   service_role 禁止・自 user の行のみ（RLS owner-gated）。partner は M2-B/RLS で demo 固定。
  //   flag OFF / 未認証 / 軸ゼロ / query error → null → demo フォールバック（挙動不変・退化なし）。
  let realSelf: PersonalizationSnapshot | null = null;
  if (PLAN_FLAGS.coalterPersonalizationRealRead) {
    try {
      const supabase = await supabaseServer();
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user) {
        realSelf = await getPersonalizationSnapshot(
          supabase,
          auth.user.id,
          new Date().toISOString(),
        );
      }
    } catch {
      realSelf = null; // fail-safe → demo
    }
  }
  const demo = resolveCoAlterPersonalizationPair(mode, { realSelf });
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

  // C6-A/B/C/D: travel mode のみ、既存 solver（generateTravelItineraries・無改修）で具体行程を解く
  //   → display-safe VM。daily は overnight 行程対象外 → null。書込/外部 API なし。
  //   C6-C/D: ペア性格で **場所を選別**（evaluateFit）→ seeds を絞る（calm→温泉/自然・bold→thrill）。
  //   C6-B: さらに **行程の形**（pace/同行/予算/詰め込み上限）を intent override でパーソナライズ。
  let travelItinerary = null;
  if (mode === "travel") {
    // ① 性格 fit で場所選別 → 採用 placeId 集合で seeds を絞る。
    const fitSubject = buildFitSubjectFromPair(demo.self, demo.partner);
    const fitting = selectFittingEntities(COALTER_DEMO_ENTITIES, fitSubject, {
      tripMode: "travel",
      tripIntent: "recovery",
    });
    const fittingIds = new Set(fitting.map((f) => f.placeRefId));
    const placeFiltered = buildPersonalizedTravelSeeds(COALTER_DEMO_TRAVEL_SEEDS, fittingIds);

    // ② 行程の形を intent override でパーソナライズ。
    //   P3: 後悔台帳（demo・read-only）→ 次回制約 → conservative に merge（前回の学びを反映）。
    const regretConstraints = deriveNextTripConstraints(COALTER_DEMO_REGRET_LEDGER);
    const intentOverride = mergeIntentOverridesConservative(
      buildCoAlterSolverIntentOverride(demo.self, demo.partner),
      regretToIntentOverride(regretConstraints),
    );
    const personalizedSeeds = {
      ...placeFiltered,
      intentOutput: {
        ...placeFiltered.intentOutput,
        ...(intentOverride.fatigueSignals ? { fatigueSignals: intentOverride.fatigueSignals } : {}),
        ...(intentOverride.budgetSignals ? { budgetSignals: intentOverride.budgetSignals } : {}),
      },
      ...(intentOverride.pairTogethernessOverride
        ? { pairTogethernessOverride: intentOverride.pairTogethernessOverride }
        : {}),
      ...(intentOverride.cognitiveLoadCeilingPerDay !== undefined
        ? { cognitiveLoadCeilingPerDay: intentOverride.cognitiveLoadCeilingPerDay }
        : {}),
    };
    travelItinerary = buildCoAlterTravelItineraryVM(
      generateTravelItineraries(personalizedSeeds),
      COALTER_DEMO_PLACE_LABELS,
      { regretReflection: regretReflectionLabels(regretConstraints) },
    );
  }

  const vm = buildPlanIntelligenceLiveVM(result, {
    personalization: { demo: true, ...readout },
    fairnessNudge: fairness ? { demo: true, ...fairness } : null,
    conflictForecast: { demo: true, items: forecast.items },
    rhythmFit: rhythm ? { demo: true, ...rhythm } : null,
    momentSurface: moment ? { demo: true, ...moment } : null,
    travelItinerary,
  });

  // selfReal: viewer 自身の実軸が engine に入ったか（additive・partner は常に demo）。
  //   true でも pair 出力の demo タグは partner が demo ゆえ維持（誤認防止）。UI 表示の精緻化は後続。
  return NextResponse.json({ vm, selfReal: realSelf !== null });
}
