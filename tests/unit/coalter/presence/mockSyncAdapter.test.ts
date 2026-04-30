/**
 * Stage 3 L3-c — Mock SyncAdapter test (React 非依存、createMockSyncAdapter API)
 *
 * plan v0.3 §6.3 Gate:
 *   - server 勝ち調停 (§2.5)
 *   - eventually consistent の挙動 (§2.3)
 *   - 片方先行容認 (§2.6)
 *   - pair 隔離 (§2.7)
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  createMockSyncAdapter,
  __resetMockSyncHubs,
} from "@/app/(dev)/coalter-preview/full/hooks/useMockSyncAdapter";
import type {
  ClientOperation,
  BroadcastEvent,
} from "@/lib/coalter/presence/syncAdapter";

beforeEach(() => {
  __resetMockSyncHubs();
});

const PAIR = "test-pair-001";

const op = (
  user: "user_a" | "user_b",
  payload: ClientOperation["payload"],
  pairId: string = PAIR,
): ClientOperation => ({
  pairId,
  user,
  payload,
  clientTimestamp: Date.now(),
  idempotencyKey: `${user}-${Date.now()}-${Math.random()}`,
});

describe("L3-c createMockSyncAdapter — broadcast / subscribe / fetchSnapshot 基本", () => {
  it("broadcast で server clock が増加し、ack 返却", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    const ack = await adapter.broadcast(
      op("user_a", { kind: "mode_switch", target: "daily" }),
    );
    expect(ack.accepted).toBe(true);
    expect(ack.serverTimestamp).toBe(1);
  });

  it("broadcast 後、両 listener (subscribe) で同じ patch を観察 (§2.3)", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    const eventsA: BroadcastEvent[] = [];
    const eventsB: BroadcastEvent[] = [];
    adapter.subscribe(PAIR, (e) => eventsA.push(e));
    adapter.subscribe(PAIR, (e) => eventsB.push(e));

    await adapter.broadcast(
      op("user_a", { kind: "mode_switch", target: "travel" }),
    );

    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);
    expect(eventsA[0].serverTimestamp).toBe(eventsB[0].serverTimestamp);
    expect(eventsA[0].patch.mode).toBe("travel");
    expect(eventsB[0].patch.mode).toBe("travel");
  });

  it("複数 broadcast で server clock が単調増加 (§2.2 server 単調 timestamp)", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    const a1 = await adapter.broadcast(
      op("user_a", { kind: "free_text_send", text: "hello" }),
    );
    const a2 = await adapter.broadcast(
      op("user_b", { kind: "chip_tap", chipKind: "response", chipLabel: "近い" }),
    );
    const a3 = await adapter.broadcast(
      op("user_a", { kind: "mode_switch", target: "daily" }),
    );
    expect(a2.serverTimestamp).toBeGreaterThan(a1.serverTimestamp);
    expect(a3.serverTimestamp).toBeGreaterThan(a2.serverTimestamp);
  });

  it("fetchSnapshot で現 SharedState 取得", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    await adapter.broadcast(
      op("user_a", { kind: "mode_switch", target: "daily" }),
    );
    const snap = await adapter.fetchSnapshot(PAIR);
    expect(snap.mode).toBe("daily");
  });
});

describe("L3-c createMockSyncAdapter — server 勝ち / 片方先行容認 (§2.5 / §2.6)", () => {
  it("FIFO 順で複数 client の operation が確定", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    const events: BroadcastEvent[] = [];
    adapter.subscribe(PAIR, (e) => events.push(e));

    await adapter.broadcast(
      op("user_a", { kind: "free_text_send", text: "先行発話" }),
    );
    await adapter.broadcast(
      op("user_b", { kind: "free_text_send", text: "後発話" }),
    );

    expect(events).toHaveLength(2);
    expect(events[0].patch.speechCard?.body).toBe("先行発話");
    expect(events[1].patch.speechCard?.body).toBe("後発話");
    expect(events[1].serverTimestamp).toBeGreaterThan(events[0].serverTimestamp);
  });

  it("subscribe 解除後は event を受け取らない", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    const events: BroadcastEvent[] = [];
    const unsub = adapter.subscribe(PAIR, (e) => events.push(e));

    await adapter.broadcast(
      op("user_a", { kind: "mode_switch", target: "daily" }),
    );
    expect(events).toHaveLength(1);

    unsub();

    await adapter.broadcast(
      op("user_a", { kind: "mode_switch", target: "travel" }),
    );
    expect(events).toHaveLength(1); // 増えない
  });
});

describe("L3-c createMockSyncAdapter — pair 隔離 (§2.7)", () => {
  it("異なる pairId 間で hub 独立、broadcast が漏れない", async () => {
    const a1 = createMockSyncAdapter({ pairId: "pair-001" });
    const a2 = createMockSyncAdapter({ pairId: "pair-002" });
    const eventsP1: BroadcastEvent[] = [];
    const eventsP2: BroadcastEvent[] = [];
    a1.subscribe("pair-001", (e) => eventsP1.push(e));
    a2.subscribe("pair-002", (e) => eventsP2.push(e));

    await a1.broadcast(
      op("user_a", { kind: "mode_switch", target: "daily" }, "pair-001"),
    );

    expect(eventsP1).toHaveLength(1);
    expect(eventsP2).toHaveLength(0);
  });
});

describe("L3-c createMockSyncAdapter — operation 種別ごとの patch 適用", () => {
  it("free_text_send → speechCard 更新", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    await adapter.broadcast(
      op("user_a", { kind: "free_text_send", text: "今、間に入れそう" }),
    );
    const snap = await adapter.fetchSnapshot(PAIR);
    expect(snap.speechCard?.body).toBe("今、間に入れそう");
  });

  it("chip_tap → lastChipTap 更新 (tapBy 含む)", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    await adapter.broadcast(
      op("user_a", { kind: "chip_tap", chipKind: "response", chipLabel: "近い" }),
    );
    const snap = await adapter.fetchSnapshot(PAIR);
    expect(snap.lastChipTap?.chipLabel).toBe("近い");
    expect(snap.lastChipTap?.tapBy).toBe("user_a");
  });

  it("handoff_to_main_chat → handoffStatus 更新", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR });
    await adapter.broadcast(
      op("user_b", { kind: "handoff_to_main_chat", sourceId: "proposal-001" }),
    );
    const snap = await adapter.fetchSnapshot(PAIR);
    expect(snap.handoffStatus?.sourceId).toBe("proposal-001");
    expect(snap.handoffStatus?.handoffBy).toBe("user_b");
  });
});

describe("L3-c createMockSyncAdapter — latency 遅延シミュレーション", () => {
  it("latencyMs > 0 で broadcast が指定 ms 待機", async () => {
    const adapter = createMockSyncAdapter({ pairId: PAIR, latencyMs: 50 });
    const start = Date.now();
    await adapter.broadcast(
      op("user_a", { kind: "mode_switch", target: "daily" }),
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
