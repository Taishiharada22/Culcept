/**
 * Stage 4 L4-e — Supabase SyncAdapter unit test
 *
 * plan v0.3 §7.5 Gate:
 *   - CEO が同期媒体を承認 (案 A 確定 2026-04-28)
 *   - migration が未実行 (作成のみ、L4-l flip 時に実行)
 *   - E2E test は L4-l 以降 (本 phase は単体検証のみ)
 *
 * test strategy: MinimalSupabaseClient mock を使い、SyncAdapter interface を満たすか検証。
 */

import { describe, it, expect, vi } from "vitest";

import {
  createSupabaseSyncAdapter,
  type MinimalSupabaseClient,
} from "@/lib/coalter/presence/supabaseSyncAdapter";
import type { ClientOperation } from "@/lib/coalter/presence/syncAdapter";

function makeMockClient(overrides: Partial<MinimalSupabaseClient> = {}): MinimalSupabaseClient {
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    channel: vi.fn(() => channelMock),
    ...overrides,
  } as MinimalSupabaseClient;
}

describe("L4-e createSupabaseSyncAdapter — SyncAdapter interface 充足", () => {
  it("3 method (broadcast / subscribe / fetchSnapshot) を提供", () => {
    const adapter = createSupabaseSyncAdapter({ supabase: makeMockClient() });
    expect(typeof adapter.broadcast).toBe("function");
    expect(typeof adapter.subscribe).toBe("function");
    expect(typeof adapter.fetchSnapshot).toBe("function");
  });

  it("broadcast: free_text_send で speech_card を update", async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const client = makeMockClient({
      from: vi.fn(() => ({ update, select: vi.fn() })) as unknown as MinimalSupabaseClient["from"],
    });
    const adapter = createSupabaseSyncAdapter({ supabase: client });
    const op: ClientOperation = {
      pairId: "p1",
      user: "user_a",
      payload: { kind: "free_text_send", text: "こんにちは" },
      clientTimestamp: 1000,
      idempotencyKey: "k1",
    };
    const ack = await adapter.broadcast(op);
    expect(ack.accepted).toBe(true);
    // update が呼ばれた
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        speech_card: expect.objectContaining({
          variant: "A",
          body: "こんにちは",
        }),
      }),
    );
  });

  it("broadcast: chip_tap で last_chip_tap を update", async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const client = makeMockClient({
      from: vi.fn(() => ({ update, select: vi.fn() })) as unknown as MinimalSupabaseClient["from"],
    });
    const adapter = createSupabaseSyncAdapter({ supabase: client });
    await adapter.broadcast({
      pairId: "p1",
      user: "user_b",
      payload: { kind: "chip_tap", chipKind: "response", chipLabel: "近い" },
      clientTimestamp: 1000,
      idempotencyKey: "k2",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_chip_tap: expect.objectContaining({
          chip_label: "近い",
          tap_by: "user_b",
        }),
      }),
    );
  });

  it("broadcast: error 時は accepted=false で reason を返す", async () => {
    const updateEq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "RLS violation" },
    });
    const client = makeMockClient({
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: updateEq })),
        select: vi.fn(),
      })) as unknown as MinimalSupabaseClient["from"],
    });
    const adapter = createSupabaseSyncAdapter({ supabase: client });
    const ack = await adapter.broadcast({
      pairId: "p1",
      user: "user_a",
      payload: { kind: "mode_switch", target: "daily" },
      clientTimestamp: 1000,
      idempotencyKey: "k3",
    });
    expect(ack.accepted).toBe(false);
    expect(ack.reason).toContain("RLS");
  });

  it("subscribe: channel `coalter:pair:{pair_id}` を作成して on/subscribe", () => {
    const channelMock = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };
    const channel = vi.fn(() => channelMock);
    const client = makeMockClient({ channel } as unknown as MinimalSupabaseClient);
    const adapter = createSupabaseSyncAdapter({ supabase: client });
    const unsub = adapter.subscribe("p1", () => {});
    expect(channel).toHaveBeenCalledWith("coalter:pair:p1");
    expect(channelMock.on).toHaveBeenCalled();
    expect(channelMock.subscribe).toHaveBeenCalled();
    // unsubscribe 関数が返る
    expect(typeof unsub).toBe("function");
    unsub();
    expect(channelMock.unsubscribe).toHaveBeenCalled();
  });

  it("fetchSnapshot: error / 未 row 時に initialSharedState を返す (fail-open)", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    const client = makeMockClient({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
        update: vi.fn(),
      })) as unknown as MinimalSupabaseClient["from"],
    });
    const adapter = createSupabaseSyncAdapter({ supabase: client });
    const snap = await adapter.fetchSnapshot("p1");
    expect(snap.availability).toBe("inactive");
    expect(snap.presenceState).toBe("S0");
    expect(snap.mode).toBe("normal");
  });

  it("fetchSnapshot: row 取得時は SharedState 形式に変換", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        availability: "active",
        presence_state: "S5",
        mode: "daily",
        action_mode: null,
        speech_card: null,
        last_chip_tap: null,
        proposal_card: null,
        handoff_status: null,
        server_timestamp: 42,
      },
      error: null,
    });
    const client = makeMockClient({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
        update: vi.fn(),
      })) as unknown as MinimalSupabaseClient["from"],
    });
    const adapter = createSupabaseSyncAdapter({ supabase: client });
    const snap = await adapter.fetchSnapshot("p1");
    expect(snap.availability).toBe("active");
    expect(snap.presenceState).toBe("S5");
    expect(snap.mode).toBe("daily");
    expect(snap.serverTimestamp).toBe(42);
  });
});

describe("L4-e migration file — 作成のみ (実行禁止)", () => {
  it("supabase/migrations/20260428100000_coalter_presence_states.sql が存在", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../supabase/migrations/20260428100000_coalter_presence_states.sql",
    );
    expect(fs.existsSync(file)).toBe(true);
  });

  it("migration file に RLS policy + table 定義 + Realtime publication 言及あり", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../supabase/migrations/20260428100000_coalter_presence_states.sql",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/create table.*coalter_presence_states/i);
    expect(content).toMatch(/enable row level security/i);
    expect(content).toMatch(/create policy/i);
    expect(content).toMatch(/supabase_realtime/i); // Realtime publication 言及
    expect(content).toMatch(/server_timestamp/);
  });
});
