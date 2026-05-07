/**
 * observationAggregator — OP-5.4.2.2 (CEO 2026-05-07)
 *
 * shadow path success 時に `runShadowOrchestrator` / `compareShadowVsLegacy` /
 * `redactShadowResult` の各 output を集約し、 `ShadowObservationInput` に変換する
 * **pure helper**。
 *
 * 設計の核 — 責任分離:
 *   - shadowEntrypoint:        配線責任 (= flag/allowlist gate + try/catch + emit caller)
 *   - **observationAggregator (本 file)**: 集計責任 (= pure transform)
 *   - observationSink:         副作用責任 (= Sentry.captureMessage)
 *
 * pure (= test で固定):
 *   - input mutate なし
 *   - 同 input で同 output (= deterministic)
 *   - 副作用なし (= Sentry / console / fetch を呼ばない)
 *   - input/output 型整合のみで動作 (= I/O / async なし)
 *
 * 設計の核 — type-level boundary:
 *   shadowOrchestrator output (= raw label / payload / coords を内部に含む可能性)
 *   shadowComparator output   (= raw を含まない、 boolean / enum / count のみ)
 *   redaction output          (= raw を含まない、 OP-5.2 で固定済)
 *           ↓
 *   [buildShadowObservationInput()] ← 本 helper、 envelope の `count` と `source` enum
 *                                     **のみ**を読み、 raw label / payload は読まない
 *           ↓
 *   ShadowObservationInput (= raw 持てない型、 OP-5.4.2.1 で固定済)
 *
 * raw 漏洩防止 (OP-5.2 / OP-5.4.2.1 boundary 継承):
 *   1. **入力**: orchestrator output から **`length` と `env.source` enum literal のみ**
 *      参照する (= `env.payload.label` / `env.trace.matchedSpan` /
 *      `env.provenance.source_span` / utterance / coords は **読まない**)
 *   2. **出力**: ShadowObservationInput の型は OP-5.4.2.1 で raw を持てない型として
 *      固定済 (= number / boolean / enum literal のみ)
 *   3. caller (= shadowEntrypoint) は本 helper の output をそのまま emitShadowObservation
 *      に渡す (= 中間で raw を追加する余地なし)
 *
 * OperationSource 既存 enum 厳守 (CEO 補正):
 *   既存 OperationSource enum (= operationEnvelope.ts で定義済 8 値) を **そのまま**
 *   bySource counts として count する。 「llm」「regex」「deterministic」 等の
 *   勝手な集約分類は作らない。 1 to 1 mapping。
 *
 * scope (OP-5.4.2.2):
 *   - 集計 pure helper のみ
 *   - shadowEntrypoint からの呼び出しは shadowEntrypoint.ts 側で wiring
 *   - emit 自体は observationSink の責任 (= 本 file は emit しない)
 *
 * **やらないこと** (= scope 外、 stop 条件):
 *   - reject reason counts の追加 (= ShadowObservationInput 型変更を回避)
 *   - shadow path 全体 duration 測定 (= 同上)
 *   - priority bucket / confidence / ruleId tags の追加 (= 同上)
 *   - LLM 用の新 tag (= OP-5.4.2.3 別レビュー)
 *   - raw payload の transit
 */

import type { OperationEnvelope, OperationSource } from "../comprehension/operationEnvelope";
import type { PlanOperationCandidate } from "../comprehension/planOperationCandidate";
import type { ShadowOrchestratorResult } from "./shadowOrchestrator";
import type { ShadowComparison } from "./shadowComparator";
import type {
  RedactedSummaryObservation,
  RedactedVerboseObservation,
} from "./redaction";
import type {
  ShadowObservationInput,
  ShadowEmittedCountsBySource,
} from "./observationSink";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helper: bySource counts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既存 OperationSource enum 8 値ごとに envelope 数を count する pure helper。
 *
 * 規律 (CEO 補正):
 *   - 既存 OperationSource enum を **そのまま**保持 (= 1 to 1 mapping)
 *   - 「llm」「regex」「deterministic」 等の **勝手な分類は作らない**
 *   - exhaustive switch (= 8 値網羅、 TypeScript の網羅検査で型安全)
 *
 * raw 読まない:
 *   - `env.source` (= enum literal) のみ参照
 *   - `env.payload` / `env.trace` / `env.provenance` は読まない
 */
function aggregateBySource(
  result: ShadowOrchestratorResult,
): ShadowEmittedCountsBySource {
  const counts: ShadowEmittedCountsBySource = {
    llmExplicit: 0,
    llmInferred: 0,
    regexDeterministic: 0,
    codeHistory: 0,
    codeLocation: 0,
    uiAction: 0,
    callerRequest: 0,
    systemDefault: 0,
  };

  // 全 type の envelope を 1 配列に集める (= count のみ目的、 raw は読まない)
  const all: ReadonlyArray<OperationEnvelope<PlanOperationCandidate>> = [
    ...result.emittedCandidates.targetDate,
    ...result.emittedCandidates.journeyOrigin,
    ...result.emittedCandidates.journeyEnd,
    ...result.emittedCandidates.travelEdges,
  ];

  for (const env of all) {
    const source: OperationSource = env.source;
    switch (source) {
      case "llm_explicit":
        counts.llmExplicit++;
        break;
      case "llm_inferred":
        counts.llmInferred++;
        break;
      case "regex_deterministic":
        counts.regexDeterministic++;
        break;
      case "code_history":
        counts.codeHistory++;
        break;
      case "code_location":
        counts.codeLocation++;
        break;
      case "ui_action":
        counts.uiAction++;
        break;
      case "caller_request":
        counts.callerRequest++;
        break;
      case "system_default":
        counts.systemDefault++;
        break;
      default: {
        // exhaustive check (= 既存 OperationSource enum 全 8 値網羅、
        //  追加された source があれば TypeScript compile error で検知)
        const _exhaustive: never = source;
        void _exhaustive;
      }
    }
  }

  return counts;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry: buildShadowObservationInput
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadow path success の集約結果から `ShadowObservationInput` を構築する pure 関数。
 *
 * 動作:
 *   - emittedCounts (= type 別 + bySource 8 値別 count) を集計
 *   - selectedSources を dispatcher result から transit
 *   - comparison (= legacy vs op5) を comparator output から transit
 *   - level / durationBucket を redacted から transit
 *
 * 規律 (= test で固定):
 *   - 入力 mutate しない (= pure)
 *   - 同 input で同 output (= deterministic)
 *   - Sentry / console / fetch を呼ばない
 *   - 入力 type に raw label / payload / coords があっても **読まない**
 *   - 出力 type は raw を持てない (= ShadowObservationInput、 OP-5.4.2.1 で固定済)
 *
 * @param result OP-5.1 shadowOrchestrator の output
 * @param comparison OP-5.2 shadowComparator の output (= raw 含まない)
 * @param redacted OP-5.2 redaction の output (= raw 含まない、 level "summary" or
 *                 "verbose")。 caller は level "none" 時 null チェック済み前提
 * @returns ShadowObservationInput (= raw 持てない型、 emitShadowObservation に渡せる)
 */
export function buildShadowObservationInput(
  result: ShadowOrchestratorResult,
  comparison: ShadowComparison,
  redacted: RedactedSummaryObservation | RedactedVerboseObservation,
): ShadowObservationInput {
  // ─── emittedCounts (= type 別 + bySource 8 値) ───
  const emittedCounts = {
    targetDate: result.emittedCandidates.targetDate.length,
    journeyOrigin: result.emittedCandidates.journeyOrigin.length,
    journeyEnd: result.emittedCandidates.journeyEnd.length,
    travelEdges: result.emittedCandidates.travelEdges.length,
    bySource: aggregateBySource(result),
  };

  // ─── selectedSources (= dispatcher 選択結果、 source enum or null) ───
  const selectedSources = {
    targetDate:
      result.dispatchResult.selectedTargetDateCandidate?.source ?? null,
    journeyOrigin:
      result.dispatchResult.selectedJourneyOriginCandidate?.source ?? null,
    journeyEnd:
      result.dispatchResult.selectedJourneyEndCandidate?.source ?? null,
  };

  // ─── comparison (= legacy vs op5、 boolean + MismatchCategory enum のみ) ───
  const comparisonInput = {
    targetDateMatch: comparison.targetDate.match,
    journeyOriginMatch: comparison.journeyOrigin.match,
    journeyOriginMismatchCategory: comparison.journeyOrigin.mismatchCategory,
    journeyEndMatch: comparison.journeyEnd.match,
    journeyEndMismatchCategory: comparison.journeyEnd.mismatchCategory,
    travelEdgesCountMatch: comparison.travelEdges.countMatch,
  };

  return {
    level: redacted.level,
    emittedCounts,
    selectedSources,
    comparison: comparisonInput,
    durationBucket: redacted.durationBucket,
  };
}
