/**
 * CoAlter Always-On Observer — Subscriber Gate (Phase A-2b)
 *
 * 正本:
 *   - docs/coalter-aoo-a2b-implementation-preflight.md §4 (PR #157)
 *   - lib/coalter/flags.ts presenceObserverEnabled getter
 *
 * 役割:
 *   Observer subscribe を起動するかどうかの gate logic。
 *   env flag を判定し、skip reason を enum で返す (caller の意思決定に使う)。
 *
 * CRITICAL 設計原則:
 *   - Pure function (副作用なし、deterministic per flag state)
 *   - LLM / fetch / DB / storage / console 一切なし
 *   - env を直接 read しない (flags.ts に集中)
 *   - default は安全側 (gate_disabled) に倒す
 */

import { COALTER_FLAGS } from "../flags";

// ─────────────────────────────────────────────
// Skip reason (gate 判定結果の enum)
// ─────────────────────────────────────────────

/**
 * Gate 判定結果。caller が subscribe 可否 + skip reason を区別するための enum。
 *
 * - gate_enabled: subscribe 可 (flag ON)
 * - gate_disabled_by_flag: env flag OFF (default false / unset / unknown value)
 * - gate_disabled_unknown: 内部例外時の fail-closed (将来 defensive 用)
 */
export type ObserverGateResult =
  | "gate_enabled"
  | "gate_disabled_by_flag"
  | "gate_disabled_unknown";

// ─────────────────────────────────────────────
// Gate check
// ─────────────────────────────────────────────

/**
 * Observer subscribe gate 判定。
 *
 * 内部で `COALTER_FLAGS.presenceObserverEnabled` を read。
 *
 * @returns gate_enabled if flag ON、それ以外は disabled variant
 */
export function checkObserverGate(): ObserverGateResult {
  try {
    const enabled = COALTER_FLAGS.presenceObserverEnabled;
    return enabled ? "gate_enabled" : "gate_disabled_by_flag";
  } catch {
    // fail-closed (defensive、flag access が壊れた場合は subscribe しない)
    return "gate_disabled_unknown";
  }
}

/**
 * 簡易 boolean version (caller 側で reason 不要な場合)。
 *
 * @returns true if gate_enabled、それ以外 false
 */
export function isPresenceObserverEnabled(): boolean {
  return checkObserverGate() === "gate_enabled";
}
