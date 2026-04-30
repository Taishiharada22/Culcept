/**
 * CoAlter Stage 2 — 共有メモリ 3 軸型 (L2-i)
 *
 * 正本:
 *   - UI spec §8.3.1 3 軸独立定義 (由来 × 確定度 × 可視性)
 *   - Core UX v1.1 §10 共有メモリとモード別文脈管理
 *
 * 3 軸独立 (§8.3.1 不可侵): 3 軸は相関するが独立に決まる。実装者は 3 軸を
 * 混同せず、それぞれ別レイヤーで表示する。
 *
 * NOTE (plan v0.3 §4.8 整合): 由来 3 種、確定度 3 段階、可視性 4 種 (UI spec §8.3.1 正本)。
 * plan v0.2 の「由来 6 種」は誤記、v0.3 で同期済。
 */

import type { PresenceMode } from "./types";

/**
 * 由来 (ソース種別、UI spec §8.3.1)。
 *
 * - explicit_shared    : 両者または片側が CoAlter に明示共有した
 * - inferred           : CoAlter が会話・文脈から推定した
 * - transient_summary  : 直近の会話を一時要約 (短期保持)
 */
export type Origin = "explicit_shared" | "inferred" | "transient_summary";

export const ORIGINS = [
  "explicit_shared",
  "inferred",
  "transient_summary",
] as const satisfies ReadonlyArray<Origin>;

/**
 * 確定度 (信頼度、UI spec §8.3.1)。
 *
 * - high    : 明示共有 + 双方承認、または長期確認済み
 * - medium  : 一度は確認された、または複数回観測
 * - low     : 初回推定のみ、未検証
 */
export type Certainty = "high" | "medium" | "low";

export const CERTAINTIES = ["high", "medium", "low"] as const satisfies ReadonlyArray<Certainty>;

/**
 * 可視性 (スコープ、UI spec §8.3.1)。
 *
 * - both_visible   : 両ユーザーに表示
 * - user_a_only    : 片側ユーザー A にのみ表示 (B には内部のみ)
 * - user_b_only    : 片側ユーザー B にのみ表示 (A には内部のみ)
 * - internal_only  : CoAlter 内部参照のみ、両者非表示 (参照数のみカウント可)
 */
export type Visibility =
  | "both_visible"
  | "user_a_only"
  | "user_b_only"
  | "internal_only";

export const VISIBILITIES = [
  "both_visible",
  "user_a_only",
  "user_b_only",
  "internal_only",
] as const satisfies ReadonlyArray<Visibility>;

/**
 * Mode 文脈 (Core UX §10.2)。
 *
 * memory item がどの mode 中に作成・参照されたかを保持。PresenceMode と同義。
 */
export type ModeContext = PresenceMode;

/**
 * 共有メモリ項目。
 *
 * 3 軸 (origin / certainty / visibility) は §8.3.1 で必ず明示。
 * §8.3.3 ラベル階層は memoryLabelHierarchy 側で表示判定。
 */
export interface MemoryItem {
  id: string;
  /** 項目本文 */
  content: string;
  origin: Origin;
  certainty: Certainty;
  visibility: Visibility;
  /** 作成時の mode 文脈 (§10.2) */
  modeContext: ModeContext;
  /** 作成時刻 (epoch ms) */
  createdAt: number;
  /** 最終更新時刻 (epoch ms) */
  updatedAt: number;
  /** transient_summary の自動消滅時刻 (epoch ms)、それ以外は undefined */
  expiresAt?: number;
}
