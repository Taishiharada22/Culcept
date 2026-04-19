/**
 * CoAlter Phase 2 — Post-router modifier (2026-04-19 v0.3)
 *
 * 位置づけ: mode 選択後の**出力修飾層**。mode を変えない。
 *           変えるのは questionBudget / 語調 / closing の慎重さ だけ。
 *
 * 参照: docs/coalter-phase2-3mode-design.md §1.5
 *
 * CEO 実装固定条件（フェーズ 6.B 条件 1）:
 *  - modifier は "修飾だけ"。selectedMode を上書きしない。
 *  - そのため **mode は入力にも出力にも含めない**（型で保証）。
 *  - 触ってよいのは ToneModifier のみ:
 *      - maxQuestion（質問数の上限）
 *      - softenClosing（closing 文を柔らかくするか）
 *
 * 依存契約:
 *  - 純関数（DB / LLM 依存ゼロ）
 *  - emotion_heat high は Pre-router gate で既に弾かれている前提
 *    （本関数は low / mid / undefined のみ受ける想定）
 */

import type { EmotionHeat, ToneModifier } from "./types";

/**
 * emotion_heat から ToneModifier を算出する。
 *
 * - severity === "mid" → { softenClosing: true,  maxQuestion: 0 }
 * - severity === "low" / undefined / その他 → { softenClosing: false, maxQuestion: 1 }
 *
 * ※ severity === "high" が来たとしても mode は変えない。
 *   通常 Pre-router gate で既に弾かれているため、ここで来た場合は low と同扱いにする。
 *   （安全側: questionBudget=1、softenClosing=false にして Gate を再評価させる）
 *   → 実装としては "mid 以外は寛容側" で統一する。
 */
export function deriveToneModifier(emotionHeat: EmotionHeat): ToneModifier {
  if (emotionHeat.severity === "mid") {
    return { softenClosing: true, maxQuestion: 0 };
  }
  return { softenClosing: false, maxQuestion: 1 };
}
