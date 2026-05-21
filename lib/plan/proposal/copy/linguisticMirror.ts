/**
 * Linguistic Mirror — Phase 3 Idea 29。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1b / §10.5 Smoke 49 (Linguistic Mirror)
 *
 * 設計意図:
 *   user の anchor title token を観測し、 proposal copy で **同じ token** を mirror。
 *
 * 例:
 *   user titles = ["ジム", "ジム行く", "ジム朝"]
 *   candidates = ["ジム", "運動", "エクササイズ"]
 *   → pickMirroredToken returns "ジム" (= NOT "運動")
 *
 *   user titles = ["gym", "workout", "early gym"]
 *   candidates = ["gym", "ジム", "workout"]
 *   → pickMirroredToken returns "gym" (= 英語反射)
 *
 * 不変原則:
 *   - Invariant 17 Internal data disclosure only: user 自身のデータからのみ
 *   - Invariant 34 No-AI-Subject Copy: AI 側の vocabulary 押し付け禁止
 *   - Invariant 4 privacy first: sensitive anchor は事前に除外して渡す (= 上流責任)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LinguisticMirrorInput {
  /**
   * 観測対象 anchor 群。
   *
   * 注意: sensitive 除外は **caller 責任**。
   * 本関数は受け取った anchor を全て title 観測対象とする。
   */
  readonly anchors: ReadonlyArray<ExternalAnchor>;

  /**
   * 候補 token (= 同義 / 翻訳ペア)。
   * 通常 2-4 個、 例: ["ジム", "運動", "gym"]。
   */
  readonly candidateTokens: ReadonlyArray<string>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Picker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 候補 token を user の anchor title 頻度で sort し、 最頻出 token を返す。
 *
 * 判定順:
 *   1. candidateTokens 空 → 空文字列
 *   2. 各 candidate に対し anchors.title 内の出現 anchor 数を count
 *   3. count desc + candidateTokens 順 (= 安定 sort、 同 count なら元順)
 *   4. count > 0 の最上位 token を返す
 *   5. 全 count 0 → 第一 candidate (= silent fallback)
 *
 * 計算量: O(N * M)、 N = anchors 数、 M = candidates 数。 通常 N < 100, M < 5、 軽量。
 */
export function pickMirroredToken(input: LinguisticMirrorInput): string {
  if (input.candidateTokens.length === 0) return "";

  const titles = input.anchors
    .map((a) => a.title)
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  const counts = input.candidateTokens.map((candidate, index) => {
    const count = titles.reduce((acc, title) => {
      return acc + (title.includes(candidate) ? 1 : 0);
    }, 0);
    return { candidate, count, index };
  });

  // sort: count desc、 同 count なら index asc (= 元順、 安定 sort 模倣)
  counts.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.index - b.index;
  });

  const top = counts[0];
  if (!top || top.count === 0) {
    // 観測ゼロ → 第一 candidate fallback (= silent fallback)
    return input.candidateTokens[0]!;
  }
  return top.candidate;
}
