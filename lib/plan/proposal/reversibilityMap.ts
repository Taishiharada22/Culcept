/**
 * Reversibility Scoring — Phase 3 Idea 12 + Invariant 23。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.3 Self-Direction invariant 23 / §3.1 J-1d
 *
 * 役割:
 *   提案候補の 「取消可能性」 を internal score 化 (= 0-100)。
 *   既存 Calendar AI は全 proposal を同等扱いするが、 Aneurasync は
 *   不可逆性 (= 飛行機 / ホテル) を回避する。
 *
 * Scoring table:
 *   - 100: 散歩、 ストレッチ (= 数秒で取消可)
 *   -  70: カフェ、 ランチ (= 数分で取消可)
 *   -  40: ジム、 ヨガ (= 入会連動なら不可逆性あり)
 *   -  20: 美容院、 病院 (= 予約取消手間)
 *   -   0: 飛行機、 ホテル、 婚活 (= 不可逆 / 金銭リスク)
 *
 * Phase 3-J: score >= 50 のみ提案 (= MIN_PHASE3_J_REVERSIBILITY)。
 *   - 飛行機 / ホテル等は永久に対象外 (= 思想的禁止、 やらないこと 2)
 *
 * 不変原則:
 *   - Invariant 15 Confidence 非可視化: score は internal only、 user に見せない
 *   - Invariant 23 Reversibility >= 50 で Phase 3-J 提案 gate
 *   - Invariant 4 privacy first: sensitive 系は score 0 (= 強制不可逆扱い)
 */

import type { LocationCategory } from "@/lib/plan/location-category";
import type { AnchorSensitiveCategory } from "@/lib/plan/external-anchor";
import type { TestOverrideContext } from "./testOverrideContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const MIN_PHASE3_J_REVERSIBILITY = 50;
const DEFAULT_REVERSIBILITY = 60; // keyword 未マッチは中位

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scoring rules — keyword → score (= 高 score が先)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ReversibilityRule {
  readonly score: number;
  readonly keywords: ReadonlyArray<string>;
}

const REVERSIBILITY_RULES: ReadonlyArray<ReversibilityRule> = [
  // 100: 即時取消可
  { score: 100, keywords: ["散歩", "ストレッチ", "walk"] },
  // 70: 数分で取消可
  { score: 70, keywords: ["カフェ", "cafe", "ランチ", "lunch", "ディナー", "dinner", "朝食", "breakfast"] },
  // 40: 予約連動あり
  { score: 40, keywords: ["ジム", "gym", "ヨガ", "yoga", "プール", "pool"] },
  // 20: 予約取消手間
  { score: 20, keywords: ["美容院", "サロン", "美容", "脱毛", "spa", "マッサージ"] },
  { score: 20, keywords: ["病院", "通院", "診察", "歯医者"] },
  // 0: 不可逆
  { score: 0, keywords: ["飛行機", "フライト", "flight"] },
  { score: 0, keywords: ["ホテル", "宿泊", "hotel"] },
  { score: 0, keywords: ["婚活", "見合い"] },
  { score: 0, keywords: ["手術", "入院"] },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ReversibilityInput {
  readonly title?: string;
  readonly locationText?: string;
  readonly locationCategory?: LocationCategory;
  readonly sensitiveCategory?: AnchorSensitiveCategory;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * input から reversibility score (= 0-100) を計算。
 *
 * 判定順:
 *   1. sensitiveCategory がある → 0 (= 強制不可逆、 Phase 3-J 永久除外)
 *   2. keyword match → 対応 score (= 順序通り、 最初の match を採用)
 *   3. 未マッチ → DEFAULT_REVERSIBILITY (= 60)
 */
export function computeReversibilityScore(input: ReversibilityInput): number {
  if (input.sensitiveCategory != null) return 0;

  const text = [input.title ?? "", input.locationText ?? ""].join(" ").toLowerCase();
  if (text.trim().length === 0) return DEFAULT_REVERSIBILITY;

  for (const rule of REVERSIBILITY_RULES) {
    if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
      return rule.score;
    }
  }
  return DEFAULT_REVERSIBILITY;
}

/**
 * Phase 3-J 提案 threshold (= 50) を満たすか。
 * testOverride.forceReversibilityThreshold で固定可。
 */
export function meetsPhase3JReversibilityThreshold(
  score: number,
  testOverride?: TestOverrideContext,
): boolean {
  const threshold = testOverride?.forceReversibilityThreshold ?? MIN_PHASE3_J_REVERSIBILITY;
  return score >= threshold;
}
