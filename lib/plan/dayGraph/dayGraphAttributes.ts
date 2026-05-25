/**
 * DayGraph Attributes — Phase 3-K (= K-1d)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.6 / §22.4
 *
 * 役割:
 *   anchors + eventNodes から day-level 集計を計算する pure helper。
 *
 * 不変原則:
 *   - pure / no side effects
 *   - existing inferDayMood 再利用
 *   - verbDistribution は AnchorVerb 全 7 値 (= "unknown" 含む) を key に持つ
 *   - LLM 不使用
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import type { AnchorVerb } from "./anchorVerbMap";
import {
  inferDayMood,
} from "./dayMood";
import {
  TIME_BUCKET_CANONICAL_ORDER,
  type DayGraphAttributes,
  type EventNode,
  type TimeBucket,
} from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AnchorVerb 全 7 値を 0 で初期化した Record を生成。
 * (= v1.1 §22.4、 全 key を含む)
 */
function emptyVerbDistribution(): Record<AnchorVerb, number> {
  return {
    eat: 0,
    work: 0,
    rest: 0,
    move: 0,
    care: 0,
    social: 0,
    unknown: 0,
  };
}

/**
 * anchorCount → density (= 設計 §4.6)。
 *
 * - 0-1: sparse
 * - 2-3: balanced
 * - 4+:  packed
 */
function computeDensity(anchorCount: number): "sparse" | "balanced" | "packed" {
  if (anchorCount <= 1) return "sparse";
  if (anchorCount <= 3) return "balanced";
  return "packed";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DayGraphAttributes を計算する。
 *
 * caller 責任:
 *   - anchors: 元の anchor 配列 (= dayMood 計算用、 K-1b で valid 化済が望ましい)
 *   - eventNodes: K-1b で生成済 EventNode 配列 (= verbDistribution / timeBucketCoverage 等の source)
 *
 * 規則:
 *   - dayMood は anchors から (= 既存 inferDayMood 仕様、 K では変えない)
 *   - anchorCount は eventNodes.length (= valid event のみ計上)
 *   - verbDistribution は eventNodes.verb から (= AnchorVerb 7 値全 key)
 *   - density は anchorCount から
 *   - timeBucketCoverage は eventNodes の timeBucket 集合
 *   - hasOverlap / hasSensitive は eventNodes 走査で判定
 */
export function computeDayGraphAttributes(input: {
  readonly date: string;
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  readonly eventNodes: ReadonlyArray<EventNode>;
}): DayGraphAttributes {
  const verbDistribution = emptyVerbDistribution();
  // 内部集約は Set で O(1) 重複排除、 最後に canonical Array 化 (= v1.2 §22.9、 JSON-safe)
  const timeBucketSet = new Set<TimeBucket>();
  let hasOverlap = false;
  let hasSensitive = false;

  for (const ev of input.eventNodes) {
    verbDistribution[ev.verb] += 1;
    timeBucketSet.add(ev.timeBucket);
    if (ev.overlapsWithNodeIds.length > 0) hasOverlap = true;
    if (ev.sensitive) hasSensitive = true;
  }

  // canonical order に従って Array 化 (= deterministic、 同 input → 同 output)
  const timeBucketCoverage: TimeBucket[] = TIME_BUCKET_CANONICAL_ORDER.filter(
    (b) => timeBucketSet.has(b),
  );

  const dayMood = inferDayMood({ anchors: input.anchors });

  return {
    date: input.date,
    dayMood,
    anchorCount: input.eventNodes.length,
    verbDistribution,
    density: computeDensity(input.eventNodes.length),
    timeBucketCoverage,
    hasOverlap,
    hasSensitive,
  };
}
