/**
 * Latency Tolerance Map — Phase 3 Idea 19。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1d / §10.4 Smoke 43
 *
 * 役割:
 *   anchor 別の punctuality 重要度 (= 遅刻許容度) を internal map で分類。
 *   既存 Calendar AI が全 anchor を同等扱いするのに対し、
 *   Aneurasync は anchor の社会的契約強度を内部化する。
 *
 * 分類 (= categorization only、 Phase 3-J では補正は出さない):
 *   - strict:   飛行機 / 新幹線 / 面接 / 病院 (= 遅刻許容ほぼゼロ)
 *   - tight:    会議 / 商談 (= 5 分以内の余裕)
 *   - flexible: 友人ランチ / カフェ (= 10-15 分の余裕)
 *   - none:     散歩 / フリー時間 (= 時刻拘束なし)
 *
 * Phase 3-J 内では分類のみ提供。
 * 実 Departure Correction は Phase 3-M で Arrival Risk Memory と join。
 *
 * 不変原則:
 *   - Invariant 12 LLM 呼ばない: table-based 推論
 *   - Invariant 28 Departure Correction is Suggestion: anchor.startTime は不変
 *
 * Phase 3-J vs Phase 3-M:
 *   - J:   inferLatencyTolerance(anchor) → "strict"/"tight"/"flexible"/"none" の分類のみ
 *   - M:   分類 + Arrival Risk Memory deviation → 出発時刻補正提示
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LatencyTolerance = "strict" | "tight" | "flexible" | "none";

export interface LatencyToleranceInput {
  readonly title?: string;
  readonly locationText?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mapping rules — strict 最優先
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface LatencyRule {
  readonly tolerance: LatencyTolerance;
  readonly keywords: ReadonlyArray<string>;
}

const LATENCY_RULES: ReadonlyArray<LatencyRule> = [
  // strict (= 不可逆 / 高重要)
  {
    tolerance: "strict",
    keywords: [
      "飛行機", "フライト", "flight",
      "新幹線", "shinkansen",
      "面接", "interview",
      "病院", "通院", "診察",
      "試験", "exam",
      "結婚式", "wedding",
    ],
  },
  // tight (= 仕事系)
  {
    tolerance: "tight",
    keywords: ["会議", "meeting", "商談", "打ち合わせ", "面談"],
  },
  // none (= 時刻自由)
  {
    tolerance: "none",
    keywords: ["散歩", "ストレッチ", "walk", "フリー", "free time", "自由時間"],
  },
  // flexible (= デフォルト寄り、 食事 / cafe 等は middle ground)
  {
    tolerance: "flexible",
    keywords: ["ランチ", "lunch", "ディナー", "dinner", "カフェ", "cafe", "飲み", "ヨガ", "yoga"],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inference
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_TOLERANCE: LatencyTolerance = "flexible";

/**
 * input から tolerance を推論。
 *
 * 判定順:
 *   1. title + locationText 結合
 *   2. LATENCY_RULES 順 (= strict から) で keyword match
 *   3. 最初の match を採用
 *   4. 未マッチ → "flexible" (= 中位 default)
 */
export function inferLatencyTolerance(input: LatencyToleranceInput): LatencyTolerance {
  const text = [input.title ?? "", input.locationText ?? ""].join(" ").toLowerCase();
  if (text.trim().length === 0) return DEFAULT_TOLERANCE;

  for (const rule of LATENCY_RULES) {
    if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
      return rule.tolerance;
    }
  }
  return DEFAULT_TOLERANCE;
}
