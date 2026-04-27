/**
 * CoAlter Stage 2 — Signal 強度分類器 (L2-b)
 *
 * 正本: runtime contract §1.2 強度階層 / §1.3 経路 map / §1.7 不可侵
 *
 * 責務:
 *   - SignalKind → SignalStrength の写像 (5 分類 → strong/soft/none)
 *   - 暗黙 signal の score → strength entry point
 *
 * 非責務 (本書で定めない、executor 側委譲):
 *   - 暗黙 signal の score 計算アルゴリズム (executor watcher 内部)
 *   - 介入価値閾値の具体値 (UI spec §1.3 委譲、§9 保留論点)
 *
 * 不可侵 (runtime §1.7):
 *   - 5 分類は網羅的。新種は本書 rev 追記のみで足す
 *   - 本ファイルは executor.understanding.* を import しない
 *     (構造的検証は signalAdapter.test.ts の import 構造 test で実施)
 */

import type { SignalKind, SignalStrength } from "./types";

/**
 * 強度分類の入力。
 *
 * - implicit の場合は score (0-1) を含める。score=0 / undefined は "none" に落ちる
 * - 他 kind は score 不要 (常に strong)
 */
export interface ClassifyInput {
  kind: SignalKind;
  /** implicit の場合のみ参照される score (0-1)。other kinds では無視 */
  score?: number;
}

/**
 * runtime §1.2 強度階層の正本実装。
 *
 * - explicit / critical / mode_promotion / manual_restart → "strong"
 * - implicit (score > 0)                                   → "soft"
 * - implicit (score <= 0 / undefined)                       → "none"
 *
 * 内部閾値 (soft → strong 昇格) は executor 側委譲。本関数は default のみ。
 */
export function classifySignalStrength(input: ClassifyInput): SignalStrength {
  // implicit のみ score 経由で判定
  if (input.kind === "implicit") {
    if (input.score === undefined || input.score <= 0) return "none";
    return "soft";
  }
  // 他 4 分類は無条件 strong (runtime §1.2)
  if (
    input.kind === "explicit" ||
    input.kind === "critical" ||
    input.kind === "mode_promotion" ||
    input.kind === "manual_restart"
  ) {
    return "strong";
  }
  // 未知 signal (型外の値) → defensive に none (Gate plan §5.2「未知 signal は none に落ちる」)
  return "none";
}

/**
 * S1 短縮判定 (runtime §1.5)。
 *
 * - critical のみ S0 → S2 直接 (S1 スキップ)
 * - 他は S1 経由
 *
 * 本関数は分類器の付帯機能。reducer (L2-c) はこれを参照する。
 */
export function shouldSkipS1(kind: SignalKind): boolean {
  return kind === "critical";
}
