/**
 * CoAlter Stage 2 — Presence 状態遷移 matrix (L2-c)
 *
 * 正本:
 *   - Core UX v1.1 §8.3 基本フロー / §8.4 緊急短縮 / §8.5 退出 / §8.6 再起動
 *   - UI spec §4.3 (各 S の昇格／降格)
 *   - runtime contract §1.5 (S1 短縮は critical のみ)
 *
 * 本ファイルは Stage 1 (existence) gate の "状態間遷移可否" を正本化する。
 * Stage 2 (mode 別 suppression) は L2-h modeReducer / L2-d patternSelector で扱う。
 *
 * 9×9 = 81 セル。✓ = 遷移許可、— = 不許可。
 *
 * 不変原則 (v1.1 §8.3 / §8.5):
 *   - S0 → S1 は signal 検出で自動 (consent はまだ)
 *   - S0 → S2 は critical のみ短縮 (S1 スキップ、runtime §1.5 不可侵)
 *   - S1 → S2 は consent チェック後のみ (両者既読 / 会話継続)
 *   - S5 → S8 直行可 (提案価値低時、S6/S7 省略)
 *   - S6 → S5 (もう少し整理) / → S7 (提案を聞く) / → S8 (今はここまで) の 3 経路
 *   - S7 → S8 のみ (承認 / 不承認 / 閉じる いずれも S8)
 *   - S8 → S0 のみ (再起動 = 新しい S0)
 *   - **任意状態 → S8 は §8.5 退出条件で許可** (どの状態からも退出可)
 */

import { PRESENCE_STATES, type PresenceState } from "./types";

/**
 * 9×9 許可 matrix。from → to の遷移可否。
 *
 * 仕様根拠:
 * | from | to (許可) | 根拠 |
 * |---|---|---|
 * | S0 | S1, S2, S8 | §8.3 (S0→S1) / §8.4 (S0→S2 critical 短縮) / §8.5 (任意→S8) |
 * | S1 | S2, S8     | §8.3 (S1→S2 consent OK) / §8.5 |
 * | S2 | S3, S8     | §8.3 (S2→S3 受容) / §8.5 |
 * | S3 | S4, S8     | §8.3 (S3→S4 応答取得) / §8.5 |
 * | S4 | S5, S8     | §8.3 (S4→S5 理解更新完了) / §8.5 |
 * | S5 | S6, S8     | §8.3 (S5→S6 整理完了 / S5→S8 提案価値低時の skip) |
 * | S6 | S5, S7, S8 | UI spec §4.3.7 (もう少し整理 / 提案を聞く / 今はここまで) |
 * | S7 | S8         | §8.3 (S7→S8 退出 / 承認 不承認 閉じる いずれも) |
 * | S8 | S0         | §8.6 (S8→S0 再起動、5 分間隔は L2-l で別判定) |
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<PresenceState, ReadonlySet<PresenceState>>
> = {
  S0: new Set<PresenceState>(["S1", "S2", "S8"]),
  S1: new Set<PresenceState>(["S2", "S8"]),
  S2: new Set<PresenceState>(["S3", "S8"]),
  S3: new Set<PresenceState>(["S4", "S8"]),
  S4: new Set<PresenceState>(["S5", "S8"]),
  S5: new Set<PresenceState>(["S6", "S8"]),
  S6: new Set<PresenceState>(["S5", "S7", "S8"]),
  S7: new Set<PresenceState>(["S8"]),
  S8: new Set<PresenceState>(["S0"]),
};

/**
 * 遷移許可判定。
 *
 * 注: 同一 state は許可しない (`from === to` は false)。reducer 側で「状態不変」は
 * 遷移を試みなかった結果として表現する。
 */
export function isTransitionAllowed(
  from: PresenceState,
  to: PresenceState,
): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

/**
 * 9×9 全セル列挙 (test 網羅性 / debug 用)。
 */
export function* iterateTransitionCells(): Generator<{
  from: PresenceState;
  to: PresenceState;
  allowed: boolean;
}> {
  for (const from of PRESENCE_STATES) {
    for (const to of PRESENCE_STATES) {
      yield { from, to, allowed: isTransitionAllowed(from, to) };
    }
  }
}
