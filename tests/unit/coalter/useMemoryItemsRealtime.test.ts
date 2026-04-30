/**
 * Stage 4 B-3.4.c — useMemoryItems Realtime 拡張 test
 *
 * CEO 確定要件 (2026-04-30):
 *   - throttle 250ms 内の連続 INSERT 2 件が両方残る (取りこぼし防止、修正条件 1)
 *   - shouldDisplay は viewer visibility / internal_only / expired を gate (修正条件 2)
 *   - publication 未追加環境で CHANNEL_ERROR でも UI 壊れない (Gate C)
 *   - unmount で channel.unsubscribe + clearTimeout
 *
 * test strategy:
 *   - computeNext / shouldDisplay / mapRealtimeRow を pure function として
 *     関数 invoke で完全 cover (新 dep ゼロ)
 *   - React hook 自体は React 環境必要 → 構造 invariant grep + B-3.4 integration
 *     で carry
 */

import { describe, it, expect } from "vitest";

import {
  REALTIME_THROTTLE_MS,
  computeNext,
  shouldDisplay,
  mapRealtimeRow,
} from "@/app/components/chat/hooks/useMemoryItems";
import type { MemoryItem } from "@/lib/coalter/presence/memoryTypes";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: overrides.id ?? "item-1",
    content: overrides.content ?? "test content",
    origin: overrides.origin ?? "explicit_shared",
    certainty: overrides.certainty ?? "high",
    visibility: overrides.visibility ?? "both_visible",
    modeContext: overrides.modeContext ?? "normal",
    createdAt: overrides.createdAt ?? 1_700_000_000_000,
    updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
    expiresAt: overrides.expiresAt,
  };
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "item-1",
    content: "test content",
    origin: "explicit_shared",
    certainty: "high",
    visibility: "both_visible",
    mode_context: "normal",
    created_at: "2026-04-30T01:00:00.000Z",
    updated_at: "2026-04-30T01:00:00.000Z",
    expires_at: null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePayload(eventType: string, newRow?: Record<string, unknown>, oldRow?: Record<string, unknown>): any {
  return {
    eventType,
    new: newRow ?? {},
    old: oldRow ?? {},
    schema: "public",
    table: "coalter_memory_items",
  };
}

// ─────────────────────────────────────────────
// CEO 確定: REALTIME_THROTTLE_MS = 250
// ─────────────────────────────────────────────

describe("B-3.4.c REALTIME_THROTTLE_MS は 250ms (CEO 確定 2026-04-30)", () => {
  it("REALTIME_THROTTLE_MS === 250", () => {
    expect(REALTIME_THROTTLE_MS).toBe(250);
  });
});

// ─────────────────────────────────────────────
// CEO 修正条件 2: shouldDisplay の 3 軸 gate
// ─────────────────────────────────────────────

describe("B-3.4.c shouldDisplay — viewer visibility × visibility × expires", () => {
  const NOW = 2_000_000_000_000;

  it("both_visible: viewer=user_a / user_b どちらでも表示", () => {
    const item = makeItem({ visibility: "both_visible" });
    expect(shouldDisplay(item, "user_a", NOW)).toBe(true);
    expect(shouldDisplay(item, "user_b", NOW)).toBe(true);
  });

  it("user_a_only: viewer=user_a で表示、user_b で非表示", () => {
    const item = makeItem({ visibility: "user_a_only" });
    expect(shouldDisplay(item, "user_a", NOW)).toBe(true);
    expect(shouldDisplay(item, "user_b", NOW)).toBe(false);
  });

  it("user_b_only: viewer=user_b で表示、user_a で非表示", () => {
    const item = makeItem({ visibility: "user_b_only" });
    expect(shouldDisplay(item, "user_b", NOW)).toBe(true);
    expect(shouldDisplay(item, "user_a", NOW)).toBe(false);
  });

  it("internal_only: どの viewer でも常に非表示", () => {
    const item = makeItem({ visibility: "internal_only" });
    expect(shouldDisplay(item, "user_a", NOW)).toBe(false);
    expect(shouldDisplay(item, "user_b", NOW)).toBe(false);
  });

  it("expired (expires_at <= now): 表示 visibility に関係なく非表示", () => {
    const expired = makeItem({
      visibility: "both_visible",
      expiresAt: NOW - 1,
    });
    expect(shouldDisplay(expired, "user_a", NOW)).toBe(false);
    expect(shouldDisplay(expired, "user_b", NOW)).toBe(false);
  });

  it("expires_at == now: 境界で非表示 (<=)", () => {
    const boundary = makeItem({
      visibility: "both_visible",
      expiresAt: NOW,
    });
    expect(shouldDisplay(boundary, "user_a", NOW)).toBe(false);
  });

  it("expires_at > now: 表示", () => {
    const future = makeItem({
      visibility: "both_visible",
      expiresAt: NOW + 1000,
    });
    expect(shouldDisplay(future, "user_a", NOW)).toBe(true);
  });

  it("expires_at undefined: 期限なしで表示判定 (visibility のみ評価)", () => {
    const perm = makeItem({
      visibility: "user_a_only",
      expiresAt: undefined,
    });
    expect(shouldDisplay(perm, "user_a", NOW)).toBe(true);
    expect(shouldDisplay(perm, "user_b", NOW)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// mapRealtimeRow — DB column → MemoryItem 変換
// ─────────────────────────────────────────────

describe("B-3.4.c mapRealtimeRow — DB row → MemoryItem 変換", () => {
  it("snake_case → camelCase 変換 (mode_context → modeContext)", () => {
    const row = makeRow({ mode_context: "daily" });
    const result = mapRealtimeRow(row);
    expect(result?.modeContext).toBe("daily");
  });

  it("ISO timestamp → epoch ms 変換", () => {
    const row = makeRow({
      created_at: "2026-04-30T01:00:00.000Z",
      updated_at: "2026-04-30T02:00:00.000Z",
    });
    const result = mapRealtimeRow(row);
    expect(typeof result?.createdAt).toBe("number");
    expect(typeof result?.updatedAt).toBe("number");
    expect(result!.updatedAt).toBeGreaterThan(result!.createdAt);
  });

  it("expires_at null → undefined", () => {
    const row = makeRow({ expires_at: null });
    const result = mapRealtimeRow(row);
    expect(result?.expiresAt).toBeUndefined();
  });

  it("expires_at ISO string → epoch ms", () => {
    const row = makeRow({ expires_at: "2026-04-30T03:00:00.000Z" });
    const result = mapRealtimeRow(row);
    expect(typeof result?.expiresAt).toBe("number");
  });

  it("invalid row (missing id) → null", () => {
    const row = makeRow({ id: undefined });
    delete row.id;
    expect(mapRealtimeRow(row)).toBeNull();
  });

  it("invalid origin → null (schema 検証 fail)", () => {
    const row = makeRow({ origin: "unknown_origin" });
    expect(mapRealtimeRow(row)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// computeNext — INSERT
// ─────────────────────────────────────────────

describe("B-3.4.c computeNext INSERT", () => {
  it("空 base に INSERT → 1 件 (newest first)", () => {
    const payload = makePayload("INSERT", makeRow({ id: "new-1" }));
    const next = computeNext([], payload, "user_a");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("new-1");
  });

  it("既存 1 件に INSERT → 新 item が先頭 (unshift)", () => {
    const existing = makeItem({ id: "old-1" });
    const payload = makePayload("INSERT", makeRow({ id: "new-1" }));
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe("new-1");
    expect(next[1].id).toBe("old-1");
  });

  it("internal_only INSERT → base に追加されない (defense in depth)", () => {
    const payload = makePayload(
      "INSERT",
      makeRow({ id: "new-1", visibility: "internal_only" }),
    );
    const next = computeNext([], payload, "user_a");
    expect(next).toHaveLength(0);
  });

  it("user_b_only INSERT を viewer=user_a で受信 → 表示しない (修正条件 2)", () => {
    const payload = makePayload(
      "INSERT",
      makeRow({ id: "new-1", visibility: "user_b_only" }),
    );
    const next = computeNext([], payload, "user_a");
    expect(next).toHaveLength(0);
  });

  it("user_a_only INSERT を viewer=user_a で受信 → 表示する", () => {
    const payload = makePayload(
      "INSERT",
      makeRow({ id: "new-1", visibility: "user_a_only" }),
    );
    const next = computeNext([], payload, "user_a");
    expect(next).toHaveLength(1);
  });

  it("同 id の INSERT (race) → 既存を置換", () => {
    const existing = makeItem({ id: "dup", content: "old" });
    const payload = makePayload(
      "INSERT",
      makeRow({ id: "dup", content: "new" }),
    );
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(1);
    expect(next[0].content).toBe("new");
  });
});

// ─────────────────────────────────────────────
// computeNext — UPDATE
// ─────────────────────────────────────────────

describe("B-3.4.c computeNext UPDATE", () => {
  it("既存 id を UPDATE → replace (content 等更新)", () => {
    const existing = makeItem({ id: "u-1", content: "old" });
    const payload = makePayload(
      "UPDATE",
      makeRow({ id: "u-1", content: "updated" }),
    );
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(1);
    expect(next[0].content).toBe("updated");
  });

  it("UPDATE で visibility=internal_only に変更 → filter out", () => {
    const existing = makeItem({ id: "u-1", visibility: "both_visible" });
    const payload = makePayload(
      "UPDATE",
      makeRow({ id: "u-1", visibility: "internal_only" }),
    );
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(0);
  });

  it("UPDATE で visibility=user_b_only に変更を viewer=user_a で受信 → filter out", () => {
    const existing = makeItem({ id: "u-1", visibility: "both_visible" });
    const payload = makePayload(
      "UPDATE",
      makeRow({ id: "u-1", visibility: "user_b_only" }),
    );
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(0);
  });

  it("subscribe 取りこぼし時の整合性: id 不在の UPDATE → append (newest first)", () => {
    const existing = makeItem({ id: "old-1" });
    const payload = makePayload(
      "UPDATE",
      makeRow({ id: "new-via-update", content: "appeared" }),
    );
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe("new-via-update");
  });
});

// ─────────────────────────────────────────────
// computeNext — DELETE
// ─────────────────────────────────────────────

describe("B-3.4.c computeNext DELETE", () => {
  it("既存 id を DELETE → filter out", () => {
    const existing1 = makeItem({ id: "d-1" });
    const existing2 = makeItem({ id: "d-2" });
    const payload = makePayload(
      "DELETE",
      undefined,
      { id: "d-1" },
    );
    const next = computeNext([existing1, existing2], payload, "user_a");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("d-2");
  });

  it("不在 id を DELETE → 変化なし", () => {
    const existing = makeItem({ id: "d-1" });
    const payload = makePayload("DELETE", undefined, { id: "ghost" });
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(1);
  });

  it("old payload null → 変化なし (防御的)", () => {
    const existing = makeItem({ id: "d-1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = makePayload("DELETE", undefined, undefined as any);
    payload.old = null;
    const next = computeNext([existing], payload, "user_a");
    expect(next).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// CEO 修正条件 1: throttle 中の連続 event 取りこぼし防止
// ─────────────────────────────────────────────

describe("B-3.4.c 修正条件 1 — throttle 中の連続 INSERT が両方残る (CEO 必須要件)", () => {
  it("250ms throttle window 内で INSERT 2 件連続: pendingRef を base にすれば両方残る", () => {
    // 1 件目 INSERT を pendingRef (= computeNext の base) に既に乗っている state とみなす
    const base: MemoryItem[] = [];
    const payload1 = makePayload("INSERT", makeRow({ id: "ev-1" }));
    const afterFirst = computeNext(base, payload1, "user_a");
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].id).toBe("ev-1");

    // 2 件目 INSERT は **pendingRef (= afterFirst)** を base にすべき
    // (もし itemsRef.current = [] を使うと ev-1 が消える = 取りこぼし)
    const payload2 = makePayload("INSERT", makeRow({ id: "ev-2" }));
    const afterSecond = computeNext(afterFirst, payload2, "user_a");

    expect(afterSecond).toHaveLength(2);
    // newest first なので ev-2 が先頭、ev-1 が後ろ
    expect(afterSecond[0].id).toBe("ev-2");
    expect(afterSecond[1].id).toBe("ev-1");
  });

  it("INSERT → UPDATE → DELETE 連続 (3 件、すべて pendingRef base): 最終結果が反映", () => {
    // 1. INSERT new-1
    let pending: MemoryItem[] = [];
    pending = computeNext(
      pending,
      makePayload("INSERT", makeRow({ id: "new-1", content: "v1" })),
      "user_a",
    );

    // 2. UPDATE new-1 (pendingRef を base に)
    pending = computeNext(
      pending,
      makePayload("UPDATE", makeRow({ id: "new-1", content: "v2" })),
      "user_a",
    );

    // 3. INSERT new-2 (pendingRef を base に)
    pending = computeNext(
      pending,
      makePayload("INSERT", makeRow({ id: "new-2" })),
      "user_a",
    );

    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe("new-2"); // newest first
    expect(pending[1].id).toBe("new-1");
    expect(pending[1].content).toBe("v2"); // UPDATE 反映済
  });

  it("反証: 仮に itemsRef.current (= [] 不変) を毎回 base にすると 2 件目が 1 件目を消す", () => {
    // この test は CEO 修正条件 1 の **必要性** を示す: もし base = itemsRef.current
    // (空のまま) を使うと、ev-2 INSERT 時に ev-1 が消える誤動作になる
    const itemsRefCurrent: MemoryItem[] = []; // 250ms flush 前なので itemsRef は更新されていない

    // (誤った実装の場合)
    const wrongFirst = computeNext(
      itemsRefCurrent,
      makePayload("INSERT", makeRow({ id: "ev-1" })),
      "user_a",
    );
    const wrongSecond = computeNext(
      itemsRefCurrent, // ← 同じ base を使うと取りこぼし
      makePayload("INSERT", makeRow({ id: "ev-2" })),
      "user_a",
    );
    // 誤った実装は ev-1 を失う (本 test は誤り検出のため):
    expect(wrongFirst).toHaveLength(1);
    expect(wrongSecond).toHaveLength(1); // ev-2 のみ、ev-1 取りこぼし
    expect(wrongSecond[0].id).toBe("ev-2");

    // → なので実装側は base = pendingRef.current ?? itemsRef.current にする必要あり (CEO 修正条件 1)
  });
});

// ─────────────────────────────────────────────
// 構造 invariant — Realtime 経路 + ChatClient 不可侵
// ─────────────────────────────────────────────

describe("B-3.4.c 構造 invariant — Realtime 経路 wire", () => {
  it("useMemoryItems.ts は Supabase browser client を import + channel subscribe", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{\s*supabaseBrowser\s*\}\s+from\s+["']@\/lib\/supabase\/client["']/,
    );
    expect(content).toMatch(/\.channel\(`coalter_memory:\$\{pairId\}`\)/);
    expect(content).toMatch(/postgres_changes/);
    expect(content).toMatch(/filter:\s*`pair_id=eq\.\$\{pairId\}`/);
    expect(content).toMatch(/\.subscribe\(/);
  });

  it("base = pendingRef.current ?? itemsRef.current (CEO 修正条件 1)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/pendingRef\.current\s*\?\?\s*itemsRef\.current/);
  });

  it("cleanup: clearTimeout + supabase.removeChannel (memory leak ゼロ)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/clearTimeout\(timerRef\.current\)/);
    expect(content).toMatch(/removeChannel\(channel\)/);
  });

  it("subscribe status fallback: CHANNEL_ERROR / TIMED_OUT で realtimeError 設定 (Gate C)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/CHANNEL_ERROR/);
    expect(content).toMatch(/TIMED_OUT/);
    expect(content).toMatch(/setRealtimeError\(/);
    // SUBSCRIBED で error クリア
    expect(content).toMatch(/SUBSCRIBED/);
  });

  it("ChatClient.tsx に touch していない (B-3.4 でも維持)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/<UpperLayerMount\s*\/>/);
    // threadId を UpperLayerMount に渡していない
    expect(content).not.toMatch(/<UpperLayerMount[^/]*threadId/);
    // ChatClient 自体は Realtime に絡んでいない (memory channel は UpperLayerMount → useMemoryItems で完結)
    expect(content).not.toMatch(/coalter_memory:/);
  });

  it("REALTIME_THROTTLE_MS export + value=250 (CEO 確定 2026-04-30)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /export\s+const\s+REALTIME_THROTTLE_MS\s*=\s*250/,
    );
  });
});
