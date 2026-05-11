/**
 * CoAlter D-2-e2 — three-stage scaffold ↔ MovieOrchestrator 互換 adapter
 *
 * 三段式 §6 M2 / handover §6 D-2-e / D-2-e2 設計レビュー (CEO 補正 6 点反映、
 * specifically 補正 1: movieOrchestrator.ts に寄せず別 file 分離).
 *
 * 役割:
 *   1. `COALTER_THREE_STAGE` flag ON 時に `runThreeStagePipeline` (D-2-e1) を
 *      **stub deps + placeholder lens** で起動する (CEO 厳禁: 実 fetcher / 実
 *      LLM / M0 lens 接続なし)
 *   2. `ThreeStagePipelineResult` を `MovieOrchestratorOutput` の 5 field shape
 *      に変換する (caller compatibility 維持)
 *
 * 設計原則 (D-2-e2 v2 §1 + CEO 補正 1〜3):
 *   - **adapter は別 file**: movieOrchestrator.ts は flag check + early return
 *     のみの最小 diff (CEO 補正 1)
 *   - **stub / placeholder は本 file 限定**: 4-layer pipeline / 他 domain には
 *     一切影響しない
 *   - **userArea = "" 固定**: ConversationAnalysis に area field 不在のため、
 *     型推測せず空文字で固定 (CEO 補正 2)
 *   - **shape 互換は test で verify**: caller 側 inspect 有無は不明、本 adapter
 *     では型上の互換性を担保し、test で MovieOrchestratorOutput 5 field を
 *     verify する (CEO 補正 3)
 *   - **type-only import で循環依存回避**: 本 file は movieOrchestrator の
 *     型のみ参照 (runtime 関数は参照しない)。movieOrchestrator は本 file の
 *     関数を runtime import するが、type 側は erase されるため runtime 循環なし
 *
 * D-2-e2 scope 厳守 (CEO 採用):
 *   - **実 fetcher 接続なし** (4 fetcher 全 `async () => []` stub)
 *   - **実 LLM 接続なし** (`async () => ""` stub)
 *   - **M0 lens 実接続なし** (placeholder lens、computedAt 固定値)
 *   - **3 candidate source なし** (全 `async () => []` stub)
 *   - **telemetry / console.info / persistence 追加なし**
 *   - **Production env 変更なし**
 *
 * 実接続 (実 candidate / 実 LLM / M0 lens) は **D-2-e3** で別 phase。
 * Step E (Production observation) は **D-2-e3 + Step E-0 の実接続レビュー後**
 * にしか起動できない。
 *
 * 凍結線整合 (handover §4.2):
 *   - import は D-2-e1 (`threeStagePipeline`) + 型のみ
 *   - webConnector / movieCatalog / movieRanker / narrationBuilder /
 *     narrationEnricher / foodOrchestrator / coalterDispatch / triggerDetection /
 *     emotion / understanding / presence / Alter Morning 系 touch なし
 */

import type {
  MovieOrchestratorInput,
  MovieOrchestratorOutput,
} from "../movieOrchestrator";
import type { ProposalCard, ProposalQualityRecord } from "../types";
import type {
  PersonalLens,
  TwoPersonLensToday,
  UserId,
} from "../understanding/types";
import {
  runThreeStagePipeline,
  type ThreeStagePipelineResult,
} from "./threeStagePipeline";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public API — runThreeStageScaffoldPath (flag ON 時の早期 return path)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * D-2-e2 flag ON path:
 *   1. placeholder lens を構築 (D-2-e3 で M0 実 lens に置換)
 *   2. userArea = "" 固定 (CEO 補正 2、型推測しない)
 *   3. stub deps で `runThreeStagePipeline` 起動 (D-2-e1 scaffold)
 *   4. 結果を `MovieOrchestratorOutput` 互換 shape に adapter で変換
 *
 * **stub / placeholder は本関数限定**。実接続は D-2-e3 で別 phase。
 */
export async function runThreeStageScaffoldPath(
  input: MovieOrchestratorInput,
  startedTotal: number,
): Promise<MovieOrchestratorOutput> {
  const lens = buildPlaceholderLensForScaffold();
  const userArea = ""; // CEO 補正 2: ConversationAnalysis.area 不在のため固定

  const result = await runThreeStagePipeline(
    { lens, userArea },
    {
      candidatePoolDeps: {
        rankingSource: async () => [],
        exaSource: async () => [],
        personalityHistorySource: async () => [],
      },
      llmClient: async () => "",
      resolverDeps: {
        officialFetcher: async () => [],
        eigaFetcher: async () => [],
        yahooFetcher: async () => [],
        exaFetcher: async () => [],
      },
    },
  );

  return adaptThreeStageResultToOrchestratorOutput(result, input, startedTotal);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Placeholder lens (D-2-e2 scaffold 限定、D-2-e3 で M0 接続予定)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * D-2-e2 scaffold 用 placeholder lens。
 *
 *   - 全 lens field 空 / 中立値
 *   - `computedAt` は固定値 (test 決定論)
 *   - D-1-d `buildPlaceholderLens` 流用ではなく独立に持つ理由: 凍結線整合
 *     (movieOrchestrator.ts touch 最小化)
 */
function buildPlaceholderLensForScaffold(): TwoPersonLensToday {
  const emptyPersonalLens: PersonalLens = {
    userId: "scaffold-placeholder" as UserId,
    displayName: "scaffold",
    coreDecisionPrinciples: [],
    currentEmotionalHue: "",
    todaySensitivities: [],
    comfortPathways: [],
    sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
  };
  return {
    personalLenses: { a: emptyPersonalLens, b: emptyPersonalLens },
    relationalLens: {
      temperature: "neutral",
      dominantDynamic: "",
      careAxes: [],
      avoidElements: [],
      interactionPace: "steady",
    },
    todayReading: {
      mode: "maintain",
      energyBudget: "mid",
      timeBudget: "limited",
      implicitIntent: "",
      latentNeeds: [],
      confidence: 0.5,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.5,
    dataGaps: [],
    computedAt: "1970-01-01T00:00:00.000Z",
    lensVersion: "1.0.0",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Adapter (ThreeStagePipelineResult → MovieOrchestratorOutput 5 field)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `ThreeStagePipelineResult` を `MovieOrchestratorOutput` 5 field shape に
 * 変換する。
 *
 *   - card: ProposalCard placeholder (D-2-e3 で実 narration へ置換予定)
 *   - telemetry: 既存 `ProposalQualityRecord` shape を空値 / 0 で満たす
 *   - ranked: `[]` (D-2-e2 stub 経路では実 candidate 不在)
 *   - primaryQuestion: `null` (本 path では未生成)
 *   - diagnostics: 7 field 互換 placeholder (全 0)
 *
 * **caller 側の inspect 挙動は test で verify** (CEO 補正 3、断定回避)。
 */
function adaptThreeStageResultToOrchestratorOutput(
  _result: ThreeStagePipelineResult,
  _input: MovieOrchestratorInput,
  startedTotal: number,
): MovieOrchestratorOutput {
  const card: ProposalCard = buildPlaceholderCard();
  const telemetry: Omit<ProposalQualityRecord, "sessionId" | "userAction"> = {
    briefSource: "parser_fallback",
    briefConfidence: 0,
    catalogCount: 0,
    rankedCount: 0,
    rankingAxesPreset: null,
    narrationMode: "logic_template",
    llmSuccessLayer0: false,
    llmSuccessLayer3: false,
    latencyMsTotal: Date.now() - startedTotal,
    latencyMsCatalog: 0,
    latencyMsRank: 0,
    latencyMsNarration: 0,
  };
  return {
    card,
    telemetry,
    ranked: [],
    primaryQuestion: null,
    diagnostics: {
      searchCandidatesCount: 0,
      catalogCount: 0,
      rankedCount: 0,
      missingWhereRejectCount: 0,
      titleWithoutTheaterCount: 0,
      staleReleaseRejectCount: 0,
      endedStatusCount: 0,
    },
  };
}

/** ProposalCard placeholder (D-2-e3 で実 narration 置換予定)。 */
function buildPlaceholderCard(): ProposalCard {
  return {
    summary: "",
    priorities: { userA: "", userB: "", common: null },
    candidates: [],
    reasoning: "",
    closing: "",
  };
}
