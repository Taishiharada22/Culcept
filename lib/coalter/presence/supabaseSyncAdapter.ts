/**
 * CoAlter Stage 4 L4-e — Supabase Realtime SyncAdapter 実装
 *
 * 正本: layout plan v0.3 §7.5 / runtime contract §2 全体
 *
 * 案 A (Supabase Realtime + RLS、CEO 確定 2026-04-28) の実装。
 * SyncAdapter interface (L2-f) を満たす本番実装。
 *
 * 不可侵:
 *   - production behavior 不変原則: presenceExecutorEnabled flag OFF 時は本実装が
 *     呼び出されない (UpperLayerMount が null を返すため、subscribe / broadcast
 *     経路に到達しない)
 *   - migration は **作成のみ** (supabase/migrations/20260428100000_coalter_presence_states.sql)
 *     `supabase db push` / `migration up` は L4-l flip 時に CEO 別審議で実行
 *   - L4-l flip までは本実装は dead code (import されるが実行されない)
 *
 * Realtime channel: `coalter:pair:{pair_id}`
 *
 * 制約:
 *   - DB schema が未 migrate の状態では fetch / broadcast がエラーを返す。本 phase は
 *     interface 完成 + migration file 凍結 + 単体 test のみ。E2E は L4-l 以降。
 */

import type {
  AckResult,
  BroadcastEvent,
  BroadcastListener,
  ClientOperation,
  SyncAdapter,
} from "./syncAdapter";
import type { SharedState } from "./sharedState";
import { initialSharedState } from "./sharedState";

/**
 * Supabase client の最小 interface (本 file は依存 minimal で型のみ参照)。
 * 実装側で `@/lib/supabase/client` の createClient() を渡す想定。
 */
export interface MinimalSupabaseClient {
  from: (table: string) => {
    select: (cols?: string) => {
      eq: (col: string, val: unknown) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  channel: (name: string) => {
    on: (
      event: string,
      filter: Record<string, unknown>,
      callback: (payload: unknown) => void,
    ) => unknown;
    subscribe: (cb?: (status: string) => void) => unknown;
    unsubscribe: () => Promise<unknown>;
  };
}

// ─────────────────────────────────────────────
// Adapter factory
// ─────────────────────────────────────────────

export interface CreateSupabaseSyncAdapterOptions {
  /** Supabase client (server 側 service_role or client 側 RLS-bound) */
  supabase: MinimalSupabaseClient;
}

/**
 * Supabase Realtime SyncAdapter を生成する。
 *
 * SyncAdapter interface に従い 3 method を実装:
 *   - broadcast: server (Supabase) を経由して両 client に broadcast
 *   - subscribe: Supabase Realtime channel に subscribe
 *   - fetchSnapshot: 現 SharedState を server から fetch
 *
 * NOTE: 本実装は L4-l flip まで dead code。flag OFF 状態では UpperLayerMount が
 * null を返すため、subscribe / broadcast 経路に到達しない (production behavior 不変)。
 */
export function createSupabaseSyncAdapter(
  options: CreateSupabaseSyncAdapterOptions,
): SyncAdapter {
  const { supabase } = options;

  return {
    /**
     * client → server: Supabase REST 経由で SharedState を update。
     * server-side trigger で server_timestamp が auto-increment、Realtime broadcast 発火。
     */
    async broadcast(operation: ClientOperation): Promise<AckResult> {
      const patch = applyOperationToPatch(operation);
      const { error } = await supabase
        .from("coalter_presence_states")
        .update(patch)
        .eq("pair_id", operation.pairId);

      if (error) {
        return {
          accepted: false,
          serverTimestamp: 0,
          reason: extractErrorMessage(error),
        };
      }

      // server_timestamp は trigger で auto-increment、本 adapter は即時取得しない
      // (broadcast event で client に伝播、subscribe 側で受信)
      return {
        accepted: true,
        serverTimestamp: Date.now(), // client 側 estimate、正本は broadcast event の serverTimestamp
      };
    },

    /**
     * server → client: Supabase Realtime channel に subscribe。
     */
    subscribe(pairId: string, listener: BroadcastListener): () => void {
      const channel = supabase.channel(`coalter:pair:${pairId}`);
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "coalter_presence_states",
          filter: `pair_id=eq.${pairId}`,
        },
        (payload: unknown) => {
          const event = mapPostgresChangeToEvent(pairId, payload);
          if (event) listener(event);
        },
      );
      channel.subscribe();
      return () => {
        void channel.unsubscribe();
      };
    },

    /**
     * 現 SharedState snapshot を fetch (§2.4 再接続時 fetch)。
     */
    async fetchSnapshot(pairId: string): Promise<SharedState> {
      const { data, error } = await supabase
        .from("coalter_presence_states")
        .select("*")
        .eq("pair_id", pairId)
        .single();

      if (error || !data) {
        // DB 未 migrate / 未 insert の場合は初期 state を返す (fail-open)
        return { ...initialSharedState() };
      }
      return rowToSharedState(data);
    },
  };
}

// ─────────────────────────────────────────────
// Operation → patch (DB column 名へ map)
// ─────────────────────────────────────────────

function applyOperationToPatch(
  operation: ClientOperation,
): Record<string, unknown> {
  const payload = operation.payload;
  switch (payload.kind) {
    case "free_text_send":
      return {
        speech_card: {
          variant: "A",
          body: payload.text,
          spoke_at: operation.clientTimestamp,
        },
      };
    case "chip_tap":
      return {
        last_chip_tap: {
          chip_kind: payload.chipKind,
          chip_label: payload.chipLabel,
          tap_by: operation.user,
          tapped_at: operation.clientTimestamp,
        },
      };
    case "mode_switch":
      return { mode: payload.target };
    case "button_tap":
      // button_tap は専用列なし (audit のみ、別 table へ送る想定)
      return {};
    case "memory_visibility_change":
      // memory は別 table (L4-g)、本 adapter は触らない
      return {};
    case "handoff_to_main_chat":
      return {
        handoff_status: {
          handoff_by: operation.user,
          source_id: payload.sourceId,
          transferred_at: operation.clientTimestamp,
        },
      };
    case "rejection":
      // rejection は別 table or session-local、本 adapter では空
      return {};
  }
}

// ─────────────────────────────────────────────
// DB row → SharedState
// ─────────────────────────────────────────────

function rowToSharedState(row: unknown): SharedState {
  const r = row as Record<string, unknown>;
  return {
    availability: (r.availability as SharedState["availability"]) ?? "inactive",
    presenceState: (r.presence_state as SharedState["presenceState"]) ?? "S0",
    actionMode: (r.action_mode as SharedState["actionMode"]) ?? null,
    speechCard: (r.speech_card as SharedState["speechCard"]) ?? null,
    lastChipTap: (r.last_chip_tap as SharedState["lastChipTap"]) ?? null,
    memorySurface: [], // 別 table、L4-g で参照
    proposalCard: (r.proposal_card as SharedState["proposalCard"]) ?? null,
    handoffStatus: (r.handoff_status as SharedState["handoffStatus"]) ?? null,
    mode: (r.mode as SharedState["mode"]) ?? "normal",
    serverTimestamp: typeof r.server_timestamp === "number" ? r.server_timestamp : 0,
  };
}

function mapPostgresChangeToEvent(
  pairId: string,
  payload: unknown,
): BroadcastEvent | null {
  const p = payload as { new?: unknown; eventType?: string };
  if (!p?.new) return null;
  const sharedState = rowToSharedState(p.new);
  return {
    pairId,
    patch: sharedState,
    origin: "server",
    serverTimestamp: sharedState.serverTimestamp,
  };
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "unknown supabase error";
}
