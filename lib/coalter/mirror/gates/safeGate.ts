/**
 * CoAlter AOO Phase B B-4b — Safe Gate (pure function)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §4.3 / §9.3 / §6.5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §4 / §7 / §9
 *   - 型: lib/coalter/mirror/types.ts (B-4a)
 *   - 定数: lib/coalter/mirror/decisionConstants.ts (B-4a)
 *
 * 役割 (B-4b 段階):
 *   Decision Engine の **第 3 段 Gate**。Mirror 発話の安全性を判定する。
 *   safety_concern / rupture_high / uncertainty high / user_sleep / rupture_flag の
 *   5 条件評価で fail-closed。
 *
 * Gate ロジック (CEO B-4b 指示 3):
 *   1. patternCategory === "safety_concern" → fail SAFE_SAFETY_CONCERN
 *   2. patternCategory === "rupture_signal_high" → fail SAFE_RUPTURE_HIGH
 *   3. uncertainty === "high_70_to_100" → fail SAFE_UNCERTAINTY_HIGH
 *   4. userOverrideSleep が true / null / undefined (precautionary)
 *      → fail SAFE_USER_OVERRIDE_SLEEP
 *   5. ruptureFlag === true → fail SAFE_RUPTURE_HIGH
 *      (null / undefined は no-op、CEO B-4b 明示: "ruptureFlag true → fail" のみ)
 *   6. すべて安全 → passed: true
 *
 * 評価順序 (autonomous 設計判断、CEO 指示順を踏襲):
 *   - safety_concern (system level 最重要)
 *   - rupture_signal_high (関係性最重要)
 *   - uncertainty high (epistemic conservatism)
 *   - userOverrideSleep (user explicit + precautionary missing)
 *   - ruptureFlag boolean (redundant rupture indicator、最後)
 *
 * Boolean 取り扱いの非対称性 (CEO B-4b 仕様):
 *   - `userOverrideSleep`:
 *       true → fail (user explicit)
 *       null / undefined → fail (precautionary: 「知らない」を「sleep してる」と扱う)
 *       false → no-op (明示的に sleep していない)
 *   - `ruptureFlag`:
 *       true → fail (rupture 明示)
 *       null / undefined / false → no-op (Phase A bucket 由来の rupture_signal_high で先に捕捉される想定)
 *
 *   理由 (autonomous 推論):
 *     - 「user の意思」は precautionary に扱う (知らない=尊重)
 *     - 「rupture 検出」は actively 検出された場合のみ反応 (false positive 防止)
 *
 * No-Effect Contract:
 *   - pure / deterministic / side-effect-free
 *   - input mutation なし
 *   - reason は MIRROR_STAY_SILENT_REASON const 経由のみ
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 / B-2 / B-3 / B-4a zero diff
 *   - PII 非受理 (MirrorDecisionInput 経由のみ)
 */

import { MIRROR_STAY_SILENT_REASON } from "../decisionConstants";
import type { GateResult, MirrorDecisionInput } from "../types";

/**
 * Safe Gate — Mirror 発話の安全性を判定する pure function。
 *
 * 5 条件: safety_concern + rupture_signal_high + uncertainty high + user_sleep + rupture_flag。
 * 1 つでも fail なら STAY_SILENT (fail-closed AND)。
 *
 * @param input - {@link MirrorDecisionInput}
 * @returns {@link GateResult}
 *   - `{ passed: true }`: 5 条件すべて安全
 *   - `{ passed: false, reason }`: 最初に検出された fail 条件の reason
 *
 * @example
 *   checkSafeGate({ patternCategory: { bucket: "safety_concern", ... }, ... })
 *     // → { passed: false, reason: "safe_gate_safety_concern" }
 *
 *   checkSafeGate({ ..., userOverrideSleep: null, ... })
 *     // → { passed: false, reason: "safe_gate_user_override_sleep" } (precautionary)
 *
 *   checkSafeGate({ ..., ruptureFlag: null, ... })
 *     // → 他条件が pass なら { passed: true } (rupture null は no-op)
 */
export function checkSafeGate(input: MirrorDecisionInput): GateResult {
  // (1) patternCategory === "safety_concern" — system safety 最優先
  if (input.patternCategory.bucket === "safety_concern") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN,
    };
  }

  // (2) patternCategory === "rupture_signal_high" — 関係性安全
  if (input.patternCategory.bucket === "rupture_signal_high") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH,
    };
  }

  // (3) uncertainty === "high_70_to_100" — epistemic conservatism
  // status === "unknown" は Observe Gate で捕捉済 (defense-in-depth: ここでは bucket 等価のみ評価)
  if (
    input.uncertainty.status === "known" &&
    input.uncertainty.bucket === "high_70_to_100"
  ) {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.SAFE_UNCERTAINTY_HIGH,
    };
  }

  // (4) userOverrideSleep: true / null / undefined すべて fail (precautionary)
  // false のみ pass
  if (input.userOverrideSleep !== false) {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.SAFE_USER_OVERRIDE_SLEEP,
    };
  }

  // (5) ruptureFlag === true → fail
  // null / undefined / false は no-op (CEO B-4b 明示仕様)
  if (input.ruptureFlag === true) {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH,
    };
  }

  return { passed: true };
}
