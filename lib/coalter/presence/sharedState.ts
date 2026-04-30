/**
 * CoAlter Stage 2 — SharedState interface (L2-f 媒体非依存層)
 *
 * 正本: runtime contract §2.1.1 shared state (ペア共有、server 正本)
 *
 * shared state = 2 人のクライアント間で同期すべき CoAlter 関連状態。
 * server を唯一の source of truth とする (§2.2)。client → client 直接禁止。
 *
 * 本ファイルは型定義のみ。媒体実装 (Supabase Realtime / WebSocket / polling) は
 * **L4-e で CEO 審議後に決定** (本書 plan §5.6 / §7.5)。
 */

import type {
  ExecutorAvailability,
  PatternVariant,
  PresenceMode,
  PresenceState,
} from "./types";
import type { MemoryItem } from "./memoryTypes";

/**
 * 9 件の shared state (runtime §2.1.1 全項目)。
 *
 * 各項目は server 正本で管理、両 client に broadcast される。
 * Action Mode は phase2 凍結だが interface 上は予約フィールドとして残す。
 */
export interface SharedState {
  /** ① executor availability (ペア永続、master §5 / 統合契約 §2.1) */
  availability: ExecutorAvailability;

  /** ② Presence 状態 S0-S8 (発話サイクル単位、統合契約 §2.2) */
  presenceState: PresenceState;

  /** ③ Action Mode (ターン単位、phase2 凍結のため type 上は最小限) */
  actionMode: "decision" | "negotiate" | "clarify" | null;

  /** ④ 発話本文カード (発話単位、v1.1 §3.1 / UI spec §4) */
  speechCard: SharedSpeechCard | null;

  /** ⑤ chip tap 結果 (tap 単位、UI spec §4 chip) */
  lastChipTap: SharedChipTap | null;

  /** ⑥ 共有メモリ surface 可視状態 (項目単位、UI spec §8) */
  memorySurface: ReadonlyArray<MemoryItem>;

  /** ⑦ 提案カード (提案単位、UI spec §4.3.8) */
  proposalCard: SharedProposalCard | null;

  /** ⑧ handoff 状態 (明示共有 tap 単位、UI spec §2.7 / §4.3.8) */
  handoffStatus: SharedHandoffStatus | null;

  /** ⑨ mode (active セッション単位、v1.1 §5) */
  mode: PresenceMode;

  /** server 単調 timestamp (§2.2 同時到着順序の調停用) */
  serverTimestamp: number;
}

/**
 * 発話本文カードの shared 情報。
 */
export interface SharedSpeechCard {
  variant: PatternVariant;
  body: string;
  /** §7.10 副次同伴 1 行 (S7 F2 主 + F1 副次) */
  secondaryLine?: string;
  /** speech 発火時刻 (server) */
  spokeAt: number;
}

/**
 * chip tap broadcast。
 */
export interface SharedChipTap {
  /** どの chip か (response/approve/close/action) */
  chipKind: string;
  /** chip 文言 (debug 用) */
  chipLabel: string;
  /** どの user が tap したか */
  tapBy: "user_a" | "user_b";
  /** server timestamp */
  tappedAt: number;
}

/**
 * 提案カード broadcast。
 */
export interface SharedProposalCard {
  /** F-1 / F-2 のどちらを primary とするか */
  primary: "F1" | "F2";
  /** §7.10 合成時の副次 (Daily/Travel で F-2 主 + F-1 副次の場合) */
  secondary: "F1" | null;
  /** 提案本文 */
  body: string;
  /** 提示時刻 */
  shownAt: number;
}

/**
 * handoff 状態 broadcast (UI spec §2.7「この提案をチャットに共有」結果)。
 */
export interface SharedHandoffStatus {
  /** どの user が handoff したか */
  handoffBy: "user_a" | "user_b";
  /** handoff 対象の発話 / 提案 ID */
  sourceId: string;
  /** メインチャットに転送された時刻 */
  transferredAt: number;
}

/**
 * 全 SharedState フィールドの key 列挙 (網羅性 test 用)。
 *
 * runtime §2.1.1 で列挙された 9 件すべてを含む。新規追加時は本配列を必ず更新する。
 */
export const SHARED_STATE_KEYS = [
  "availability",
  "presenceState",
  "actionMode",
  "speechCard",
  "lastChipTap",
  "memorySurface",
  "proposalCard",
  "handoffStatus",
  "mode",
] as const satisfies ReadonlyArray<keyof Omit<SharedState, "serverTimestamp">>;

/**
 * 初期 SharedState (新ペア = inactive availability + S0 + 通常モード)。
 */
export function initialSharedState(): SharedState {
  return {
    availability: "inactive",
    presenceState: "S0",
    actionMode: null,
    speechCard: null,
    lastChipTap: null,
    memorySurface: [],
    proposalCard: null,
    handoffStatus: null,
    mode: "normal",
    serverTimestamp: 0,
  };
}
