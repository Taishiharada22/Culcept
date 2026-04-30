/**
 * CoAlter Stage 2 — Signal Adapter (L2-b)
 *
 * 正本:
 *   - runtime contract §1.3 経路 map / §1.7 不可侵
 *   - 統合契約 §3 event bus 分離 (Stage 1 vs S4 直交)
 *   - layout plan v0.3 §5.2
 *
 * ─────────────────────────────────────────────
 * 不可侵 (runtime §1.7-2 / 統合契約 §3.6-2):
 *
 * - signal の正本 bus は `presence.state.*` 一択
 * - `executor.understanding.*` は signal source にならない
 * - **adapter 経由のみ許可、直接乗り入れ禁止**
 * - executor event がそのまま UI signal になることを禁止
 * - `presence.state.*` 購読者は UI renderer のみ (executor は購読禁止、逆方向結合防止)
 *
 * 構造的担保 (本ファイルで enforce):
 *
 * 1. 本ファイルは `executor.understanding.*` / Stage 1 Understand 関連型を一切 import しない
 *    (test で import 構造を grep 検証)
 * 2. 入力は plain interface (ExplicitSignalInput 等) のみ。executor 内部型は受け付けない
 * 3. 出力は PresenceSignal (5 分類のいずれか + 強度) のみ
 *
 * Adapter 責務 (runtime §1.3):
 *   - executor 事実 → presence signal 5 分類へのマッピング
 *   - 強度 (§1.2) 付与
 *   - 検出時刻 / meta の付帯
 *
 * 非責務:
 *   - signal の発行 (publish) ─ 上位の bus 実装で行う
 *   - signal 購読 (subscribe) ─ UI renderer / reducer 側
 *   - 閾値判定 ─ implicit の score 値はそのまま透過、判定は executor / 介入価値閾値側
 * ─────────────────────────────────────────────
 */

import type { PresenceSignal } from "./types";
import {
  classifySignalStrength,
  type ClassifyInput,
} from "./signalClassifier";

// ─────────────────────────────────────────────
// 入力型 (5 分類の adapter 各 entry point)
// ─────────────────────────────────────────────

/**
 * 明示 signal 入力 (runtime §1.1)。
 *
 * - free_text  : 自由テキスト送信 (送信イベント即時)
 * - mention    : `@coalter` mention
 * - chip_tap   : 上部レイヤー chip tap
 * - button_tap : CoAlter ボタン tap
 */
export interface ExplicitSignalInput {
  source: "free_text" | "mention" | "chip_tap" | "button_tap";
  detectedAt: number;
  meta?: Readonly<Record<string, unknown>>;
}

/**
 * 暗黙 signal 入力。executor watcher が会話文脈解析の結果として発火する。
 *
 * `softScore` は executor 側で計算された関係 signal 強度 (0-1)。
 * Adapter は score 値をそのまま透過し、閾値判定はしない (UI spec §1.3 委譲)。
 */
export interface ImplicitSignalInput {
  /** executor 側計算スコア (0-1)。0 / undefined は signal なし扱いで none に落ちる */
  softScore: number;
  detectedAt: number;
  meta?: Readonly<Record<string, unknown>>;
}

/**
 * 緊急 signal 入力 (runtime §1.1 critical / v1.1 §8.4)。
 *
 * trigger は executor 側の検出理由ラベル (heat_escalation / rupture / dignity_violation 等)。
 * 文字列型に開いて拡張可能だが、本 adapter は理由の解釈をしない。
 */
export interface CriticalSignalInput {
  trigger: string;
  detectedAt: number;
  meta?: Readonly<Record<string, unknown>>;
}

/**
 * モード昇格 signal 入力 (runtime §1.1 mode_promotion)。
 *
 * - target: 昇格先 mode
 * - source: 明示 trigger 種別
 */
export interface ModePromotionSignalInput {
  target: "daily" | "travel";
  source: "free_text" | "mode_tap" | "auto_escalation";
  detectedAt: number;
  meta?: Readonly<Record<string, unknown>>;
}

/**
 * 手動再起動 signal 入力 (runtime §1.1 manual_restart)。
 *
 * S8 cooldown 中の明示復帰要求。最短再起動ルール (5 分、v1.1 §8.6) は reducer 側で適用。
 */
export interface ManualRestartSignalInput {
  source: "mention" | "button_tap";
  detectedAt: number;
  meta?: Readonly<Record<string, unknown>>;
}

// ─────────────────────────────────────────────
// Adapter 関数 (5 分類、それぞれ純関数)
// ─────────────────────────────────────────────

/** 明示 signal の adapter (runtime §1.3 表 row 1-2) */
export function adaptExplicit(input: ExplicitSignalInput): PresenceSignal {
  const classifyIn: ClassifyInput = { kind: "explicit" };
  return {
    kind: "explicit",
    strength: classifySignalStrength(classifyIn),
    detectedAt: input.detectedAt,
    meta: { ...(input.meta ?? {}), source: input.source },
  };
}

/** 暗黙 signal の adapter (runtime §1.3 表 row 3) */
export function adaptImplicit(input: ImplicitSignalInput): PresenceSignal {
  const classifyIn: ClassifyInput = { kind: "implicit", score: input.softScore };
  return {
    kind: "implicit",
    strength: classifySignalStrength(classifyIn),
    detectedAt: input.detectedAt,
    meta: { ...(input.meta ?? {}), softScore: input.softScore },
  };
}

/** 緊急 signal の adapter (runtime §1.3 表 row 4 / v1.1 §8.4 S1 短縮) */
export function adaptCritical(input: CriticalSignalInput): PresenceSignal {
  const classifyIn: ClassifyInput = { kind: "critical" };
  return {
    kind: "critical",
    strength: classifySignalStrength(classifyIn),
    detectedAt: input.detectedAt,
    meta: { ...(input.meta ?? {}), trigger: input.trigger },
  };
}

/** モード昇格 signal の adapter (runtime §1.3 表 row 5) */
export function adaptModePromotion(
  input: ModePromotionSignalInput,
): PresenceSignal {
  const classifyIn: ClassifyInput = { kind: "mode_promotion" };
  return {
    kind: "mode_promotion",
    strength: classifySignalStrength(classifyIn),
    detectedAt: input.detectedAt,
    meta: {
      ...(input.meta ?? {}),
      target: input.target,
      source: input.source,
    },
  };
}

/** 手動再起動 signal の adapter (runtime §1.3 表 row 6) */
export function adaptManualRestart(
  input: ManualRestartSignalInput,
): PresenceSignal {
  const classifyIn: ClassifyInput = { kind: "manual_restart" };
  return {
    kind: "manual_restart",
    strength: classifySignalStrength(classifyIn),
    detectedAt: input.detectedAt,
    meta: { ...(input.meta ?? {}), source: input.source },
  };
}
