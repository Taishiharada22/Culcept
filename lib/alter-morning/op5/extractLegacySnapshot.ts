/**
 * extractLegacySnapshot — OP-5.3.1 (CEO 2026-05-06)
 *
 * 既存 runtime (= legacyAdapter / morningPipeline) の `MorningPlan` を、 OP-5.2
 * shadowComparator が受ける `LegacyShadowSnapshot` に変換する **pure 関数**。
 *
 * 責務:
 *   - raw `MorningPlan` を comparator に **直接渡さない** boundary を確立
 *   - journeyOrigin / journeyEnd / travelEdges count / targetDate に絞った snapshot を作る
 *   - label field は内部参照のみ (= comparator boundary で出力に流れない、 OP-5.2 で固定)
 *
 * OP-5.3 規律:
 *   - **runtime に接続しない** (= morningPipeline / route / legacyAdapter から
 *     呼ばれない。 OP-5.3.3 で初めて接続される予定)
 *   - **PlanState に書き込まない** (= read-only)
 *   - input mutate しない (= pure)
 *   - 同 input で同 output (= deterministic)
 *   - flags.ts / shadowOrchestrator.ts / redaction.ts / shadowComparator.ts 不変
 *   - 既存 OP-3 系 factory 群 / OP-4 dispatcher 不変
 *   - PR #75 系 module 参照なし
 */

import type { MorningPlan } from "../types";
import type { LegacyShadowSnapshot } from "./shadowComparator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Empty snapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMPTY_SNAPSHOT: LegacyShadowSnapshot = {
  targetDate: null,
  journeyOriginKind: null,
  journeyOriginSource: null,
  journeyOriginLabel: null,
  journeyEndKind: null,
  journeyEndSource: null,
  journeyEndLabel: null,
  segmentsCount: 0,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `MorningPlan` を `LegacyShadowSnapshot` に変換する。
 *
 * null / undefined plan → 全 field null / 0 の empty snapshot。
 *
 * journeyOrigin / journeyEnd の kind による分岐:
 *   - `kind === "known_exact"` → kind / source / label を取り出す
 *   - `kind === "known_label_only"` → kind / source / label を取り出す
 *   - `kind === "unknown"` → kind のみ、 source / label は null
 *   - `undefined` → 全 null
 *
 * segmentsCount は plan.items のうち `kind === "travel"` のもの (= PlanItemKind 型より)。
 *
 * @param plan 既存 runtime の MorningPlan (= null / undefined 許容)
 * @returns LegacyShadowSnapshot
 */
export function extractLegacySnapshot(
  plan: MorningPlan | null | undefined,
): LegacyShadowSnapshot {
  if (!plan) {
    return { ...EMPTY_SNAPSHOT };
  }

  const origin = plan.journeyOrigin;
  const end = plan.journeyEnd;

  return {
    targetDate: plan.date ?? null,
    journeyOriginKind: origin?.kind ?? null,
    journeyOriginSource:
      origin && origin.kind !== "unknown" ? origin.source : null,
    journeyOriginLabel:
      origin && origin.kind !== "unknown" ? origin.label : null,
    journeyEndKind: end?.kind ?? null,
    journeyEndSource: end && end.kind !== "unknown" ? end.source : null,
    journeyEndLabel: end && end.kind !== "unknown" ? end.label : null,
    segmentsCount: plan.items
      ? plan.items.filter((item) => item.kind === "travel").length
      : 0,
  };
}
