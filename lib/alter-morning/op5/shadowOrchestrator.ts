/**
 * shadowOrchestrator — OP-5.1 (CEO 2026-05-06)
 *
 * OP-3A / OP-3B / OP-3C 系 factory 群と OP-4 candidateDispatcher を 1 関数で
 * 起動する **pure orchestrator**。 OP-5 shadow path の核。
 *
 * 重要規律 (OP-5.1):
 *   - **runtime に接続しない**:
 *       morningPipeline / route.ts / legacyAdapter から import されない。
 *       OP-5.1 では本 module は internal infra。 接続は OP-5.3 で扱う。
 *
 *   - **provided context のみ使用**:
 *       全 input は caller (= 将来の OP-5.3 で morningPipeline) から提供される。
 *       本 module 内で fetch / Supabase / Places / localStorage / browser API を
 *       一切呼ばない。
 *
 *   - **PlanState を書かない**:
 *       output は ShadowOrchestratorResult のみ。 既存 PlanState / response / UI /
 *       telemetry に影響しない。
 *
 *   - **telemetry 永続化なし** (OP-5.1):
 *       output に raw label が含まれる可能性があるが、 **OP-5.1 では永続化しない**。
 *       redaction layer は OP-5.2 で実装する。 caller は OP-5.1 段階では output を
 *       永続化しない責務を負う。
 *
 *   - **flag off 時の no-op**:
 *       本 module は flag を見ない。 起動可否は caller (= 将来の OP-5.3) が
 *       `shouldRunShadow()` で判定する。 本 module は呼ばれた前提で動作する。
 *
 *   - 既存 factory / dispatcher を変更しない (= 既存 9 factory + OP-4 dispatcher
 *     不変、 既存 source の grep 値で確認)。
 *
 *   - PR #75 系 (= fromToTravelEdgeReconciler / originAnchorExtractor /
 *     explicitAnchorExtractor) を import しない。
 *
 * 動作:
 *   1. provided input から各 factory を起動 (= 9 factory)
 *   2. 全 factory の出力 envelope を結合
 *   3. candidateDispatcher で reduce (= field 別 selected candidate を取得)
 *   4. ShadowOrchestratorResult を返す (= emittedCandidates + dispatchResult + meta)
 *
 * pure / deterministic:
 *   - input mutate しない
 *   - 同 input で同 output
 *   - 副作用なし (= telemetry emit / I/O / async なし)
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 5
 */

import type {
  PlanOperationCandidate,
  SetTargetDateOperationCandidate,
  AddTravelEdgeOperationCandidate,
  SetJourneyOriginOperationCandidate,
  SetJourneyEndOperationCandidate,
  ResolvePlaceCandidateOperationCandidate,
} from "../comprehension/planOperationCandidate";
import type { OperationEnvelope } from "../comprehension/operationEnvelope";
import type { Provenance } from "../comprehension/eventSchema";
import type { MorningPlan } from "../types";
import type { HomeAnchor } from "../planning/transportContext";

import {
  dispatchCandidates,
  type DispatchResult,
} from "../comprehension/candidateDispatcher";

import { regexTargetDateFactory } from "../comprehension/operationFactories/regexTargetDateFactory";
import { llmComprehensionTargetDateFactory } from "../comprehension/operationFactories/llmComprehensionTargetDateFactory";
import { historyPriorPlanFactory } from "../comprehension/operationFactories/historyPriorPlanFactory";
import { historyPreviousDayFactory } from "../comprehension/operationFactories/historyPreviousDayFactory";
import { locationAnchorFactory } from "../comprehension/operationFactories/locationAnchorFactory";
import { uiOriginAnswerFactory } from "../comprehension/operationFactories/uiOriginAnswerFactory";
import { travelEdgeFromToFactory } from "../comprehension/operationFactories/travelEdgeFromToFactory";
import { explicitDayOriginFactory } from "../comprehension/operationFactories/explicitDayOriginFactory";
import { explicitDayEndFactory } from "../comprehension/operationFactories/explicitDayEndFactory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public input
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadowOrchestrator への全入力。
 *
 * 規律: 全 field は caller (= 将来の OP-5.3 morningPipeline) が事前に取得する。
 * 本 module 内で fetch / Supabase / Places / browser API は **一切呼ばない**。
 */
export interface ShadowOrchestratorInput {
  // ─── 全 factory 共通 ───
  utterance: string;
  /** 抽出 turn (= trace 用) */
  sourceTurnIndex?: number;
  /** dispatcher で system_default 生成時の基準日 ("YYYY-MM-DD") */
  actualToday: string;

  // ─── OP-3A LLM targetDate factory 用 ───
  /** LLM が抽出した targetDate (= "today"/"tomorrow"/"YYYY-MM-DD"/null) */
  llmTargetDate?: string | null;
  /** LLM 抽出 provenance (= null なら factory は出さない、 既存規律踏襲) */
  llmTargetDateProvenance?: Provenance | null;

  // ─── OP-3B history factory 用 ───
  /** caller が事前取得した priorPlan (= 当日 plan の turn 跨ぎ継承) */
  priorPlan?: MorningPlan | null;
  /** priorPlan.date === currentPlanDate か (= 既存 preserveStrongPriorOrigin 規律) */
  samePlanDate?: boolean;
  /** caller が事前取得した previousDayPlan (= 前日 plan) */
  previousDayPlan?: MorningPlan | null;

  // ─── OP-3B location factory 用 ───
  /** caller が resolveHomeAnchor() で事前取得した値 */
  homeAnchor?: HomeAnchor | null;

  // ─── OP-3B UI origin answer factory 用 ───
  /** UI clarify answer raw string */
  clarifyAnswer?: string;
  /** pendingClarify slot */
  clarifySlot?:
    | "origin"
    | "end"
    | "where"
    | "when"
    | "what"
    | "transport"
    | "endpoint"
    | null;
  /** origin clarify active flag */
  isOriginClarifyActive?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public output
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadowOrchestrator の output。
 *
 * 規律: caller (= OP-5.1 では存在しない、 将来 OP-5.2 で comparator) は本 output を
 * 永続化する前に **redaction を適用する責務を負う**。 OP-5.1 では永続化なし。
 */
export interface ShadowOrchestratorResult {
  /**
   * 各 factory が emit した candidate envelope (= type 別に分類)。
   * candidateDispatcher の input 段階の値。
   */
  emittedCandidates: {
    targetDate: OperationEnvelope<SetTargetDateOperationCandidate>[];
    journeyOrigin: ReadonlyArray<
      | OperationEnvelope<SetJourneyOriginOperationCandidate>
      | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
    >;
    journeyEnd: ReadonlyArray<
      | OperationEnvelope<SetJourneyEndOperationCandidate>
      | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
    >;
    travelEdges: OperationEnvelope<AddTravelEdgeOperationCandidate>[];
  };

  /** candidateDispatcher の reduce 結果 (= field 別 selected) */
  dispatchResult: DispatchResult;

  /** 観測用 meta */
  meta: {
    /**
     * 起動した factory 名の一覧 (= 観測用)。
     * 例: ["regexTargetDate", "explicitDayOrigin", "travelEdgeFromTo"]
     */
    factoriesInvoked: ReadonlyArray<string>;
    /** orchestrator 全体の実行時間 (ms、 ms 解像度) */
    durationMs: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 factory 起動 + dispatcher reduce を実行する pure orchestrator。
 *
 * 動作:
 *   1. 9 factory を順次起動 (= 各 factory は input 不足なら空配列を返す)
 *   2. type 別に envelope を分類
 *   3. dispatchCandidates で reduce
 *   4. meta 付きで result を返す
 *
 * pure 規律 (= test で固定):
 *   - input mutate しない
 *   - 同 input で同 output (= deterministic)
 *   - factory / dispatcher 既存実装を変更しない (= read-only に呼ぶ)
 *   - PlanState / 既存 telemetry / UI に副作用なし
 *
 * @param input shadow path への全入力 (= caller が事前取得)
 * @returns ShadowOrchestratorResult
 */
export function runShadowOrchestrator(
  input: ShadowOrchestratorInput,
): ShadowOrchestratorResult {
  const startedAt = Date.now();

  const factoriesInvoked: string[] = [];

  // ─── OP-3A: targetDate ───
  const regexTd = regexTargetDateFactory({
    utterance: input.utterance,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("regexTargetDate");

  const llmTd = llmComprehensionTargetDateFactory({
    targetDate: input.llmTargetDate ?? null,
    provenance: input.llmTargetDateProvenance ?? null,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("llmComprehensionTargetDate");

  // ─── OP-3B: history / location / UI ───
  const priorPlanCands = historyPriorPlanFactory({
    priorPlan: input.priorPlan,
    samePlanDate: input.samePlanDate ?? false,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("historyPriorPlan");

  const previousDayCands = historyPreviousDayFactory({
    previousDayPlan: input.previousDayPlan,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("historyPreviousDay");

  const locationCands = locationAnchorFactory({
    homeAnchor: input.homeAnchor ?? null,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("locationAnchor");

  const uiOriginCands = uiOriginAnswerFactory({
    answer: input.clarifyAnswer ?? "",
    clarifySlot: input.clarifySlot ?? null,
    isOriginClarifyActive: input.isOriginClarifyActive ?? false,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("uiOriginAnswer");

  // ─── OP-3C: travel edge / day-origin / day-end ───
  const travelEdgeCands = travelEdgeFromToFactory({
    utterance: input.utterance,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("travelEdgeFromTo");

  const dayOriginCands = explicitDayOriginFactory({
    utterance: input.utterance,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("explicitDayOrigin");

  const dayEndCands = explicitDayEndFactory({
    utterance: input.utterance,
    sourceTurnIndex: input.sourceTurnIndex,
  });
  factoriesInvoked.push("explicitDayEnd");

  // ─── 全 envelope を集約 ───
  const allCandidates: OperationEnvelope<PlanOperationCandidate>[] = [
    ...regexTd,
    ...llmTd,
    ...priorPlanCands,
    ...previousDayCands,
    ...locationCands,
    ...uiOriginCands,
    ...travelEdgeCands,
    ...dayOriginCands,
    ...dayEndCands,
  ];

  // ─── dispatcher で reduce ───
  const dispatchResult = dispatchCandidates({
    candidates: allCandidates,
    actualToday: input.actualToday,
  });

  // ─── type 別に分類 (= emittedCandidates) ───
  const emittedCandidates = classifyCandidates(allCandidates);

  const durationMs = Date.now() - startedAt;

  return {
    emittedCandidates,
    dispatchResult,
    meta: {
      factoriesInvoked,
      durationMs,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * candidate envelope 集合を type 別に分類する pure helper。
 *
 * `resolve_place_candidate` は payload.slot で origin / end / where に振り分ける
 * (= dispatcher と同じ規律。 where は OP-3C 系で扱われていないが、 将来拡張で
 * other field に振り分ける可能性のため emittedCandidates では origin/end のみ
 * 取り扱う)。
 */
function classifyCandidates(
  candidates: OperationEnvelope<PlanOperationCandidate>[],
): ShadowOrchestratorResult["emittedCandidates"] {
  const targetDate: OperationEnvelope<SetTargetDateOperationCandidate>[] = [];
  const journeyOrigin: Array<
    | OperationEnvelope<SetJourneyOriginOperationCandidate>
    | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
  > = [];
  const journeyEnd: Array<
    | OperationEnvelope<SetJourneyEndOperationCandidate>
    | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
  > = [];
  const travelEdges: OperationEnvelope<AddTravelEdgeOperationCandidate>[] = [];

  for (const env of candidates) {
    if (env.type === "set_target_date") {
      targetDate.push(env);
    } else if (env.type === "set_journey_origin") {
      journeyOrigin.push(env);
    } else if (env.type === "set_journey_end") {
      journeyEnd.push(env);
    } else if (env.type === "add_travel_edge") {
      travelEdges.push(env);
    } else if (env.type === "resolve_place_candidate") {
      if (env.payload.slot === "origin") {
        journeyOrigin.push(env);
      } else if (env.payload.slot === "end") {
        journeyEnd.push(env);
      }
      // slot === "where" は emittedCandidates の対象外 (= dispatcher が
      // unhandled_slot_for_op4 として reject する範囲、 OP-5.1 では収集だけ skip)
    }
  }

  return { targetDate, journeyOrigin, journeyEnd, travelEdges };
}
