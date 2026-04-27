/**
 * CoAlter Stage 2 — modeReducer (L2-h)
 *
 * 正本:
 *   - Core UX v1.1 §2.3 通常モード本体性 / §2.4 3 軸の関係 / §11.5「何でも Daily/Travel にしない」
 *   - UI spec §6.2 切替 3 形態 / §6.3 手動切替 / §6.4 自動昇格 / §6.5 復帰
 *   - runtime contract §1.1 signal 5 分類 (mode_promotion)
 *
 * 3 形態 (UI spec §6.2):
 *   1. 手動切替 (MANUAL_SWITCH)        — ユーザー chip tap、即時反映、承認不要
 *   2. 自動昇格 (AUTO_ESCALATE)        — S5 状態優先切替 + 長期構造化必要判定
 *   3. 自然退出 (PLAN_COMPLETE) / 手動復帰 (MANUAL_RETURN) — 通常モード復帰
 *
 * 不可侵原則:
 *   - 通常モード本体性 (v1.1 §2.3): Daily/Travel は通常からの昇格、相互直接遷移は禁止
 *   - §11.5: 暗黙 signal で Daily/Travel 起動禁止 (明示 signal のみ)
 *   - Daily ↔ Travel 直接遷移は禁止 (必ず通常経由、plan §5.8 test ⑦)
 */

import type { PresenceMode, PresenceSignal } from "./types";

/**
 * Mode 遷移 event (3 形態 + 復帰)。
 */
export type ModeEvent =
  | { type: "MANUAL_SWITCH"; target: PresenceMode }
  | { type: "AUTO_ESCALATE"; target: "daily" | "travel"; signal: PresenceSignal }
  | { type: "PLAN_COMPLETE" }
  | { type: "MANUAL_RETURN" };

/**
 * 純関数 modeReducer。不正遷移は state 不変。
 */
export function modeReducer(current: PresenceMode, event: ModeEvent): PresenceMode {
  switch (event.type) {
    case "MANUAL_SWITCH":
      return reduceManualSwitch(current, event.target);
    case "AUTO_ESCALATE":
      return reduceAutoEscalate(current, event.target, event.signal);
    case "PLAN_COMPLETE":
      // §6.5.1 自然退出: Daily / Travel → 通常 (即時)
      return current === "normal" ? current : "normal";
    case "MANUAL_RETURN":
      // §6.5.2 手動復帰: [通常] tap → 通常へ
      return "normal";
  }
}

/**
 * 手動切替の遷移 (§6.3)。
 *
 * 通常 ⇄ Daily / 通常 ⇄ Travel は許可。
 * Daily ↔ Travel 直接遷移は **禁止** (v1.1 §2.3 通常モード本体性、必ず通常経由)。
 */
function reduceManualSwitch(
  current: PresenceMode,
  target: PresenceMode,
): PresenceMode {
  if (current === target) return current;
  // 通常からの昇格 / 通常への復帰 (§6.3 / §6.5.2)
  if (current === "normal" || target === "normal") return target;
  // Daily ↔ Travel 直接遷移は禁止 (state 不変)
  return current;
}

/**
 * 自動昇格の遷移 (§6.4 / §11.5)。
 *
 * 不変原則:
 *   - 通常からのみ昇格 (Daily/Travel 中の自動昇格はなし)
 *   - 明示 signal のみ (§11.5: 暗黙 signal で昇格しない)
 *     → kind = "mode_promotion" のみ自動昇格 trigger として受容
 *     → kind = "explicit" は手動切替経路、本書では別 event (MANUAL_SWITCH) で扱う
 *     → kind = "implicit" / "critical" / "manual_restart" は昇格 trigger にならない
 *
 * 自動昇格判定の閾値・長期構造化判定は本 reducer の責務外 (modeEscalationDetector
 * 側で前段判定済の前提で受容する)。
 */
function reduceAutoEscalate(
  current: PresenceMode,
  target: "daily" | "travel",
  signal: PresenceSignal,
): PresenceMode {
  // 通常からのみ
  if (current !== "normal") return current;
  // §11.5: 明示 mode_promotion signal のみ受容
  if (signal.kind !== "mode_promotion") return current;
  return target;
}

/**
 * 初期 mode (新セッション = 通常、v1.1 §2.3 本体性)。
 */
export function initialMode(): PresenceMode {
  return "normal";
}
