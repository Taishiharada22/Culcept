/**
 * Morning Turn Trace Builder — W3 Commit 16-T (runtime path 証明)
 *
 * 位置づけ:
 *   route.ts が 1 turn の処理中に各分岐点で local 変数として保持した「実行結果」を
 *   受け取り、`MorningTurnTrace` 構造体に詰めるだけの pure 記録者関数。
 *
 * CEO 修正条件（2026-04-30）:
 *   1. **記録者 only — 判定者にならない**
 *      - 受け取った値をそのままコピーする以外のロジックを持たない。
 *      - 矛盾入力（例: phase=plan_presented + promote.fired=true）でも訂正しない。
 *      - default 値の補完 / 不正値の弾き / 集約計算を行わない。
 *   2. **再評価禁止**
 *      - flag を再評価しない（route が `evaluateAlterMorningFlags` を 1 回呼んで
 *        取得した snapshot をそのまま埋める）。
 *      - phase / dispatch / hasBlockingUnresolvedSlots を再計算しない
 *        （route が legacy 経路で実際に使った値をそのまま埋める）。
 *   3. **副作用ゼロ**
 *      - LLM / DB / I/O / Date.now を呼ばない（time は flagSnapshot.evaluatedAt 経由）。
 *      - 入力を mutate しない。戻り値は新規生成オブジェクト。
 *
 * 設計ガード:
 *   - 入力 type は MorningTurnTrace 構造に 1:1 対応。builder 内で field 名を
 *     書き換えない（rename / mapping 禁止）。
 *   - 戻り値の field 順序は MorningTurnTrace 定義順と同一。
 *   - try/catch / null guard / fallback を builder 内に書かない（caller 責務）。
 */

import type { MorningTurnTrace } from "../types";

/**
 * builder 入力型 — `MorningTurnTrace` と完全一致。
 *
 * caller (route.ts) は各分岐点で local 変数として保持した実行結果を、
 * field 名そのままで builder に渡す。builder は受け取った field を
 * `MorningTurnTrace` の対応 field に **コピーするだけ**。
 */
export type BuildMorningTurnTraceInput = MorningTurnTrace;

/**
 * 受け取った値を `MorningTurnTrace` 構造体にコピーするだけの pure 関数。
 *
 * 実装規律:
 *   - field を 1:1 でコピーする（再構築 / 並び替え / 名前変更 禁止）。
 *   - input の field を欠落させない（input 側で omit されている場合は
 *     型エラーになる、つまり caller が責任を持つ）。
 *   - 出力は新規オブジェクト（input を mutate しない）。
 *
 * @param input route が実行結果として組み立てた値
 * @returns MorningTurnTrace（input の deep ではなく shallow copy）
 */
export function buildMorningTurnTrace(
  input: BuildMorningTurnTraceInput,
): MorningTurnTrace {
  return {
    flagSnapshot: input.flagSnapshot,
    dialogStateAvailable: input.dialogStateAvailable,
    placesHandoffEligible: input.placesHandoffEligible,
    activeDialogPath: input.activeDialogPath,
    pendingClarifySource: input.pendingClarifySource,
    shadow: {
      dispatched: input.shadow.dispatched,
      skipReason: input.shadow.skipReason,
      selectResult: input.shadow.selectResult,
      prevFocus: input.shadow.prevFocus,
      nextFocus: input.shadow.nextFocus,
      prevConvStatus: input.shadow.prevConvStatus,
      nextConvStatus: input.shadow.nextConvStatus,
      capturedSubKind: input.shadow.capturedSubKind,
      progressDelta: input.shadow.progressDelta,
    },
    promote: {
      fired: input.promote.fired,
      skipReason: input.promote.skipReason,
    },
    dispatch: input.dispatch,
    responsePhase: input.responsePhase,
  };
}
