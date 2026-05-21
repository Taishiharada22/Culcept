/**
 * Day Mood v0 — Phase 3 Idea 11。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1e / §10.3 Smoke 29
 *
 * 役割:
 *   当日 anchor 統計から day 全体の重さを 3 段で推論。
 *   既存 Calendar AI は anchor 単位の推論のみ、 Aneurasync は day 単位の負荷推論。
 *
 *   - heavy:   anchor 5+ または work anchor 3+
 *   - light:   anchor 1-4 (且つ heavy 条件 不該当)
 *   - recovery: anchor 0 (= 予定なし日)
 *
 * Phase 3-J v0 制限:
 *   - anchor 数 + verb 統計のみ使用
 *   - movement (= W3-PR-10 TransportSegment) は Phase 3-K で接続
 *   - 直近 7 日 trend (= Inverse Mood Trend、 Idea 20) は Phase 3-K で実装
 *
 * 用途 (= Phase 3-J 内では):
 *   - Entropy Budget の auto-scale (= heavy day で budget -1 等、 別 commit で接続)
 *
 * 不変原則:
 *   - Invariant 17 Internal data disclosure only: user 自身の anchor のみ
 *   - Day Mood の UI 開示禁止 (= やらないこと 18、 internal only)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { inferAnchorVerb } from "./anchorVerbMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HEAVY_ANCHOR_COUNT_THRESHOLD = 5;
const HEAVY_WORK_COUNT_THRESHOLD = 3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DayMood = "heavy" | "light" | "recovery";

export interface DayMoodInput {
  /**
   * 当日の non-sensitive anchor 群。
   * sensitive 除外は caller 責任。
   */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inference
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 当日 anchor 統計から day mood を推論。
 *
 * 判定順:
 *   1. anchor 数 0       → recovery
 *   2. anchor 数 5+      → heavy
 *   3. work verb 数 3+   → heavy (= anchor 数 5 未満でも work 集中で heavy)
 *   4. その他            → light
 */
export function inferDayMood(input: DayMoodInput): DayMood {
  const count = input.anchors.length;
  if (count === 0) return "recovery";
  if (count >= HEAVY_ANCHOR_COUNT_THRESHOLD) return "heavy";

  const workCount = input.anchors.reduce((acc, a) => {
    const verb = inferAnchorVerb({ title: a.title, locationText: a.locationText });
    return acc + (verb === "work" ? 1 : 0);
  }, 0);

  if (workCount >= HEAVY_WORK_COUNT_THRESHOLD) return "heavy";
  return "light";
}

/**
 * day mood に応じた entropy budget 補正 (= heavy で -1pt)。
 *
 * 用途: Phase 3-J で proposal 生成時に Entropy Budget の auto-scale 入力として。
 */
export function entropyBudgetDelta(mood: DayMood): number {
  switch (mood) {
    case "heavy":
      return -1;
    case "recovery":
      return -Number.POSITIVE_INFINITY; // recovery day は proposal 0 (= Idea 11)
    case "light":
      return 0;
  }
}
