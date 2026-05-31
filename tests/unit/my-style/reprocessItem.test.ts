import { describe, it, expect } from "vitest";

import {
  canReprocessItem,
  getReprocessSourceUrl,
  mergeCutoutDraftIntoItem,
  buildReprocessWardrobeUpdater,
} from "@/app/(immersive)/my-style/_lib/reprocessItem";
import { EMPTY_STATE } from "@/app/(immersive)/my-style/_lib/state";
import type { CutoutDraft } from "@/app/(immersive)/my-style/_lib/cutoutBrowser";
import type { SavedState, WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";

/* ── fixtures ── */

function item(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return { id: "i1", name: "テストアイテム", category: "tops", color: "#222", ...overrides };
}

function makeState(wardrobe: WardrobeItem[]): SavedState {
  return { ...EMPTY_STATE, wardrobe };
}

const DATA_IMG = "data:image/jpeg;base64,ORIGINALPHOTO";
const DATA_ORIG = "data:image/jpeg;base64,ORIGINALURLPHOTO";
const REMOTE = "https://cdn.example.com/photo.jpg";

const successManual: CutoutDraft = {
  dataUrl: "data:image/png;base64,NEWCUTOUT",
  status: "success",
  method: "manual",
  confidence: 0.91,
};
const successHeuristic: CutoutDraft = {
  dataUrl: "data:image/png;base64,HEURISTICCUT",
  status: "success",
  method: "heuristic_v1",
  confidence: 0.74,
};
const failedDraft: CutoutDraft = { status: "failed", method: "none", confidence: 0.1 };
const skippedDraft: CutoutDraft = { status: "skipped", method: "none" };

/* ── ① reprocess 可否 / ③ source 優先順位 ── */

describe("getReprocessSourceUrl / canReprocessItem", () => {
  it("① imageUrl が dataURL の item は reprocess 可能（source = imageUrl）", () => {
    const w = item({ imageUrl: DATA_IMG });
    expect(getReprocessSourceUrl(w)).toBe(DATA_IMG);
    expect(canReprocessItem(w)).toBe(true);
  });

  it("② imageUrl も originalUrl も無い item は reprocess 不可（null / false）", () => {
    const w = item({});
    expect(getReprocessSourceUrl(w)).toBeNull();
    expect(canReprocessItem(w)).toBe(false);
  });

  it("③-a imageUrl(dataURL) と originalUrl(dataURL) 両方 → imageUrl を優先", () => {
    const w = item({ imageUrl: DATA_IMG, originalUrl: DATA_ORIG });
    expect(getReprocessSourceUrl(w)).toBe(DATA_IMG);
  });

  it("③-b imageUrl 無し・originalUrl(dataURL) のみ → originalUrl を fallback 採用", () => {
    const w = item({ originalUrl: DATA_ORIG });
    expect(getReprocessSourceUrl(w)).toBe(DATA_ORIG);
    expect(canReprocessItem(w)).toBe(true);
  });

  it("③-c imageUrl が remote URL（非 dataURL）+ originalUrl(dataURL) → originalUrl を採用", () => {
    const w = item({ imageUrl: REMOTE, originalUrl: DATA_ORIG });
    expect(getReprocessSourceUrl(w)).toBe(DATA_ORIG);
  });

  it("③-d imageUrl が remote URL のみ（dataURL なし）→ reprocess 不可（CORS 安全ゲート）", () => {
    const w = item({ imageUrl: REMOTE });
    expect(getReprocessSourceUrl(w)).toBeNull();
    expect(canReprocessItem(w)).toBe(false);
  });

  it("③-e 空文字 imageUrl は dataURL とみなさない", () => {
    expect(getReprocessSourceUrl(item({ imageUrl: "" }))).toBeNull();
  });
});

/* ── ④⑤⑦ mergeCutoutDraftIntoItem は cutout 系 field のみ更新・他保持 ── */

describe("mergeCutoutDraftIntoItem — cutout 系 field のみ更新", () => {
  it("⑦ success/manual draft → cutoutStatus=success / cutoutUrl / method=manual / confidence 保存", () => {
    const before = item({ imageUrl: DATA_IMG });
    const after = mergeCutoutDraftIntoItem(before, successManual);
    expect(after.cutoutUrl).toBe("data:image/png;base64,NEWCUTOUT");
    expect(after.cutoutStatus).toBe("success");
    expect(after.cutoutMethod).toBe("manual");
    expect(after.cutoutConfidence).toBeCloseTo(0.91);
  });

  it("⑦ success/heuristic_v1 draft → cutoutStatus=success / method=heuristic_v1", () => {
    const after = mergeCutoutDraftIntoItem(item({ imageUrl: DATA_IMG }), successHeuristic);
    expect(after.cutoutStatus).toBe("success");
    expect(after.cutoutMethod).toBe("heuristic_v1");
    expect(after.cutoutUrl).toBe("data:image/png;base64,HEURISTICCUT");
  });

  it("④⑤ imageUrl / originalUrl / name / category / color / attributes は保持（cutout 以外不変）", () => {
    const before = item({
      imageUrl: DATA_IMG,
      originalUrl: DATA_ORIG,
      name: "ネイビーニット",
      category: "tops",
      color: "#1a2b5c",
      attributes: { warmth: 2, stretch: "some" },
      season: "aw",
    });
    const after = mergeCutoutDraftIntoItem(before, successManual);
    // cutout だけ付与
    expect(after.cutoutUrl).toBe("data:image/png;base64,NEWCUTOUT");
    // 原画・fallback・属性は完全保持
    expect(after.imageUrl).toBe(DATA_IMG);
    expect(after.originalUrl).toBe(DATA_ORIG);
    expect(after.name).toBe("ネイビーニット");
    expect(after.category).toBe("tops");
    expect(after.color).toBe("#1a2b5c");
    expect(after.attributes).toEqual({ warmth: 2, stretch: "some" });
    expect(after.season).toBe("aw");
  });

  it("⑤ imageUrl は success draft でも絶対に上書きされない（draft.dataUrl は cutoutUrl 側のみ）", () => {
    const before = item({ imageUrl: DATA_IMG });
    const after = mergeCutoutDraftIntoItem(before, successManual);
    expect(after.imageUrl).toBe(DATA_IMG); // dataUrl は cutoutUrl に入り、imageUrl は不変
    expect(after.imageUrl).not.toBe(after.cutoutUrl);
  });
});

/* ── ⑥ failed/skipped draft では既存 cutout を壊さない ── */

describe("mergeCutoutDraftIntoItem — failed/skipped は既存 cutout を壊さない", () => {
  it("⑥ 既存 success cutout を持つ item に failed draft → 同一参照で no-op（cutout 保持）", () => {
    const withCutout = item({
      imageUrl: DATA_IMG,
      cutoutUrl: "data:image/png;base64,GOODCUT",
      cutoutStatus: "success",
      cutoutMethod: "manual",
      cutoutConfidence: 0.88,
    });
    const after = mergeCutoutDraftIntoItem(withCutout, failedDraft);
    expect(after).toBe(withCutout); // 同一参照
    expect(after.cutoutUrl).toBe("data:image/png;base64,GOODCUT");
    expect(after.cutoutStatus).toBe("success");
  });

  it("⑥ 既存 success cutout に skipped draft → 同一参照で no-op", () => {
    const withCutout = item({
      imageUrl: DATA_IMG,
      cutoutUrl: "data:image/png;base64,GOODCUT",
      cutoutStatus: "success",
    });
    expect(mergeCutoutDraftIntoItem(withCutout, skippedDraft)).toBe(withCutout);
  });

  it("⑥ cutout 未保持の item に failed draft → 同一参照で no-op（failed status を書き込まない）", () => {
    const plain = item({ imageUrl: DATA_IMG });
    const after = mergeCutoutDraftIntoItem(plain, failedDraft);
    expect(after).toBe(plain);
    expect(after.cutoutStatus).toBeUndefined();
    expect(after.cutoutUrl).toBeUndefined();
    expect(after.imageUrl).toBe(DATA_IMG);
  });
});

/* ── ⑧⑨ buildReprocessWardrobeUpdater ── */

describe("buildReprocessWardrobeUpdater", () => {
  it("⑧ 対象 id の item だけ更新し、他 item は同一参照で維持", () => {
    const state = makeState([
      item({ id: "a", imageUrl: DATA_IMG }),
      item({ id: "b", imageUrl: "data:image/jpeg;base64,BPHOTO" }),
    ]);
    const next = buildReprocessWardrobeUpdater("a", successManual)(state);
    const a = next.wardrobe.find((w) => w.id === "a")!;
    const b = next.wardrobe.find((w) => w.id === "b")!;
    expect(a.cutoutUrl).toBe("data:image/png;base64,NEWCUTOUT");
    expect(a.cutoutStatus).toBe("success");
    expect(b).toBe(state.wardrobe[1]); // b は touch されず同一参照
    expect(next).not.toBe(state); // 変化したので新 state
  });

  it("⑨ 対象 id が存在しない → state を同一参照で返す（壊さない）", () => {
    const state = makeState([item({ id: "a", imageUrl: DATA_IMG })]);
    const next = buildReprocessWardrobeUpdater("does-not-exist", successManual)(state);
    expect(next).toBe(state);
  });

  it("⑨ 対象 id はあるが merge が no-op（failed draft）→ state を同一参照で返す", () => {
    const state = makeState([
      item({ id: "a", imageUrl: DATA_IMG, cutoutUrl: "data:image/png;base64,GOODCUT", cutoutStatus: "success" }),
    ]);
    const next = buildReprocessWardrobeUpdater("a", failedDraft)(state);
    expect(next).toBe(state);
  });

  it("⑧ wardrobe 以外の state field は保持される", () => {
    const base = makeState([item({ id: "a", imageUrl: DATA_IMG })]);
    const state: SavedState = { ...base, memo: "keep-me", _revision: 7 };
    const next = buildReprocessWardrobeUpdater("a", successManual)(state);
    expect(next.memo).toBe("keep-me");
    expect(next._revision).toBe(7);
    expect(next.setups).toBe(state.setups);
  });
});

/* ── ⑩ 入力 item / state を破壊しない ── */

describe("immutability — 入力を破壊しない", () => {
  it("⑩ mergeCutoutDraftIntoItem は入力 item を mutate しない", () => {
    const before = item({ imageUrl: DATA_IMG, originalUrl: DATA_ORIG, attributes: { warmth: 2 } });
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = mergeCutoutDraftIntoItem(before, successManual);
    expect(before).toEqual(snapshot); // 入力不変
    expect(after).not.toBe(before); // 別オブジェクト
  });

  it("⑩ buildReprocessWardrobeUpdater は入力 state / wardrobe を mutate しない", () => {
    const state = makeState([
      item({ id: "a", imageUrl: DATA_IMG }),
      item({ id: "b", imageUrl: "data:image/jpeg;base64,BPHOTO" }),
    ]);
    const snapshot = JSON.parse(JSON.stringify(state));
    const originalWardrobeRef = state.wardrobe;
    buildReprocessWardrobeUpdater("a", successManual)(state);
    expect(state).toEqual(snapshot); // 入力 state 不変
    expect(state.wardrobe).toBe(originalWardrobeRef); // 元 wardrobe 配列は差し替わらない
  });
});
