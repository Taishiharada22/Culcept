/**
 * Stage 2 L2-i — modeContextManager 文脈継承 test
 *
 * plan v0.3 §5.9 Gate:
 *   - mode 遷移時の文脈継承ルール (§10.3 ルール準拠)
 */

import { describe, it, expect } from "vitest";

import { addMemoryItem, emptyMemoryStore } from "@/lib/coalter/presence/memoryStore";
import {
  applyContextTransition,
  countByModeContext,
  handoffOnReturn,
  inheritOnPromote,
} from "@/lib/coalter/presence/modeContextManager";
import type { MemoryItem } from "@/lib/coalter/presence/memoryTypes";

const baseItem = (over: Partial<MemoryItem> = {}): MemoryItem => ({
  id: "x",
  content: "test",
  origin: "explicit_shared",
  certainty: "high",
  visibility: "both_visible",
  modeContext: "normal",
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

describe("L2-i modeContextManager — inheritOnPromote (§10.3 通常 → Daily/Travel)", () => {
  it("explicit_shared × high の通常項目を Daily 文脈に複製", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(s, baseItem({ id: "h1", certainty: "high" }));
    s = addMemoryItem(
      s,
      baseItem({ id: "m1", certainty: "medium", visibility: "user_a_only" }),
    );
    const next = inheritOnPromote(s, "daily", 5000);
    // 元 2 件 + 継承 2 件 = 4 件
    expect(next).toHaveLength(4);
    const inheritedIds = next
      .filter((m) => m.modeContext === "daily")
      .map((m) => m.id);
    expect(inheritedIds.sort()).toEqual(["h1@daily", "m1@daily"]);
  });

  it("low certainty の項目は継承しない (高確定度のみ持ち込み、§10.3 ヒント)", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(
      s,
      baseItem({
        id: "low1",
        origin: "inferred",
        certainty: "low",
        visibility: "internal_only",
      }),
    );
    const next = inheritOnPromote(s, "daily", 5000);
    expect(next.filter((m) => m.modeContext === "daily")).toHaveLength(0);
  });

  it("inferred / transient_summary は継承しない (explicit_shared のみ)", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(
      s,
      baseItem({
        id: "inf",
        origin: "inferred",
        certainty: "medium",
        visibility: "user_a_only",
      }),
    );
    s = addMemoryItem(
      s,
      baseItem({
        id: "tran",
        origin: "transient_summary",
        certainty: "low",
        visibility: "user_a_only",
      }),
    );
    const next = inheritOnPromote(s, "travel", 5000);
    expect(next.filter((m) => m.modeContext === "travel")).toHaveLength(0);
  });
});

describe("L2-i modeContextManager — handoffOnReturn (§10.3 Daily/Travel → 通常)", () => {
  it("planSummary が transient_summary として通常文脈に追加される", () => {
    const s = emptyMemoryStore();
    const next = handoffOnReturn(
      s,
      "daily",
      { id: "plan_today", content: "夕方の買い物 + 20 分会話" },
      5000,
      5000 + 24 * 60 * 60 * 1000,
    );
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("plan_today");
    expect(next[0].origin).toBe("transient_summary");
    expect(next[0].modeContext).toBe("normal");
    // §8.3.4 違反防止: transient_summary × medium × both_visible は禁止のため
    // internal_only に格納
    expect(next[0].visibility).toBe("internal_only");
    expect(next[0].expiresAt).toBeDefined();
  });

  it("planSummary が null なら store 不変", () => {
    const s = emptyMemoryStore();
    expect(handoffOnReturn(s, "daily", null, 5000, 99999)).toBe(s);
  });
});

describe("L2-i modeContextManager — applyContextTransition (facade)", () => {
  it("通常 → daily 時 inheritOnPromote 実行", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(s, baseItem({ id: "h" }));
    const next = applyContextTransition(
      s,
      { from: "normal", to: "daily" },
      5000,
    );
    expect(next.filter((m) => m.modeContext === "daily")).toHaveLength(1);
  });

  it("daily → 通常 + planSummary で handoff 実行", () => {
    const s = emptyMemoryStore();
    const next = applyContextTransition(
      s,
      { from: "daily", to: "normal" },
      5000,
      {
        planSummary: { id: "p1", content: "1 日プラン完成" },
      },
    );
    expect(next).toHaveLength(1);
    expect(next[0].origin).toBe("transient_summary");
  });

  it("daily → 通常 + planSummary なしで store 不変", () => {
    const s = emptyMemoryStore();
    const next = applyContextTransition(
      s,
      { from: "daily", to: "normal" },
      5000,
    );
    expect(next).toHaveLength(0);
  });
});

describe("L2-i modeContextManager — countByModeContext", () => {
  it("各 mode 文脈の項目数を正しく数える", () => {
    let s = emptyMemoryStore();
    s = addMemoryItem(s, baseItem({ id: "n1", modeContext: "normal" }));
    s = addMemoryItem(s, baseItem({ id: "n2", modeContext: "normal" }));
    s = addMemoryItem(s, baseItem({ id: "d1", modeContext: "daily" }));
    expect(countByModeContext(s, "normal")).toBe(2);
    expect(countByModeContext(s, "daily")).toBe(1);
    expect(countByModeContext(s, "travel")).toBe(0);
  });
});

describe("L2-i modeContextManager — §8.3.4 整合性", () => {
  it("inheritOnPromote で生成された項目は §8.3.4 違反を起こさない", () => {
    // explicit_shared × high (or medium) × both_visible は許可組み合わせ
    let s = emptyMemoryStore();
    s = addMemoryItem(
      s,
      baseItem({ id: "h1", certainty: "high", visibility: "both_visible" }),
    );
    s = addMemoryItem(
      s,
      baseItem({ id: "m1", certainty: "medium", visibility: "user_a_only" }),
    );
    // promotion してもエラーにならない
    expect(() => inheritOnPromote(s, "daily", 5000)).not.toThrow();
  });

  it("handoffOnReturn は internal_only で格納し §8.3.4 transient_summary × medium × both_visible 禁止を回避", () => {
    const s = emptyMemoryStore();
    const next = handoffOnReturn(
      s,
      "daily",
      { id: "p1", content: "プラン" },
      5000,
      99999,
    );
    expect(next[0].origin).toBe("transient_summary");
    expect(next[0].certainty).toBe("medium");
    // both_visible だと §8.3.4 違反 → internal_only に格納されている
    expect(next[0].visibility).toBe("internal_only");
  });
});
