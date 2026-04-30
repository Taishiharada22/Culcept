/**
 * Stage 2 L2-i — memoryStore CRUD + §8.3.1/4 + viewer/scope filter test
 *
 * plan v0.3 §5.9 Gate:
 *   - §8.3 全項目の TypeScript 型化 (memoryTypes.ts でカバー)
 *   - §8.3.4 禁止組み合わせが構造的に生成不可能 (addMemoryItem / updateMemoryItem
 *     で throw、本 test で確認)
 */

import { describe, it, expect } from "vitest";

import {
  addMemoryItem,
  emptyMemoryStore,
  filterByModeScope,
  filterByViewer,
  pruneExpiredMemory,
  removeMemoryItem,
  updateMemoryItem,
  type MemoryStore,
} from "@/lib/coalter/presence/memoryStore";
import type { MemoryItem } from "@/lib/coalter/presence/memoryTypes";
import {
  FORBIDDEN_COMBINATIONS,
  isForbiddenCombination,
} from "@/lib/coalter/presence/memoryConstraints";
import {
  resolveLabelDisplay,
} from "@/lib/coalter/presence/memoryLabelHierarchy";
import {
  ORIGIN_SHAPE,
  CERTAINTY_VISUAL,
  VISIBILITY_LABEL,
} from "@/lib/coalter/presence/memoryVisualType";

const item = (over: Partial<MemoryItem> = {}): MemoryItem => ({
  id: "m1",
  content: "test",
  origin: "explicit_shared",
  certainty: "high",
  visibility: "both_visible",
  modeContext: "normal",
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

// ─────────────────────────────────────────────
// CRUD 基本
// ─────────────────────────────────────────────

describe("L2-i memoryStore — CRUD 基本", () => {
  it("emptyMemoryStore() は空の ReadonlyArray", () => {
    expect(emptyMemoryStore()).toHaveLength(0);
  });

  it("addMemoryItem で項目を追加 (immutable)", () => {
    const s0 = emptyMemoryStore();
    const s1 = addMemoryItem(s0, item());
    expect(s1).toHaveLength(1);
    expect(s0).toHaveLength(0); // 元 store は不変
    expect(s1[0].id).toBe("m1");
  });

  it("重複 id は throw", () => {
    const s = addMemoryItem(emptyMemoryStore(), item({ id: "dup" }));
    expect(() => addMemoryItem(s, item({ id: "dup" }))).toThrow(/already exists/);
  });

  it("updateMemoryItem は updater 経由で部分更新", () => {
    const s = addMemoryItem(emptyMemoryStore(), item({ id: "m1", content: "old" }));
    const next = updateMemoryItem(s, "m1", (cur) => ({
      ...cur,
      content: "new",
      updatedAt: 9999,
    }));
    expect(next[0].content).toBe("new");
    expect(next[0].updatedAt).toBe(9999);
  });

  it("updateMemoryItem 存在しない id は no-op", () => {
    const s = addMemoryItem(emptyMemoryStore(), item({ id: "m1" }));
    const next = updateMemoryItem(s, "missing", (cur) => cur);
    expect(next).toBe(s);
  });

  it("removeMemoryItem で削除", () => {
    const s = addMemoryItem(emptyMemoryStore(), item({ id: "m1" }));
    expect(removeMemoryItem(s, "m1")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// §8.3.4 禁止組み合わせ enforce
// ─────────────────────────────────────────────

describe("L2-i memoryStore — §8.3.4 禁止組み合わせ構造的 enforce", () => {
  it("FORBIDDEN_COMBINATIONS は 3 件 (UI spec §8.3.4)", () => {
    expect(FORBIDDEN_COMBINATIONS).toHaveLength(3);
  });

  it("inferred × high × both_visible は addMemoryItem で throw", () => {
    expect(() =>
      addMemoryItem(
        emptyMemoryStore(),
        item({ origin: "inferred", certainty: "high", visibility: "both_visible" }),
      ),
    ).toThrow(/Forbidden memory combination/);
  });

  it("transient_summary × high × both_visible は throw", () => {
    expect(() =>
      addMemoryItem(
        emptyMemoryStore(),
        item({
          origin: "transient_summary",
          certainty: "high",
          visibility: "both_visible",
        }),
      ),
    ).toThrow(/Forbidden/);
  });

  it("transient_summary × medium × both_visible は throw", () => {
    expect(() =>
      addMemoryItem(
        emptyMemoryStore(),
        item({
          origin: "transient_summary",
          certainty: "medium",
          visibility: "both_visible",
        }),
      ),
    ).toThrow(/Forbidden/);
  });

  it("updateMemoryItem も §8.3.4 違反を弾く", () => {
    const s = addMemoryItem(
      emptyMemoryStore(),
      item({ origin: "inferred", certainty: "low", visibility: "internal_only" }),
    );
    expect(() =>
      updateMemoryItem(s, "m1", (cur) => ({
        ...cur,
        certainty: "high",
        visibility: "both_visible",
      })),
    ).toThrow(/Forbidden/);
  });

  it("isForbiddenCombination は 3 件すべて true", () => {
    for (const f of FORBIDDEN_COMBINATIONS) {
      expect(isForbiddenCombination(f.origin, f.certainty, f.visibility)).toBe(true);
    }
  });

  it("許可組み合わせは false (例: explicit_shared × high × both_visible)", () => {
    expect(
      isForbiddenCombination("explicit_shared", "high", "both_visible"),
    ).toBe(false);
    expect(isForbiddenCombination("inferred", "low", "internal_only")).toBe(false);
    expect(
      isForbiddenCombination("transient_summary", "low", "user_a_only"),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 3 軸独立性 (§8.3.1)
// ─────────────────────────────────────────────

describe("L2-i memoryStore — §8.3.1 3 軸独立性", () => {
  it("由来は形 (色ではなく) で区別、3 種すべて mapping 済", () => {
    expect(ORIGIN_SHAPE.explicit_shared).toBe("diamond");
    expect(ORIGIN_SHAPE.inferred).toBe("circle");
    expect(ORIGIN_SHAPE.transient_summary).toBe("triangle");
  });

  it("確定度は線種 (主) + 透明度 (補助)、low は補助ラベル付き (§8.3.2 単独透明度禁止)", () => {
    expect(CERTAINTY_VISUAL.high.borderStyle).toBe("solid");
    expect(CERTAINTY_VISUAL.medium.borderStyle).toBe("dashed");
    expect(CERTAINTY_VISUAL.low.borderStyle).toBe("dotted");
    expect(CERTAINTY_VISUAL.low.auxLabel).not.toBeNull(); // §8.3.2 補助ラベル必須
  });

  it("可視性は文言ミニラベル分類 (4 種)", () => {
    expect(VISIBILITY_LABEL.both_visible).toBe("both");
    expect(VISIBILITY_LABEL.user_a_only).toBe("user_a");
    expect(VISIBILITY_LABEL.user_b_only).toBe("user_b");
    expect(VISIBILITY_LABEL.internal_only).toBe("internal");
  });
});

// ─────────────────────────────────────────────
// §8.3.3 ラベル階層 (resolveLabelDisplay)
// ─────────────────────────────────────────────

describe("L2-i memoryLabelHierarchy — §8.3.3 ラベル階層", () => {
  it("由来は常に表示 (§8.3.3 不変原則)", () => {
    const cases: Array<[Parameters<typeof resolveLabelDisplay>[0], Parameters<typeof resolveLabelDisplay>[1], Parameters<typeof resolveLabelDisplay>[2]]> = [
      ["explicit_shared", "high", "both_visible"],
      ["inferred", "medium", "user_a_only"],
      ["transient_summary", "low", "internal_only"],
    ];
    for (const [o, c, v] of cases) {
      expect(resolveLabelDisplay(o, c, v).showOrigin).toBe(true);
    }
  });

  it("explicit_shared × high × both_visible は確定度・可視性 省略可", () => {
    const r = resolveLabelDisplay("explicit_shared", "high", "both_visible");
    expect(r.showCertainty).toBe(false);
    expect(r.showVisibility).toBe(false);
  });

  it("inferred は確定度必須、可視性は both のみ省略", () => {
    expect(
      resolveLabelDisplay("inferred", "low", "both_visible").showVisibility,
    ).toBe(false);
    expect(
      resolveLabelDisplay("inferred", "low", "user_a_only").showVisibility,
    ).toBe(true);
    expect(
      resolveLabelDisplay("inferred", "medium", "internal_only").showCertainty,
    ).toBe(true);
  });

  it("transient_summary は全軸必須 (時間経過で消える旨含む)", () => {
    const r = resolveLabelDisplay("transient_summary", "low", "user_a_only");
    expect(r.showOrigin).toBe(true);
    expect(r.showCertainty).toBe(true);
    expect(r.showVisibility).toBe(true);
  });

  it("片側可視性 (`_only`) は必ず表示 (誤認防止、§8.3.3 不変)", () => {
    expect(
      resolveLabelDisplay("explicit_shared", "high", "user_a_only").showVisibility,
    ).toBe(true);
    expect(
      resolveLabelDisplay("explicit_shared", "high", "user_b_only").showVisibility,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────
// pruneExpiredMemory / filterByModeScope / filterByViewer
// ─────────────────────────────────────────────

describe("L2-i memoryStore — pruneExpiredMemory", () => {
  it("expiresAt < now の項目を除外、それ以外は残す", () => {
    const now = 5000;
    let s: MemoryStore = emptyMemoryStore();
    s = addMemoryItem(s, item({ id: "live", expiresAt: undefined }));
    s = addMemoryItem(
      s,
      item({
        id: "expired",
        origin: "transient_summary",
        certainty: "low",
        visibility: "internal_only",
        expiresAt: 4000,
      }),
    );
    s = addMemoryItem(
      s,
      item({
        id: "future",
        origin: "transient_summary",
        certainty: "low",
        visibility: "user_a_only",
        expiresAt: 6000,
      }),
    );
    const pruned = pruneExpiredMemory(s, now);
    expect(pruned.map((m) => m.id)).toEqual(["live", "future"]);
  });
});

describe("L2-i memoryStore — filterByModeScope (§10.2)", () => {
  it("通常モード scope は全項目参照 (ゆるく見続ける)", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(s, item({ id: "n", modeContext: "normal" }));
    s = addMemoryItem(s, item({ id: "d", modeContext: "daily" }));
    s = addMemoryItem(s, item({ id: "t", modeContext: "travel" }));
    expect(filterByModeScope(s, "normal")).toHaveLength(3);
  });

  it("Daily scope は当該 mode + 共有メモリ (explicit_shared × high)", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(s, item({ id: "shared", modeContext: "normal" })); // explicit_shared × high (default)
    s = addMemoryItem(
      s,
      item({
        id: "n_low",
        modeContext: "normal",
        origin: "inferred",
        certainty: "low",
        visibility: "internal_only",
      }),
    );
    s = addMemoryItem(s, item({ id: "d", modeContext: "daily" }));
    const filtered = filterByModeScope(s, "daily");
    expect(filtered.map((m) => m.id).sort()).toEqual(["d", "shared"]);
  });
});

describe("L2-i memoryStore — filterByViewer", () => {
  it("user_a viewer は both_visible + user_a_only", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(s, item({ id: "both", visibility: "both_visible" }));
    s = addMemoryItem(
      s,
      item({
        id: "a_only",
        origin: "inferred",
        certainty: "medium",
        visibility: "user_a_only",
      }),
    );
    s = addMemoryItem(
      s,
      item({
        id: "b_only",
        origin: "inferred",
        certainty: "medium",
        visibility: "user_b_only",
      }),
    );
    s = addMemoryItem(
      s,
      item({
        id: "internal",
        origin: "inferred",
        certainty: "low",
        visibility: "internal_only",
      }),
    );
    const filtered = filterByViewer(s, "user_a");
    expect(filtered.map((m) => m.id).sort()).toEqual(["a_only", "both"]);
  });

  it("user_b viewer は both_visible + user_b_only", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(s, item({ id: "both", visibility: "both_visible" }));
    s = addMemoryItem(
      s,
      item({
        id: "b_only",
        origin: "inferred",
        certainty: "medium",
        visibility: "user_b_only",
      }),
    );
    const filtered = filterByViewer(s, "user_b");
    expect(filtered.map((m) => m.id).sort()).toEqual(["b_only", "both"]);
  });

  it("internal_only は両 viewer に表示しない", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(
      s,
      item({
        id: "internal",
        origin: "inferred",
        certainty: "low",
        visibility: "internal_only",
      }),
    );
    expect(filterByViewer(s, "user_a")).toHaveLength(0);
    expect(filterByViewer(s, "user_b")).toHaveLength(0);
  });
});
