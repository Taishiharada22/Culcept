/**
 * CoAlter Stage 2 — Presence Reducer (L2-c)
 *
 * 正本:
 *   - Core UX v1.1 §8 (S0-S8 状態遷移)
 *   - UI spec §5 (各 S 詳細)
 *   - runtime contract §1.3 経路 map / §1.5 S1 短縮 / §1.7 不可侵
 *
 * 責務:
 *   - PresenceState の遷移管理 (9 状態 + 緊急短縮 + 退出 + 再起動)
 *   - SIGNAL event → state 遷移の写像 (signal 5 分類受容、§1.3 経路通り)
 *   - 許可 matrix (transitions.ts) に従った defensive 判定 (未許可遷移は state 不変)
 *
 * 非責務 (他 phase に委譲):
 *   - mode (normal/daily/travel) 切替 → L2-h modeReducer
 *   - pattern variant 選択 → L2-d patternSelector
 *   - cooldown 判定 (5 分再起動 / 拒否 cooldown) → L2-j / L2-l
 *   - 緊急介入視覚層トリガ (urgent layer) → L2-k
 *   - availability (disabled/inactive/...) → L2-e
 *   - signal 検出 / score 計算 → executor watcher 側 (本 reducer は signal 受容のみ)
 *
 * 不可侵 (runtime §1.7):
 *   - signal は presence.state.* bus 経由のみ受容 (signalAdapter L2-b で生成された
 *     PresenceSignal を入力に取る)
 *   - executor.understanding.* を直接購読しない (構造 gate L2-b で確認済)
 *   - critical 以外は S1 経由 (§1.5、明示でも S0→S1→S2)
 */

import type { PresenceSignal } from "./types";
import { isTransitionAllowed } from "./transitions";
import { shouldSkipS1 } from "./signalClassifier";
import type { PresenceState } from "./types";

// ─────────────────────────────────────────────
// Reducer state shape
// ─────────────────────────────────────────────

/**
 * Presence reducer が保持する state。
 *
 * 本 phase (L2-c) は state 単独。後続 phase で mode / cooldown / pattern を
 * 別 reducer / store として直交管理する (合成は Stage 3)。
 */
export interface PresenceReducerState {
  state: PresenceState;
}

// ─────────────────────────────────────────────
// Event types (presence.state.* bus 経由で reducer に届く event)
// ─────────────────────────────────────────────

/**
 * Reducer が受容する event 種類。
 *
 * SIGNAL event は signalAdapter (L2-b) で生成された PresenceSignal を保持する。
 * その他 event は state machine の明示遷移 trigger (UI tap / executor 内部処理完了 等)。
 */
export type PresenceEvent =
  | { type: "SIGNAL"; signal: PresenceSignal }
  // 状態遷移 trigger (signal 以外)
  | { type: "S1_ENTRY_OK" }      // S1 → S2 (consent 通過、entry speech 発火可)
  | { type: "S2_ACCEPTED" }      // S2 → S3 (明示拒否なし)
  | { type: "S3_RESPONSE" }      // S3 → S4 (片方 / 両方の応答取得)
  | { type: "S4_DONE" }          // S4 → S5 (理解更新完了)
  | { type: "S5_DONE" }          // S5 → S6 (整理完了)
  | { type: "S5_DIRECT_EXIT" }   // S5 → S8 (提案価値低、S6/S7 省略、§8.3)
  | { type: "S6_PROPOSE" }       // S6 → S7 (「提案を聞く」tap)
  | { type: "S6_REWORK" }        // S6 → S5 (「もう少し整理する」tap)
  | { type: "S6_END" }           // S6 → S8 (「今はここまでにする」tap)
  | { type: "S7_DONE" }          // S7 → S8 (承認 / 不承認 / 閉じる いずれも)
  // 任意状態 → 退出 (§8.5)
  | { type: "EXIT" }
  // S8 → S0 再起動 (§8.6、5 分判定は L2-l 側、本 reducer は許可済前提)
  | { type: "RESTART" };

// ─────────────────────────────────────────────
// 純関数 reducer
// ─────────────────────────────────────────────

/**
 * Presence reducer。許可 matrix 違反は state 不変 (defensive)。
 *
 * 単一の (state, event) → state 写像。state machine としての副作用 (DB 書き込み /
 * timer 設定 / log) は本 reducer の外側 (orchestrator / Stage 3) で管理する。
 */
export function presenceReducer(
  current: PresenceReducerState,
  event: PresenceEvent,
): PresenceReducerState {
  const next = nextStateFor(current.state, event);
  // 許可 matrix チェック (defensive)
  if (next === current.state || !isTransitionAllowed(current.state, next)) {
    return current;
  }
  return { state: next };
}

/**
 * (state, event) → 候補 next state を返す純関数。
 *
 * 許可 matrix 違反は呼び出し側 (presenceReducer) で弾くため、本関数は単純に
 * 「この event が来たらどこに行きたいか」を返すだけ。
 */
function nextStateFor(
  state: PresenceState,
  event: PresenceEvent,
): PresenceState {
  switch (event.type) {
    case "SIGNAL":
      return reduceSignal(state, event.signal);
    case "S1_ENTRY_OK":
      return state === "S1" ? "S2" : state;
    case "S2_ACCEPTED":
      return state === "S2" ? "S3" : state;
    case "S3_RESPONSE":
      return state === "S3" ? "S4" : state;
    case "S4_DONE":
      return state === "S4" ? "S5" : state;
    case "S5_DONE":
      return state === "S5" ? "S6" : state;
    case "S5_DIRECT_EXIT":
      return state === "S5" ? "S8" : state;
    case "S6_PROPOSE":
      return state === "S6" ? "S7" : state;
    case "S6_REWORK":
      return state === "S6" ? "S5" : state;
    case "S6_END":
      return state === "S6" ? "S8" : state;
    case "S7_DONE":
      return state === "S7" ? "S8" : state;
    case "EXIT":
      // §8.5: どの状態からも S8 退出可。S8 / S0 (= 再起動済) からは不要
      return state === "S8" || state === "S0" ? state : "S8";
    case "RESTART":
      return state === "S8" ? "S0" : state;
  }
}

/**
 * SIGNAL event の state 写像。
 *
 * - S0 中の signal: critical → S2 短縮 / strong/soft (none 以外) → S1
 * - S0 中の signal strength=none: S0 不変
 * - S8 中の manual_restart signal: S0 (再起動)
 * - 他状態中の signal: 本 reducer は state 不変 (urgent layer 等は別 phase)
 *
 * runtime §1.5 不可侵: critical のみ S1 短縮、明示でも S0→S1→S2 を経由。
 */
function reduceSignal(
  state: PresenceState,
  signal: PresenceSignal,
): PresenceState {
  // strength=none は signal なし扱い、state 不変
  if (signal.strength === "none") return state;

  // S0 中の signal: critical → S2、他 → S1
  if (state === "S0") {
    if (shouldSkipS1(signal.kind)) return "S2";
    return "S1";
  }

  // S8 中の manual_restart: S0 へ戻る (§8.6 再起動)
  // 5 分間隔判定は本 reducer ではなく L2-l rate limit 側
  if (state === "S8" && signal.kind === "manual_restart") {
    return "S0";
  }

  // 他状態中の signal: state 不変 (urgency / mode escalation は別 phase)
  return state;
}

// ─────────────────────────────────────────────
// 初期 state factory
// ─────────────────────────────────────────────

/** 初期状態は S0 (見守り中、v1.1 §8.1) */
export function initialPresenceState(): PresenceReducerState {
  return { state: "S0" };
}
