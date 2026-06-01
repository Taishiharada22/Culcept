import { describe, it, expect } from "vitest";

import {
  type ComposeState,
  composeReducer,
  emptyComposeState,
  emptyDraftCore,
  hasUnsavedPlaced,
  isPlaceable,
} from "@/lib/plan/compose/composeDraft";

function withDraft(
  id: string,
  core: Partial<ReturnType<typeof emptyDraftCore>> = {},
): ComposeState {
  return composeReducer(emptyComposeState(), { type: "add", id, core });
}

describe("add", () => {
  it("draft を追加（既定 time=none / placement=unplaced）", () => {
    const s = withDraft("d1", { title: "企画書" });
    expect(s.drafts).toHaveLength(1);
    expect(s.drafts[0]).toMatchObject({
      id: "d1",
      core: { title: "企画書", locationText: "", rigidity: "" },
      time: { mode: "none" },
      placement: { status: "unplaced" },
    });
  });

  it("同一 id の再 add は冪等（重複しない）", () => {
    let s = withDraft("d1", { title: "A" });
    s = composeReducer(s, { type: "add", id: "d1", core: { title: "B" } });
    expect(s.drafts).toHaveLength(1);
    expect(s.drafts[0].core.title).toBe("A"); // 既存維持
  });
});

describe("updateCore / setTime", () => {
  it("core を部分更新", () => {
    let s = withDraft("d1", { title: "企画書" });
    s = composeReducer(s, {
      type: "updateCore",
      id: "d1",
      patch: { locationText: "カフェ", rigidity: "soft" },
    });
    expect(s.drafts[0].core).toMatchObject({
      title: "企画書",
      locationText: "カフェ",
      rigidity: "soft",
    });
  });

  it("time constraint を差し替え", () => {
    let s = withDraft("d1");
    s = composeReducer(s, {
      type: "setTime",
      id: "d1",
      time: { mode: "both", startMin: 900, endMin: 1020 },
    });
    expect(s.drafts[0].time).toEqual({ mode: "both", startMin: 900, endMin: 1020 });
  });
});

describe("isPlaceable", () => {
  it("title + 場所文言 が揃えば配置可能（場所は『カフェ』だけでも可）", () => {
    const s = withDraft("d1", { title: "企画書", locationText: "カフェ" });
    expect(isPlaceable(s.drafts[0])).toBe(true);
  });

  it("title だけ / 場所だけ は不可", () => {
    expect(isPlaceable(withDraft("a", { title: "企画書" }).drafts[0])).toBe(false);
    expect(isPlaceable(withDraft("b", { locationText: "カフェ" }).drafts[0])).toBe(false);
  });

  it("空白のみは不可", () => {
    expect(
      isPlaceable(withDraft("c", { title: "  ", locationText: " " }).drafts[0]),
    ).toBe(false);
  });
});

describe("place", () => {
  it("必須充足 + 開始＋終了 → placed に解決（120分・60上書きなし）", () => {
    let s = withDraft("d1", { title: "会議", locationText: "渋谷" });
    s = composeReducer(s, {
      type: "setTime",
      id: "d1",
      time: { mode: "both", startMin: 900, endMin: 1020 },
    });
    s = composeReducer(s, { type: "place", id: "d1", dropStartMin: 600 });
    expect(s.drafts[0].placement).toEqual({
      status: "placed",
      startMin: 900,
      endMin: 1020,
      crossesMidnight: false,
      edgeClamped: false,
    });
  });

  it("未定 → drop 位置が開始、end=null", () => {
    let s = withDraft("d1", { title: "散歩", locationText: "公園" });
    s = composeReducer(s, { type: "place", id: "d1", dropStartMin: 905 });
    expect(s.drafts[0].placement).toMatchObject({
      status: "placed",
      startMin: 905,
      endMin: null,
    });
  });

  it("必須未充足は配置しない（unplaced のまま）", () => {
    let s = withDraft("d1", { title: "会議" }); // 場所なし
    s = composeReducer(s, { type: "place", id: "d1", dropStartMin: 905 });
    expect(s.drafts[0].placement.status).toBe("unplaced");
  });
});

describe("unplace / remove", () => {
  it("unplace で unplaced に戻す（戻す導線・A-0-4）", () => {
    let s = withDraft("d1", { title: "会議", locationText: "渋谷" });
    s = composeReducer(s, { type: "place", id: "d1", dropStartMin: 900 });
    expect(s.drafts[0].placement.status).toBe("placed");
    s = composeReducer(s, { type: "unplace", id: "d1" });
    expect(s.drafts[0].placement.status).toBe("unplaced");
  });

  it("remove で削除（削除導線・A-0-4）", () => {
    let s = withDraft("d1", { title: "会議", locationText: "渋谷" });
    s = composeReducer(s, { type: "add", id: "d2", core: { title: "ランチ" } });
    s = composeReducer(s, { type: "remove", id: "d1" });
    expect(s.drafts.map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("hasUnsavedPlaced（日付切替ブロック判定・A-0-3）", () => {
  it("placed が 1 件でもあれば true", () => {
    let s = withDraft("d1", { title: "会議", locationText: "渋谷" });
    expect(hasUnsavedPlaced(s)).toBe(false);
    s = composeReducer(s, { type: "place", id: "d1", dropStartMin: 900 });
    expect(hasUnsavedPlaced(s)).toBe(true);
  });

  it("全て unplaced なら false", () => {
    const s = withDraft("d1", { title: "会議", locationText: "渋谷" });
    expect(hasUnsavedPlaced(s)).toBe(false);
  });
});
