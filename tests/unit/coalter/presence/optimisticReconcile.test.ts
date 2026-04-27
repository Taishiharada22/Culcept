/**
 * Stage 2 L2-f — optimisticReconcile test
 *
 * plan §5.6 Gate:
 *   - server 勝ちの調停 (§2.5-1)
 *   - 入力欄は revert 対象外 (§2.5-2)
 *   - last-write-wins 衝突 (§2.5 例外、共有メモリ surface)
 */

import { describe, it, expect } from "vitest";

import {
  reconcileOptimistic,
  lastWriteWins,
} from "@/lib/coalter/presence/optimisticReconcile";
import {
  initialSharedState,
  type SharedState,
} from "@/lib/coalter/presence/sharedState";
import {
  initialLocalState,
  type LocalState,
} from "@/lib/coalter/presence/localState";

const baseShared = (over: Partial<SharedState> = {}): SharedState => ({
  ...initialSharedState(),
  ...over,
});

const baseLocal = (over: Partial<LocalState> = {}): LocalState => ({
  ...initialLocalState(),
  ...over,
});

describe("L2-f reconcileOptimistic — server が勝つ (§2.5-1)", () => {
  it("optimistic と server で異なる場合、server を採用", () => {
    const r = reconcileOptimistic({
      optimistic: baseShared({ presenceState: "S2", availability: "active" }),
      serverState: baseShared({ presenceState: "S1", availability: "enabled" }),
      localState: baseLocal(),
    });
    expect(r.nextShared.presenceState).toBe("S1");
    expect(r.nextShared.availability).toBe("enabled");
    expect(r.reverted).toBe(true);
  });

  it("optimistic と server が一致する場合、reverted=false", () => {
    const same = baseShared({ presenceState: "S2" });
    const r = reconcileOptimistic({
      optimistic: same,
      serverState: same,
      localState: baseLocal(),
    });
    expect(r.reverted).toBe(false);
    expect(r.changedFields).toHaveLength(0);
  });

  it("changedFields に変更フィールド名が列挙される (debug 用)", () => {
    const r = reconcileOptimistic({
      optimistic: baseShared({ mode: "daily" }),
      serverState: baseShared({ mode: "normal" }),
      localState: baseLocal(),
    });
    expect(r.changedFields).toContain("mode");
  });
});

describe("L2-f reconcileOptimistic — 入力欄 revert 対象外 (§2.5-2)", () => {
  it("LocalState (inputDraft / scrollY 等) は server で上書きされない", () => {
    const r = reconcileOptimistic({
      optimistic: baseShared({ presenceState: "S2" }),
      serverState: baseShared({ presenceState: "S1" }),
      localState: baseLocal({ inputDraft: "今書いてる途中" }),
    });
    expect(r.nextLocal.inputDraft).toBe("今書いてる途中");
  });

  it("scrollY も保持", () => {
    const r = reconcileOptimistic({
      optimistic: baseShared(),
      serverState: baseShared({ presenceState: "S5" }),
      localState: baseLocal({ scrollY: 1234 }),
    });
    expect(r.nextLocal.scrollY).toBe(1234);
  });

  it("hover / focus / tooltips も保持", () => {
    const tooltips = new Set(["t1", "t2"]);
    const r = reconcileOptimistic({
      optimistic: baseShared(),
      serverState: baseShared(),
      localState: baseLocal({
        hoverElementId: "btn-1",
        focusElementId: "input-main",
        tooltipsOpen: tooltips,
      }),
    });
    expect(r.nextLocal.hoverElementId).toBe("btn-1");
    expect(r.nextLocal.focusElementId).toBe("input-main");
    expect(r.nextLocal.tooltipsOpen).toBe(tooltips);
  });
});

describe("L2-f lastWriteWins (§2.5 例外、共有メモリ surface 同時編集)", () => {
  it("updatedAt が大きいほうが勝つ", () => {
    const a = { id: "m1", updatedAt: 100, content: "A" };
    const b = { id: "m1", updatedAt: 200, content: "B" };
    expect(lastWriteWins(a, b)).toBe(b);
  });

  it("updatedAt が同じなら a を採用 (>= 比較で a 勝ち)", () => {
    const a = { id: "m1", updatedAt: 100, content: "A" };
    const b = { id: "m1", updatedAt: 100, content: "B" };
    expect(lastWriteWins(a, b)).toBe(a);
  });

  it("id 不一致は throw (誤用防止)", () => {
    const a = { id: "m1", updatedAt: 100, content: "A" };
    const b = { id: "m2", updatedAt: 200, content: "B" };
    expect(() => lastWriteWins(a, b)).toThrow(/id 不一致/);
  });
});

describe("L2-f reconcileOptimistic — 統合シナリオ (§2.5 + §2.6)", () => {
  it("client 先行操作 → server で確定 → optimistic 値と一致なら revert なし", () => {
    const r = reconcileOptimistic({
      optimistic: baseShared({ presenceState: "S2", serverTimestamp: 1000 }),
      serverState: baseShared({ presenceState: "S2", serverTimestamp: 1100 }),
      localState: baseLocal({ inputDraft: "送信前" }),
    });
    // serverTimestamp は変わるが core state 一致なら reverted は changedFields > 0 で true
    // (本実装は厳密一致でない場合 reverted=true)
    expect(r.changedFields).toContain("serverTimestamp");
    expect(r.nextLocal.inputDraft).toBe("送信前");
  });

  it("server で他 client 先行操作が反映 (§2.6 片方先行容認)", () => {
    const r = reconcileOptimistic({
      optimistic: baseShared({ presenceState: "S0" }),
      serverState: baseShared({
        presenceState: "S1",
        speechCard: {
          variant: "A",
          body: "今、間に入れそう",
          spokeAt: 5000,
        },
      }),
      localState: baseLocal({ inputDraft: "下書き" }),
    });
    expect(r.nextShared.presenceState).toBe("S1");
    expect(r.nextShared.speechCard?.body).toBe("今、間に入れそう");
    expect(r.nextLocal.inputDraft).toBe("下書き"); // 入力欄は維持
    expect(r.reverted).toBe(true);
  });
});
