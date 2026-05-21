/**
 * Anchor Verb Map — Phase 3 Idea 22。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1d / §7.4 Anchor Verb Glyph spec / §10.4 Smoke 44
 *
 * 役割:
 *   anchor.title + locationText から **生活の動詞** (= eat / work / rest / move / care / social) を抽出。
 *   既存 Calendar AI は title を 「文字列の塊」 扱い、 Aneurasync は **semantic 動詞** で扱う。
 *
 * 用途:
 *   - Phase 3-J 提案 priority (= rest verb の anchor は sacred time、 提案 0)
 *   - Phase 3-K Anchor Verb Glyph rendering (= 10px micro-icon)
 *   - Phase 3-K Day Mood 計算入力
 *
 * 不変原則:
 *   - Invariant 12 LLM 呼ばない: table-based 推論のみ
 *   - Invariant 17 Internal data disclosure only: user 自身の anchor のみ
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AnchorVerb =
  | "eat"
  | "work"
  | "rest"
  | "move"
  | "care"
  | "social"
  | "unknown";

export interface AnchorVerbInput {
  readonly title?: string;
  readonly locationText?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Verb mapping — 上から順、 最初の match を採用 (= specificity 高い順)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface VerbRule {
  readonly verb: AnchorVerb;
  readonly keywords: ReadonlyArray<string>;
}

// 順序設計:
//   care / rest が最優先 (= sensitive 隣接 / sacred 系)。
//   その後 eat / social / work / move の順。
//   move は最後 (= 「ランチ」 と 「ラン」 の substring 衝突を回避)。
const VERB_RULES: ReadonlyArray<VerbRule> = [
  // care (= 医療 / 美容、 sensitive 隣接、 最優先 match)
  {
    verb: "care",
    keywords: ["病院", "通院", "診察", "歯医者", "マッサージ", "美容", "サロン", "spa", "脱毛"],
  },
  // rest (= sacred time、 提案禁止)
  {
    verb: "rest",
    keywords: ["寝る", "睡眠", "rest", "休む", "お休み", "nap", "仮眠"],
  },
  // eat (= 飲食、 「ランチ」 を move より先に判定)
  {
    verb: "eat",
    keywords: ["ランチ", "lunch", "ディナー", "dinner", "朝食", "breakfast", "飲み", "カフェ", "cafe", "食事"],
  },
  // social (= 対人)
  {
    verb: "social",
    keywords: ["友達", "飲み会", "デート", "date", "party", "パーティ", "誕生日"],
  },
  // work (= 仕事系)
  {
    verb: "work",
    keywords: ["会議", "meeting", "打ち合わせ", "商談", "面談", "interview", "面接", "仕事", "work"],
  },
  // move (= 運動、 最後 = 「ラン」 単独 keyword を除外して 「ランニング」 等に絞る)
  {
    verb: "move",
    keywords: ["ジム", "gym", "ヨガ", "yoga", "プール", "走", "ランニング", "run", "散歩", "walk", "ストレッチ"],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inference
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * input から動詞を推論。
 *
 * 判定順:
 *   1. title + locationText を結合
 *   2. VERB_RULES 順に keyword match
 *   3. 最初の match を採用
 *   4. 未マッチ → "unknown" (= glyph 非表示、 verb-based logic は skip)
 */
export function inferAnchorVerb(input: AnchorVerbInput): AnchorVerb {
  const text = [input.title ?? "", input.locationText ?? ""].join(" ").toLowerCase();
  if (text.trim().length === 0) return "unknown";

  for (const rule of VERB_RULES) {
    if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
      return rule.verb;
    }
  }
  return "unknown";
}

/**
 * rest verb は sacred time → proposal 出さない。
 */
export function isSacredVerb(verb: AnchorVerb): boolean {
  return verb === "rest";
}
