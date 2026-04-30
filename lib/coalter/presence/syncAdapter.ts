/**
 * CoAlter Stage 2 — SyncAdapter interface (L2-f、interface のみ)
 *
 * 正本: runtime contract §2.2 同期媒体 / §2.5 矛盾時調停 / §2.7 複数デバイス
 *
 * 本ファイルは **interface 層のみ**。実装本体 (Supabase Realtime / WebSocket /
 * polling) は **L4-e で CEO 審議後に決定** (本書 plan §5.6 / §7.5)。
 *
 * Stage 3 では `useMockSyncAdapter` (in-memory mock) を本 interface に従って
 * 実装し、preview E2E に供する (plan §6.3)。
 *
 * 不可侵 (runtime §2.2):
 *   - client → server: ユーザー操作を送信、server 側 broadcast
 *   - server → client: 両 client に等しく broadcast
 *   - client → client (直接): **禁止** (master §5「個別チャネル非許可」)
 */

import type { SharedState } from "./sharedState";

// ─────────────────────────────────────────────
// SyncAdapter interface (媒体非依存)
// ─────────────────────────────────────────────

/**
 * Broadcast event (server → client)。
 *
 * SharedState の **部分更新** (Partial) を持ち、適用は client 側で merge 経由。
 */
export interface BroadcastEvent {
  /** ペア識別子 */
  pairId: string;
  /** 更新部分 (server 単調 timestamp 込み) */
  patch: Partial<SharedState>;
  /** 発生元 (auditing 用) */
  origin: "user_a" | "user_b" | "executor" | "server";
  /** server 単調 timestamp (§2.2、後着 FIFO 判定) */
  serverTimestamp: number;
}

/**
 * client から server へ送る送信 (operation)。
 *
 * server は受信後、SharedState を更新して BroadcastEvent として両 client に流す。
 */
export interface ClientOperation {
  pairId: string;
  /** どの user の操作か */
  user: "user_a" | "user_b";
  /** 操作内容 (executor が解釈する shape) */
  payload: ClientOperationPayload;
  /** client 側 timestamp (送信時刻、server 単調と区別) */
  clientTimestamp: number;
  /** client 側 idempotency key (重複防止、server で de-dup) */
  idempotencyKey: string;
}

/**
 * 操作種別 (本 interface では union で列挙、実装側で discriminated union を使う想定)。
 *
 * 実装拡張時は本 type に新 variant を追加する。
 */
export type ClientOperationPayload =
  | { kind: "free_text_send"; text: string }
  | { kind: "chip_tap"; chipKind: string; chipLabel: string }
  | { kind: "mode_switch"; target: "normal" | "daily" | "travel" }
  | { kind: "button_tap"; buttonId: string }
  | { kind: "memory_visibility_change"; itemId: string; nextVisibility: string }
  | { kind: "handoff_to_main_chat"; sourceId: string }
  | { kind: "rejection"; rejectionType: string; meta?: Record<string, unknown> };

/**
 * Subscribe callback の signature。
 */
export type BroadcastListener = (event: BroadcastEvent) => void;

/**
 * Server ack 結果。
 */
export interface AckResult {
  /** server 側で受理されたか */
  accepted: boolean;
  /** server 単調 timestamp (受理時、§2.2) */
  serverTimestamp: number;
  /** 拒否理由 (RLS 違反 / 不正 payload 等) */
  reason?: string;
}

/**
 * SyncAdapter abstract interface。
 *
 * 実装は L4-e で決定、本 phase では interface のみ。Stage 3 mock は本 interface を
 * 満たす in-memory 実装 (`useMockSyncAdapter`) で代替。
 */
export interface SyncAdapter {
  /**
   * client → server へ操作を送信し、ack を待つ (§2.2 broadcast 経路)。
   *
   * server 側で SharedState 更新 + 両 client への broadcast 発行。
   * 本関数の返り値は server ack のみ (broadcast は subscribe 側で受信)。
   */
  broadcast(operation: ClientOperation): Promise<AckResult>;

  /**
   * server → client の broadcast を購読する (§2.2)。
   *
   * 戻り値は unsubscribe 関数。
   */
  subscribe(pairId: string, listener: BroadcastListener): () => void;

  /**
   * 現時点の SharedState snapshot を取得する (§2.4 再接続時 fetch)。
   */
  fetchSnapshot(pairId: string): Promise<SharedState>;
}
