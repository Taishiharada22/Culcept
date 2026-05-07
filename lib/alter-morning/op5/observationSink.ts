/**
 * observationSink — OP-5.4.2.1 (CEO 2026-05-07)
 *
 * shadow path success observation を Sentry captureMessage で emit する
 * **runtime 未接続の sink helper** (= side-effect は Sentry.captureMessage のみに限定)。
 * raw utterance / raw label / raw user_id / coords / payload は **構造的に payload に
 * 流れない** (= type 設計で boundary)。
 *
 * 注: Sentry.captureMessage を呼ぶため厳密には pure 関数ではない。 ただし副作用は
 *      Sentry sink への emit のみに限定されており、 input mutate なし / return void /
 *      caller への throw 伝播なし (silent ignore) という規律を持つ。
 *
 * 設計の核 — type-level boundary:
 *   入力 ShadowObservationInput は **集計済 safe data のみ** (= number / boolean /
 *   既存 enum literal の組み合わせ)。 raw は型設計で持てない。
 *
 *   shadow result (= raw 含む)
 *           ↓
 *   [caller (= OP-5.4.2.2 で shadowEntrypoint) が redaction → 集計]
 *           ↓
 *   ShadowObservationInput (= raw 持てない型)
 *           ↓
 *   [emitShadowObservation(input)]   ← 入力に raw が無い型設計
 *           ↓
 *   Sentry.captureMessage(`op5.shadow.observation.${level}`)
 *
 * scope (OP-5.4.2.1):
 *   - emit pure helper のみ
 *   - **shadowEntrypoint 未接続** (= OP-5.4.2.2 で別レビュー)
 *   - **route.ts 未拡充** (= OP-5.4.2.3 で別レビュー、 LLM-derived input 拡充は scope 外)
 *   - **DB migration なし** (= OP-5.5 以降)
 *   - Vercel stdout / console.* なし
 *
 * Sentry 採用理由 (OP-5.4.1 pattern 継承):
 *   - captureMessage で event 明示送信 (= breadcrumb 単独不可)
 *   - DSN 未設定環境では SDK 内部で no-op (= dev / test safety)
 *   - tags は string 型のみ受け付ける (= count / boolean を String() 化)
 *
 * OperationSource 既存 enum 厳守 (CEO 補正):
 *   既存 OperationSource enum (= operationEnvelope.ts で定義済 8 値) を **そのまま**
 *   bySource counts として表現。 勝手な分類 (= "llm" / "regex" / "deterministic"
 *   等のグルーピング) を作らない。 既存 enum を 1 to 1 mapping。
 *
 * raw 漏洩防止 (OP-5.2 boundary 継承):
 *   - input type に raw 含まない (= type 設計)
 *   - sentinel 漏洩検査 (= test で固定)
 *   - JSON.stringify grep で raw 値検出 (= test)
 *   - tags は count / boolean / enum string のみ
 *   - extra / context / user / fingerprint / withScope は使用しない
 */

import * as Sentry from "@sentry/nextjs";
import type {
  OperationSource,
  OperationConfidence as _OperationConfidence,
} from "../comprehension/operationEnvelope";
import type { MismatchCategory } from "./shadowComparator";
import type { DurationBucket } from "./redaction";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public input — type-level boundary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既存 OperationSource enum 全 8 値を 1 to 1 mapping した bySource counts。
 *
 * 規律 (CEO 補正):
 *   - 既存 OperationSource enum を **そのまま**保持
 *   - 「llm」「regex」「deterministic」 等の **勝手な分類は作らない**
 *   - 既存 enum 名と camelCase 対応:
 *     llm_explicit       → llmExplicit
 *     llm_inferred       → llmInferred
 *     regex_deterministic → regexDeterministic
 *     code_history       → codeHistory
 *     code_location      → codeLocation
 *     ui_action          → uiAction
 *     caller_request     → callerRequest
 *     system_default     → systemDefault
 */
export interface ShadowEmittedCountsBySource {
  llmExplicit: number;
  llmInferred: number;
  regexDeterministic: number;
  codeHistory: number;
  codeLocation: number;
  uiAction: number;
  callerRequest: number;
  systemDefault: number;
}

/**
 * shadow path success observation の **集計済 safe input**。
 *
 * 規律:
 *   - 全 field が number / boolean / 既存 enum literal の組み合わせ
 *   - **raw utterance / raw label / raw user_id / coords / full payload は型設計で持てない**
 *   - caller (= OP-5.4.2.2 で shadowEntrypoint) は redaction 通過後の値のみ渡す
 */
export interface ShadowObservationInput {
  level: "summary" | "verbose";

  /** type 別 emitted candidate 数 + source 別 emitted candidate 数 */
  emittedCounts: {
    targetDate: number;
    journeyOrigin: number;
    journeyEnd: number;
    travelEdges: number;
    bySource: ShadowEmittedCountsBySource;
  };

  /** dispatcher が field 別に選んだ candidate の source (= existing OperationSource enum or null) */
  selectedSources: {
    targetDate: OperationSource | null;
    journeyOrigin: OperationSource | null;
    journeyEnd: OperationSource | null;
  };

  /** legacy vs op5 比較結果 (= boolean / enum literal のみ) */
  comparison: {
    targetDateMatch: boolean;
    journeyOriginMatch: boolean;
    journeyOriginMismatchCategory: MismatchCategory;
    journeyEndMatch: boolean;
    journeyEndMismatchCategory: MismatchCategory;
    travelEdgesCountMatch: boolean;
  };

  /** 実行時間 bucket (= 既存 DurationBucket enum) */
  durationBucket: DurationBucket;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry: emitShadowObservation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadow path success observation を Sentry に明示 emit する。
 *
 * 動作:
 *   - Sentry.captureMessage で `op5.shadow.observation.<level>` event 送信
 *   - level = "info" (= error と区別)
 *   - tags に集計値のみ (= raw 一切含まない)
 *
 * 規律:
 *   - 入力 type に raw が含まれない (= type 設計 boundary)
 *   - emit 自体の failure は silent ignore (= caller への throw 伝播禁止)
 *   - return void
 *   - DSN 未設定環境では Sentry SDK が internal で no-op
 *
 * @param input 集計済 safe input
 */
export function emitShadowObservation(input: ShadowObservationInput): void {
  try {
    Sentry.captureMessage(`op5.shadow.observation.${input.level}`, {
      level: "info",
      tags: {
        // ─── per-type counts ───
        op5_emit_count_target_date: String(input.emittedCounts.targetDate),
        op5_emit_count_journey_origin: String(input.emittedCounts.journeyOrigin),
        op5_emit_count_journey_end: String(input.emittedCounts.journeyEnd),
        op5_emit_count_travel_edges: String(input.emittedCounts.travelEdges),

        // ─── by-source counts (= existing OperationSource enum 1 to 1) ───
        op5_emit_count_llm_explicit: String(input.emittedCounts.bySource.llmExplicit),
        op5_emit_count_llm_inferred: String(input.emittedCounts.bySource.llmInferred),
        op5_emit_count_regex_deterministic: String(input.emittedCounts.bySource.regexDeterministic),
        op5_emit_count_code_history: String(input.emittedCounts.bySource.codeHistory),
        op5_emit_count_code_location: String(input.emittedCounts.bySource.codeLocation),
        op5_emit_count_ui_action: String(input.emittedCounts.bySource.uiAction),
        op5_emit_count_caller_request: String(input.emittedCounts.bySource.callerRequest),
        op5_emit_count_system_default: String(input.emittedCounts.bySource.systemDefault),

        // ─── selected source per field ───
        op5_selected_target_date_source: input.selectedSources.targetDate ?? "null",
        op5_selected_journey_origin_source: input.selectedSources.journeyOrigin ?? "null",
        op5_selected_journey_end_source: input.selectedSources.journeyEnd ?? "null",

        // ─── matches (= legacy vs op5) ───
        op5_match_target_date: String(input.comparison.targetDateMatch),
        op5_match_journey_origin: String(input.comparison.journeyOriginMatch),
        op5_match_journey_end: String(input.comparison.journeyEndMatch),
        op5_match_travel_edges: String(input.comparison.travelEdgesCountMatch),

        // ─── mismatch categories (= existing MismatchCategory enum) ───
        op5_journey_origin_mismatch: input.comparison.journeyOriginMismatchCategory,
        op5_journey_end_mismatch: input.comparison.journeyEndMismatchCategory,

        // ─── duration bucket (= existing DurationBucket enum) ───
        op5_duration_bucket: input.durationBucket,
      },
    });
  } catch {
    // emit 自体の failure は silent ignore (OP-5.4.1 pattern 継承)
    // - caller への throw 伝播禁止
    // - raw error message を出さない
  }
}
