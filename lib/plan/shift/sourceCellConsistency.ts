/**
 * SR A4 — source-cell visual consistency guard（pure・confidence 非依存）
 *
 * 役割: VLM の confidence を信じず、原稿画像セルの「視覚的存在」(contentScore) と抽出 rawCode を
 *   突き合わせ、source/result の **存在不一致** を soft hint 化する。A3（confidence 由来の read-miss）が
 *   捕まえられない *confident 誤読*（実データ: 原稿「H」→ "" を confidence 0.90 で出力）を、
 *   「rawCode="" なのに原稿セルに content がある」(**P1**) として deterministic に検出する。
 *
 * 設計核心（A3 read-miss messy smoke `a90be12f` の所見）:
 *   - gemini は messy 表でも confidence を下げず難セルを高 conf で誤読する → confidence net は効かない。
 *   - 必要なのは confidence ではなく「原稿に見えるのに空欄」という画像由来の不一致検出。
 *
 * スコープ: 存在不一致のみ（**コードの正誤は判定しない** = A1 confusable / 人の照合の領域）。
 *   **soft のみ**（`HARD_KINDS` に入れない・保存 block しない）。
 *
 * 不変原則: pure（IO / LLM / DB / Date / random / env なし）・**throw しない**・deterministic。
 *   contentScore の算出は別層（cellContentMetric + sharp IO）。本 module は比較だけ。
 */

import { normalizeRawCode } from "./shiftCodeDictionary";

export type SourceMismatchKind = "blank_with_content" | "filled_but_empty";

/** 1 セル分の突き合わせ入力。 */
export interface SourceCellSignal {
  day: number;
  /** 抽出された rawCode（""=空欄）。 */
  rawCode: string;
  /** 原稿セルの視覚的存在 0..1（1=明確に何かある / 0=空っぽに見える）。 */
  contentScore: number;
}

/** 1 件の不一致 hint（soft）。 */
export interface SourceMismatchHint {
  day: number;
  kind: SourceMismatchKind;
  severity: "soft";
  message: string;
}

export interface SourceConsistencyOptions {
  /** これ以上の contentScore は「原稿に存在」(P1 用)。既定 DEFAULT_CONTENT_HIGH。 */
  contentHighThreshold?: number;
  /** これ以下の contentScore は「空っぽに見える」(P2 用)。既定 DEFAULT_CONTENT_LOW。 */
  contentLowThreshold?: number;
  /** P2（非空なのに原稿空っぽ＝幻覚疑い）も出すか。既定 false（P1 集中・false positive 抑制）。 */
  detectFilledButEmpty?: boolean;
}

/** content「あり」の既定閾値（実画像 smoke で確定）。 */
export const DEFAULT_CONTENT_HIGH = 0.12;
/** content「空っぽ」の既定閾値（P2 用）。 */
export const DEFAULT_CONTENT_LOW = 0.03;

function isBlankCode(rawCode: unknown): boolean {
  return typeof rawCode !== "string" || normalizeRawCode(rawCode) === "";
}

function finite01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * source/result の存在不一致を検出する（pure）。
 *   - **P1**（最重要）: rawCode="" ∧ contentScore ≥ high → blank_with_content（読み落とし疑い）。
 *   - P2（任意）: rawCode 非空 ∧ contentScore ≤ low → filled_but_empty（幻覚疑い）。
 * いずれも **soft**（保存 block しない）。day 昇順・throw しない。
 */
export function detectSourceMismatches(
  signals: readonly SourceCellSignal[],
  options: SourceConsistencyOptions = {}
): SourceMismatchHint[] {
  const high = options.contentHighThreshold ?? DEFAULT_CONTENT_HIGH;
  const low = options.contentLowThreshold ?? DEFAULT_CONTENT_LOW;
  const p2 = options.detectFilledButEmpty ?? false;
  const hints: SourceMismatchHint[] = [];
  for (const s of signals ?? []) {
    if (!s || typeof s.day !== "number") continue;
    const score = finite01(s.contentScore);
    const blank = isBlankCode(s.rawCode);
    if (blank && score >= high) {
      hints.push({
        day: s.day,
        kind: "blank_with_content",
        severity: "soft",
        message: "原稿のセルに記号が見えますが、読み取りは空欄です。原稿と照合してください。",
      });
    } else if (p2 && !blank && score <= low) {
      hints.push({
        day: s.day,
        kind: "filled_but_empty",
        severity: "soft",
        message: "原稿のセルが空に見えますが、コードが入っています。原稿と照合してください。",
      });
    }
  }
  return hints.sort((a, b) => a.day - b.day);
}

/** 不一致の day set（risk model / cell amber 用・P1 のみに絞る等の filter は呼び元）。 */
export function sourceMismatchDays(hints: readonly SourceMismatchHint[]): Set<number> {
  return new Set(hints.map((h) => h.day));
}
