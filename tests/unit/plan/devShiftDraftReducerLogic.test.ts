/**
 * SR B1b-2C-8-c-2 — DevShiftDraftClient reducer pure 検証
 *
 * 不変条件:
 *   ① image_loaded はどの state からでも遷移可（差替含む）→ 新 imageObjectUrl/imageMeta を保持
 *   ② row_selected は image_loaded / row_selected のみ受理（idle / 抽出系は no-op）
 *      → imageObjectUrl は前 state を引き継ぐ（差替なし）
 *   ③ cancel は常に idle に戻す
 *   ④ reducer は **revoke を実行しない**（pure 維持）
 *   ⑤ state に File / Blob が混入しない（型レベルで構造的に禁止 — runtime にも不在）
 *   ⑥ cells_loaded への遷移 action は 8-c-2 では未追加（型のみ・action なし）
 *   ⑦ currentImageObjectUrl は state.kind に応じた url を返す
 */
import { describe, it, expect } from "vitest";

import {
  INITIAL_STATE,
  currentImageObjectUrl,
  devShiftDraftReducer,
  outcomeToAction,
  type DevShiftDraftAction,
  type DevShiftDraftState,
  type ImageMeta,
} from "@/app/(culcept)/plan/dev-shift-draft/devShiftDraftReducer";
import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

const META: ImageMeta = {
  width: 1860,
  height: 846,
  mimeType: "image/png",
  fileName: "shift.png",
  sizeBytes: 240_000,
};
const META2: ImageMeta = {
  width: 2480,
  height: 1080,
  mimeType: "image/jpeg",
  fileName: "shift-2.jpg",
  sizeBytes: 312_000,
};

const URL1 = "blob:http://localhost/abc-111";
const URL2 = "blob:http://localhost/def-222";

const SELECTION: AssistedRowSelection = {
  imageW: 1860,
  imageH: 846,
  headerBand: { top: 40, bottom: 80 },
  personRowBand: { top: 120, bottom: 180 },
};
const SELECTION_ADJUSTED: AssistedRowSelection = {
  ...SELECTION,
  personRowBand: { top: 130, bottom: 190 },
};

const loadImage = (url: string, meta: ImageMeta): DevShiftDraftAction => ({
  type: "image_loaded",
  imageObjectUrl: url,
  imageMeta: meta,
});

const CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "H", confidence: 1 },
];

/** 共有 fixture: row_selected / extracting / error の各状態（8-c-3 transition 用）。 */
const ROW_SELECTED: DevShiftDraftState = {
  kind: "row_selected",
  imageObjectUrl: URL1,
  imageMeta: META,
  selection: SELECTION,
};
const EXTRACTING: DevShiftDraftState = {
  kind: "extracting",
  imageObjectUrl: URL1,
  imageMeta: META,
  selection: SELECTION,
  year: 2025,
  month: 7,
};
const ERRORED: DevShiftDraftState = {
  kind: "error",
  imageObjectUrl: URL1,
  imageMeta: META,
  selection: SELECTION,
  year: 2025,
  month: 7,
  message: "読み取りに失敗しました。",
};

describe("devShiftDraftReducer — INITIAL_STATE / shape", () => {
  it("INITIAL_STATE は kind=idle", () => {
    expect(INITIAL_STATE).toEqual({ kind: "idle" });
  });
});

describe("devShiftDraftReducer — image_loaded アクション", () => {
  it("idle → image_loaded（新 URL/meta 採用）", () => {
    const next = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    expect(next).toEqual({
      kind: "image_loaded",
      imageObjectUrl: URL1,
      imageMeta: META,
    });
  });

  it("image_loaded → image_loaded（差替: 新 URL/meta で上書き）", () => {
    const after1 = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const after2 = devShiftDraftReducer(after1, loadImage(URL2, META2));
    expect(after2).toEqual({
      kind: "image_loaded",
      imageObjectUrl: URL2,
      imageMeta: META2,
    });
  });

  it("row_selected → image_loaded（差替: selection は失われる＝意図通り）", () => {
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const b = devShiftDraftReducer(a, { type: "row_selected", selection: SELECTION });
    expect(b.kind).toBe("row_selected");

    const c = devShiftDraftReducer(b, loadImage(URL2, META2));
    expect(c).toEqual({
      kind: "image_loaded",
      imageObjectUrl: URL2,
      imageMeta: META2,
    });
  });

  it("reducer は revoke を実行しない（pure 維持）— 旧 URL の文字列値はそのまま破棄され、副作用なし", () => {
    // pure 関数なので副作用検証は不要だが、戻り値に 'revoked' 等のメタ情報が混入しないことを担保
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const b = devShiftDraftReducer(a, loadImage(URL2, META2));
    expect(b).not.toHaveProperty("revoked");
    expect(b).not.toHaveProperty("previousImageObjectUrl");
  });
});

describe("devShiftDraftReducer — row_selected アクション", () => {
  it("image_loaded → row_selected（imageObjectUrl/meta を引き継ぐ）", () => {
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const b = devShiftDraftReducer(a, { type: "row_selected", selection: SELECTION });
    expect(b).toEqual({
      kind: "row_selected",
      imageObjectUrl: URL1,
      imageMeta: META,
      selection: SELECTION,
    });
  });

  it("row_selected → row_selected（band 調整: imageObjectUrl 不変 / selection 上書き）", () => {
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const b = devShiftDraftReducer(a, { type: "row_selected", selection: SELECTION });
    const c = devShiftDraftReducer(b, { type: "row_selected", selection: SELECTION_ADJUSTED });
    expect(c).toEqual({
      kind: "row_selected",
      imageObjectUrl: URL1, // 不変
      imageMeta: META, // 不変
      selection: SELECTION_ADJUSTED,
    });
  });

  it("idle → row_selected は no-op（state 不変）", () => {
    const next = devShiftDraftReducer(INITIAL_STATE, {
      type: "row_selected",
      selection: SELECTION,
    });
    expect(next).toBe(INITIAL_STATE);
  });

  it("error 状態からの row_selected は no-op（不正遷移を防ぐ）", () => {
    const next = devShiftDraftReducer(ERRORED, {
      type: "row_selected",
      selection: SELECTION,
    });
    expect(next).toBe(ERRORED);
  });
});

describe("devShiftDraftReducer — cancel アクション", () => {
  it("image_loaded → idle", () => {
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const b = devShiftDraftReducer(a, { type: "cancel" });
    expect(b).toEqual({ kind: "idle" });
  });

  it("row_selected → idle", () => {
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const b = devShiftDraftReducer(a, { type: "row_selected", selection: SELECTION });
    const c = devShiftDraftReducer(b, { type: "cancel" });
    expect(c).toEqual({ kind: "idle" });
  });

  it("idle + cancel は idle のまま", () => {
    const next = devShiftDraftReducer(INITIAL_STATE, { type: "cancel" });
    expect(next).toEqual({ kind: "idle" });
  });
});

describe("devShiftDraftReducer — state に File / Blob / base64 が混入しないことの構造的保証", () => {
  it("image_loaded state の field を列挙し、File/Blob/base64 系が存在しない", () => {
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const keys = Object.keys(a);
    // CEO 不変条件: kind / imageObjectUrl / imageMeta のみ
    expect(keys.sort()).toEqual(["imageMeta", "imageObjectUrl", "kind"]);
    // 念のため、想定外 field がないか
    expect(keys).not.toContain("file");
    expect(keys).not.toContain("blob");
    expect(keys).not.toContain("dataUrl");
    expect(keys).not.toContain("base64");
    expect(keys).not.toContain("buffer");
  });

  it("row_selected state も同様（File/Blob 不在）", () => {
    const a = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    const b = devShiftDraftReducer(a, { type: "row_selected", selection: SELECTION });
    const keys = Object.keys(b);
    expect(keys.sort()).toEqual([
      "imageMeta",
      "imageObjectUrl",
      "kind",
      "selection",
    ]);
    expect(keys).not.toContain("file");
    expect(keys).not.toContain("blob");
    expect(keys).not.toContain("dataUrl");
    expect(keys).not.toContain("base64");
  });
});

describe("currentImageObjectUrl helper", () => {
  it("idle → null", () => {
    expect(currentImageObjectUrl({ kind: "idle" })).toBeNull();
  });

  it("image_loaded → imageObjectUrl", () => {
    expect(
      currentImageObjectUrl({
        kind: "image_loaded",
        imageObjectUrl: URL1,
        imageMeta: META,
      })
    ).toBe(URL1);
  });

  it("row_selected → imageObjectUrl", () => {
    expect(
      currentImageObjectUrl({
        kind: "row_selected",
        imageObjectUrl: URL1,
        imageMeta: META,
        selection: SELECTION,
      })
    ).toBe(URL1);
  });

  it("error → imageObjectUrl（retry context を保持）", () => {
    expect(currentImageObjectUrl(ERRORED)).toBe(URL1);
  });

  it("cells_loaded → imageObjectUrl が維持される（review 中に元画像を見られる前提）", () => {
    // 型レベル契約として helper 動作を固定。
    expect(
      currentImageObjectUrl({
        kind: "cells_loaded",
        imageObjectUrl: URL1,
        imageMeta: META,
        selection: SELECTION,
        cells: [],
        year: 2025,
        month: 7,
        reviewOpen: false,
      })
    ).toBe(URL1);
  });

  it("saved → null（imageObjectUrl 不保持 → useEffect 差分検出で自動 revoke）", () => {
    expect(
      currentImageObjectUrl({
        kind: "saved",
        year: 2025,
        month: 7,
        cellCount: 3,
      })
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// 8-c-3: 抽出 transition
// ─────────────────────────────────────────────────────────────

describe("devShiftDraftReducer — extract_started", () => {
  it("row_selected → extracting（targetMonth を持ち込む）", () => {
    const next = devShiftDraftReducer(ROW_SELECTED, {
      type: "extract_started",
      year: 2025,
      month: 7,
    });
    expect(next).toEqual({
      kind: "extracting",
      imageObjectUrl: URL1,
      imageMeta: META,
      selection: SELECTION,
      year: 2025,
      month: 7,
    });
  });

  it("idle / image_loaded / extracting / error からの extract_started は no-op", () => {
    expect(
      devShiftDraftReducer(INITIAL_STATE, { type: "extract_started", year: 2025, month: 7 })
    ).toBe(INITIAL_STATE);
    const imgLoaded = devShiftDraftReducer(INITIAL_STATE, loadImage(URL1, META));
    expect(
      devShiftDraftReducer(imgLoaded, { type: "extract_started", year: 2025, month: 7 })
    ).toBe(imgLoaded);
    expect(
      devShiftDraftReducer(EXTRACTING, { type: "extract_started", year: 2025, month: 7 })
    ).toBe(EXTRACTING);
    expect(
      devShiftDraftReducer(ERRORED, { type: "extract_started", year: 2025, month: 7 })
    ).toBe(ERRORED);
  });
});

describe("devShiftDraftReducer — extract_succeeded", () => {
  it("extracting → cells_loaded（year/month は extracting から引き継ぐ、reviewOpen 既定 false）", () => {
    const next = devShiftDraftReducer(EXTRACTING, {
      type: "extract_succeeded",
      cells: CELLS,
    });
    expect(next).toEqual({
      kind: "cells_loaded",
      imageObjectUrl: URL1,
      imageMeta: META,
      selection: SELECTION,
      cells: CELLS,
      year: 2025,
      month: 7,
      reviewOpen: false, // 8-c-4: 自動 open 禁止（CEO 補正）
    });
  });

  it("extracting 以外からの extract_succeeded は no-op", () => {
    expect(
      devShiftDraftReducer(ROW_SELECTED, { type: "extract_succeeded", cells: CELLS })
    ).toBe(ROW_SELECTED);
    expect(
      devShiftDraftReducer(INITIAL_STATE, { type: "extract_succeeded", cells: CELLS })
    ).toBe(INITIAL_STATE);
  });
});

describe("devShiftDraftReducer — extract_failed", () => {
  it("extracting → error（retry context を保持）", () => {
    const next = devShiftDraftReducer(EXTRACTING, {
      type: "extract_failed",
      message: "読み取りに失敗しました。",
    });
    expect(next).toEqual({
      kind: "error",
      imageObjectUrl: URL1,
      imageMeta: META,
      selection: SELECTION,
      year: 2025,
      month: 7,
      message: "読み取りに失敗しました。",
    });
  });

  it("extracting 以外からの extract_failed は no-op", () => {
    expect(
      devShiftDraftReducer(ROW_SELECTED, { type: "extract_failed", message: "x" })
    ).toBe(ROW_SELECTED);
  });
});

describe("devShiftDraftReducer — extract_retry", () => {
  it("error → extracting（同 selection / targetMonth で再試行）", () => {
    const next = devShiftDraftReducer(ERRORED, { type: "extract_retry" });
    expect(next).toEqual({
      kind: "extracting",
      imageObjectUrl: URL1,
      imageMeta: META,
      selection: SELECTION,
      year: 2025,
      month: 7,
    });
  });

  it("error 以外からの extract_retry は no-op", () => {
    expect(devShiftDraftReducer(EXTRACTING, { type: "extract_retry" })).toBe(EXTRACTING);
    expect(devShiftDraftReducer(INITIAL_STATE, { type: "extract_retry" })).toBe(INITIAL_STATE);
  });
});

describe("devShiftDraftReducer — cancel は抽出系からも idle へ", () => {
  it("extracting → idle", () => {
    expect(devShiftDraftReducer(EXTRACTING, { type: "cancel" })).toEqual({ kind: "idle" });
  });
  it("error → idle", () => {
    expect(devShiftDraftReducer(ERRORED, { type: "cancel" })).toEqual({ kind: "idle" });
  });
});

describe("outcomeToAction — submit outcome → dispatch action", () => {
  it("cells → extract_succeeded", () => {
    expect(
      outcomeToAction({ kind: "cells", cells: CELLS, year: 2025, month: 7 })
    ).toEqual({ type: "extract_succeeded", cells: CELLS });
  });
  it("error → extract_failed", () => {
    expect(outcomeToAction({ kind: "error", message: "x" })).toEqual({
      type: "extract_failed",
      message: "x",
    });
  });
  it("invalid_selection → null（dispatch しない）", () => {
    expect(outcomeToAction({ kind: "invalid_selection" })).toBeNull();
  });

  it("cells outcome → extract_succeeded → reducer で cells_loaded（合成パス）", () => {
    // outcome → action → reducer の合成で「success → cells_loaded」を pure に固定。
    const action = outcomeToAction({ kind: "cells", cells: CELLS, year: 2025, month: 7 });
    expect(action).not.toBeNull();
    const next = devShiftDraftReducer(EXTRACTING, action as DevShiftDraftAction);
    expect(next.kind).toBe("cells_loaded");
  });

  it("error outcome → extract_failed → reducer で error（合成パス）", () => {
    const action = outcomeToAction({ kind: "error", message: "失敗しました" });
    const next = devShiftDraftReducer(EXTRACTING, action as DevShiftDraftAction);
    expect(next.kind).toBe("error");
  });
});

// ─────────────────────────────────────────────────────────────
// 8-c-4: 確認画面（reviewOpen）+ 保存（saved）transition
// ─────────────────────────────────────────────────────────────

/** 共通 cells_loaded fixture（reviewOpen は各 test で変える）。 */
const CELLS_LOADED = (reviewOpen: boolean): DevShiftDraftState => ({
  kind: "cells_loaded",
  imageObjectUrl: URL1,
  imageMeta: META,
  selection: SELECTION,
  cells: CELLS,
  year: 2025,
  month: 7,
  reviewOpen,
});

describe("devShiftDraftReducer — open_review / close_review", () => {
  it("cells_loaded(reviewOpen=false) + open_review → reviewOpen=true（imageObjectUrl 保持）", () => {
    const before = CELLS_LOADED(false);
    const next = devShiftDraftReducer(before, { type: "open_review" });
    expect(next).toEqual({ ...before, reviewOpen: true });
    expect(next.kind === "cells_loaded" && next.imageObjectUrl).toBe(URL1);
  });

  it("cells_loaded(reviewOpen=true) + open_review は冪等（同一 reference）", () => {
    const opened = CELLS_LOADED(true);
    expect(devShiftDraftReducer(opened, { type: "open_review" })).toBe(opened);
  });

  it("cells_loaded(reviewOpen=true) + close_review → reviewOpen=false", () => {
    const opened = CELLS_LOADED(true);
    const next = devShiftDraftReducer(opened, { type: "close_review" });
    expect(next).toEqual({ ...opened, reviewOpen: false });
  });

  it("cells_loaded(reviewOpen=false) + close_review は冪等", () => {
    const closed = CELLS_LOADED(false);
    expect(devShiftDraftReducer(closed, { type: "close_review" })).toBe(closed);
  });

  it("cells_loaded 以外からの open_review / close_review は no-op", () => {
    expect(devShiftDraftReducer(INITIAL_STATE, { type: "open_review" })).toBe(INITIAL_STATE);
    expect(devShiftDraftReducer(EXTRACTING, { type: "open_review" })).toBe(EXTRACTING);
    expect(devShiftDraftReducer(ERRORED, { type: "open_review" })).toBe(ERRORED);
    expect(devShiftDraftReducer(EXTRACTING, { type: "close_review" })).toBe(EXTRACTING);
  });
});

describe("devShiftDraftReducer — save_succeeded", () => {
  it("cells_loaded → saved（imageObjectUrl 不保持 / cellCount は cells.length）", () => {
    const before = CELLS_LOADED(true);
    const next = devShiftDraftReducer(before, { type: "save_succeeded" });
    expect(next).toEqual({
      kind: "saved",
      year: 2025,
      month: 7,
      cellCount: CELLS.length,
    });
    // saved state に imageObjectUrl が無いことを構造的に保証
    expect(Object.keys(next)).not.toContain("imageObjectUrl");
    expect(Object.keys(next)).not.toContain("imageMeta");
    expect(Object.keys(next)).not.toContain("cells");
  });

  it("cells_loaded 以外からの save_succeeded は no-op", () => {
    expect(devShiftDraftReducer(INITIAL_STATE, { type: "save_succeeded" })).toBe(INITIAL_STATE);
    expect(devShiftDraftReducer(EXTRACTING, { type: "save_succeeded" })).toBe(EXTRACTING);
    expect(devShiftDraftReducer(ERRORED, { type: "save_succeeded" })).toBe(ERRORED);
  });

  it("save_succeeded で currentImageObjectUrl(saved)=null → useEffect 差分検出で revoke 発火", () => {
    const before = CELLS_LOADED(true);
    expect(currentImageObjectUrl(before)).toBe(URL1);
    const after = devShiftDraftReducer(before, { type: "save_succeeded" });
    expect(currentImageObjectUrl(after)).toBeNull();
  });
});

describe("devShiftDraftReducer — saved 終端 + cancel", () => {
  it("saved + cancel → idle", () => {
    const saved: DevShiftDraftState = {
      kind: "saved",
      year: 2025,
      month: 7,
      cellCount: 3,
    };
    expect(devShiftDraftReducer(saved, { type: "cancel" })).toEqual({ kind: "idle" });
  });

  it("saved からの open_review / close_review / save_succeeded / extract_retry は no-op", () => {
    const saved: DevShiftDraftState = {
      kind: "saved",
      year: 2025,
      month: 7,
      cellCount: 3,
    };
    expect(devShiftDraftReducer(saved, { type: "open_review" })).toBe(saved);
    expect(devShiftDraftReducer(saved, { type: "close_review" })).toBe(saved);
    expect(devShiftDraftReducer(saved, { type: "save_succeeded" })).toBe(saved);
    expect(devShiftDraftReducer(saved, { type: "extract_retry" })).toBe(saved);
  });
});
