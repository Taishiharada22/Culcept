/**
 * CoAlter Stage 2 — modeEscalationDetector (L2-h)
 *
 * 正本:
 *   - Core UX v1.1 §11.5「何でも Daily/Travel にしない」(明示 signal のみ起動)
 *   - UI spec §6.4 自動昇格 UI フロー (S5 状態優先切替時)
 *   - UI spec §4.4 状態優先切替時のモード昇格 (S5 のみ、長期構造化必要時)
 *   - runtime contract §1.1 signal 5 分類
 *
 * 責務:
 *   - signal + presence state + 長期構造化判定 → 自動昇格すべきか判定
 *   - 「何でも昇格しない」原則の構造的担保 (暗黙 signal を起動 path から除外)
 *
 * 非責務:
 *   - 介入価値閾値の数値判定 (UI spec §1.3 / §9 保留論点、本書外)
 *   - 長期構造化必要性の判定アルゴリズム (実装詳細、本書では boolean を受容)
 */

import type {
  PresenceMode,
  PresenceSignal,
  PresenceState,
} from "./types";

/**
 * 自動昇格判定の入力。
 */
export interface EscalationDetectionInput {
  /** 現 mode (通常からのみ昇格可、§4.4 S5 限定) */
  currentMode: PresenceMode;
  /** 現 state (§4.4: S5 のみ自動昇格 trigger 状態) */
  presenceState: PresenceState;
  /** 検出された signal (§11.5: 明示 mode_promotion のみ受容) */
  signal: PresenceSignal;
  /** 長期構造化必要判定 (executor 側で計算済の boolean、§4.4 / §6.4) */
  longTermStructuringNeeded: boolean;
}

/**
 * 自動昇格判定結果。
 */
export interface EscalationDecision {
  /** 昇格すべき場合の target mode (Daily / Travel)、不要なら null */
  target: "daily" | "travel" | null;
  /** 判定理由 (debug / log 用) */
  reason: string;
}

/**
 * 明示 mode_promotion signal から target mode を抽出する。
 *
 * signalAdapter (L2-b adaptModePromotion) で生成された signal は meta.target に
 * "daily" or "travel" を持つ。
 */
function extractTargetMode(
  signal: PresenceSignal,
): "daily" | "travel" | null {
  if (signal.kind !== "mode_promotion") return null;
  const t = signal.meta?.target;
  if (t === "daily" || t === "travel") return t;
  return null;
}

/**
 * 自動昇格判定 (§6.4 + §11.5)。
 *
 * 4 条件全 true の時のみ昇格:
 *   1. currentMode === "normal" (通常からのみ)
 *   2. presenceState === "S5" (§4.4: S5 のみ自動昇格 trigger)
 *   3. signal.kind === "mode_promotion" (§11.5 明示 signal のみ)
 *   4. longTermStructuringNeeded === true (§6.4 長期構造化必要判定通過)
 *
 * いずれか false → null (昇格しない)。
 */
export function detectEscalation(
  input: EscalationDetectionInput,
): EscalationDecision {
  if (input.currentMode !== "normal") {
    return { target: null, reason: "currentMode !== normal (Daily/Travel 中の昇格なし)" };
  }
  if (input.presenceState !== "S5") {
    return {
      target: null,
      reason: `presenceState=${input.presenceState} (S5 のみ自動昇格 trigger、§4.4)`,
    };
  }
  if (input.signal.kind !== "mode_promotion") {
    return {
      target: null,
      reason: `signal.kind=${input.signal.kind} (§11.5: 明示 mode_promotion のみ昇格)`,
    };
  }
  if (!input.longTermStructuringNeeded) {
    return {
      target: null,
      reason: "longTermStructuringNeeded=false (§6.4 長期構造化判定不通過)",
    };
  }

  const target = extractTargetMode(input.signal);
  if (!target) {
    return {
      target: null,
      reason: "mode_promotion signal に target meta なし (adapter 不整合)",
    };
  }

  return { target, reason: `自動昇格 OK: 通常 → ${target} (S5 + 長期構造化必要)` };
}
