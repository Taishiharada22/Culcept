/**
 * Pattern variant 7 種の mock 文面（preview 用）
 *
 * 正本: speech template §3-§9 (Pattern A/B/C/D/E/F-1/F-2 各章の代表例文を抜粋)
 *
 * 規約 (layout plan §4.3 / speech template §2):
 *   - 例文を**そのまま静的表示**（LLM 呼ばない）
 *   - speech template §2 共通禁止表現（裁定 / 代弁 / 評定 / 尋問 / 追い詰め / 確定）を含めない
 *   - 編集しない（speech template が正本、本 mock は参照 surface）
 */

export type PatternVariant =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F-1"
  | "F-2";

export interface PatternMock {
  variant: PatternVariant;
  displayName: string;
  toneCategory: string;
  /** 代表的な短文サンプル (speech template の典型例文を抜粋) */
  sample: string;
  /** Pattern が許可される state（UI spec §7.12 Pattern→State 許可 matrix） */
  allowedStates: ReadonlyArray<"S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8">;
}

/**
 * UI spec §7.12 Pattern→State 許可 matrix を data として保持。
 * 各 Pattern が「どの state で許可されるか」を視覚化する材料。
 *
 * 注: 実機の許可 logic は Stage 2 patternSelector (L2-d) で実装。
 *     本 mock は preview の視覚確認のみ。
 */
export const PATTERN_MOCKS: ReadonlyArray<PatternMock> = [
  {
    variant: "A",
    displayName: "入口発話 (Entry)",
    toneCategory: "気配を寄せる",
    sample: "今、間に入れそう",
    // 入口発話は S2 が中心（介入気配からの最初の声がけ）
    allowedStates: ["S2"],
  },
  {
    variant: "B",
    displayName: "状況言語化 (Frame)",
    toneCategory: "言語化を手伝う",
    sample: "たいしさんは予定の調整を気にしているのかな",
    // Frame は S5 橋渡し（応答後の整理）が中心
    allowedStates: ["S5"],
  },
  {
    variant: "C",
    displayName: "確認質問 (Confirm)",
    toneCategory: "確かめる",
    sample: "もしかして、こういう感じかな",
    allowedStates: ["S5"],
  },
  {
    variant: "D",
    displayName: "片側フォーカス (Focus Side)",
    toneCategory: "片側に丁寧に聞く",
    sample: "たいしさんは、どんな感じで考えてる？",
    allowedStates: ["S5"],
  },
  {
    variant: "E",
    displayName: "橋渡し・翻訳 (Bridge)",
    toneCategory: "両者の差を翻訳する",
    sample: "二人の間で、ニュアンスが少しずれてるかも",
    allowedStates: ["S5"],
  },
  {
    variant: "F-1",
    displayName: "関係提案 (Relationship Proposal)",
    toneCategory: "関係への提案",
    sample: "今は一旦置いて、お互いの様子を見ながら話す時間を取ってみる？",
    allowedStates: ["S7"],
  },
  {
    variant: "F-2",
    displayName: "生活提案 (Life Proposal)",
    toneCategory: "生活への提案",
    sample: "今日のスケジュールに合わせて、夕方に短く話す時間を入れてみる？",
    allowedStates: ["S7"],
  },
] as const;

export function getPatternMock(variant: PatternVariant): PatternMock {
  const found = PATTERN_MOCKS.find((p) => p.variant === variant);
  if (!found) {
    // fail-open (preview なので throw しない)
    return PATTERN_MOCKS[0];
  }
  return found;
}
