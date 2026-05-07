/**
 * errorTelemetry — OP-5.4.1 (CEO 2026-05-07)
 *
 * shadow path の internal error を **category enum に丸めて Sentry に明示 emit** する
 * pure helper。 OP-5.3.2 の silent ignore を **段階的に解除**する layer。
 *
 * 設計の核 — type-level boundary:
 *   raw error (= Error / unknown / any) を **入力にすら持たない**。
 *   caller は category 識別済みの literal を渡すのみ。
 *   raw error message / stack / cause / SQL / Supabase error は構造的に emit 不可。
 *
 *   raw error の object (= e: unknown)
 *           ↓
 *   [caller 側で各 step を try / catch して category 識別]
 *           ↓
 *   ShadowErrorCategory (= literal enum)
 *           ↓
 *   [emitShadowError(input)]
 *           ↓
 *   Sentry.captureMessage(`op5.shadow.error.${category}`)
 *
 *   この boundary で raw が Sentry payload に **絶対に流れない**。
 *
 * Sentry 採用理由 (CEO 2026-05-07):
 *   - breadcrumb 単独では event に添付されないと観測不可 → 不採用
 *   - captureMessage で category event を **明示送信**（= 観測値として残る）
 *   - Vercel stdout / console.* は採用しない (= raw 漏洩リスク高い)
 *
 * 規律 (OP-5.4.1):
 *   - raw error message / stack / cause を payload に含めない
 *   - SQL / Supabase / internal id を含めない
 *   - tags にも category enum のみ (= raw user_id / utterance を入れない)
 *   - emit 自体の failure は silent ignore (= caller への throw 伝播禁止)
 *   - flag off / allowlist 外では emit 呼ばれない (= shadowEntrypoint 側で gate 済み)
 *
 * scope:
 *   - errorTelemetry.ts (本 file): pure helper、 副作用は Sentry.captureMessage のみ
 *   - shadowEntrypoint.ts: 各 step を try / catch して本 helper を呼ぶ caller
 *   - 既存 redaction / shadowComparator / shadowOrchestrator / extractLegacySnapshot
 *     不変
 *
 * OP-5.4.1 で **やらないこと**:
 *   - success observation の emit (= OP-5.4.2 で別レビュー)
 *   - Vercel stdout / console.log 経由の emit (= 採用しない)
 *   - DB 永続化 / telemetry table (= OP-5.5 で別 phase)
 *   - production canary 起動 (= OP-5.5)
 */

import * as Sentry from "@sentry/nextjs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadow path 内で発生した error の category。
 *
 * - "orchestrator_error": runShadowOrchestrator throw (= factory / dispatcher)
 * - "extractor_error":    extractLegacySnapshot throw (= MorningPlan 変換)
 * - "comparator_error":   compareShadowVsLegacy throw (= 比較ロジック)
 * - "redaction_error":    redactShadowResult throw (= telemetry-safe 変換)
 * - "unknown":            上記分類に当てはまらない予期しない error
 */
export type ShadowErrorCategory =
  | "orchestrator_error"
  | "extractor_error"
  | "comparator_error"
  | "redaction_error"
  | "unknown";

/**
 * emit input。
 *
 * 規律: caller が category 識別済みの literal を渡すのみ。 raw error は入力にしない。
 */
export interface ShadowErrorTelemetryInput {
  category: ShadowErrorCategory;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry: emitShadowError
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadow path internal error を Sentry に emit する。
 *
 * 動作:
 *   - Sentry.captureMessage で category event を明示送信
 *   - level = "warning" (= production crash ではないが観測必要)
 *   - tags に category のみ含める (= raw 一切含まない)
 *
 * 規律:
 *   - 入力は category enum のみ (= raw error を渡せない型設計)
 *   - emit 自体の failure は silent ignore
 *   - return void (= caller は何も受け取らない)
 *   - DSN 未設定環境では Sentry SDK が internal で no-op
 *
 * @param input category 識別済みの input
 */
export function emitShadowError(input: ShadowErrorTelemetryInput): void {
  try {
    Sentry.captureMessage(`op5.shadow.error.${input.category}`, {
      level: "warning",
      tags: {
        op5_shadow_category: input.category,
      },
    });
  } catch {
    // emit 自体の failure は silent ignore
    // - caller への throw 伝播禁止
    // - raw error message を出さない (= caller が再 catch して infinite loop 防止)
  }
}
