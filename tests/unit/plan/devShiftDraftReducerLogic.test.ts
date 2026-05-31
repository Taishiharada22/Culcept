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
  type DevShiftDraftAction,
  type DevShiftDraftState,
  type ImageMeta,
} from "@/app/(culcept)/plan/dev-shift-draft/devShiftDraftReducer";
import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";

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
    const errored: DevShiftDraftState = {
      kind: "error",
      imageObjectUrl: URL1,
      message: "test",
    };
    const next = devShiftDraftReducer(errored, {
      type: "row_selected",
      selection: SELECTION,
    });
    expect(next).toBe(errored);
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

  it("error (url あり) → imageObjectUrl", () => {
    expect(
      currentImageObjectUrl({
        kind: "error",
        imageObjectUrl: URL1,
        message: "x",
      })
    ).toBe(URL1);
  });

  it("error (url なし) → null", () => {
    expect(
      currentImageObjectUrl({
        kind: "error",
        imageObjectUrl: null,
        message: "x",
      })
    ).toBeNull();
  });

  it("cells_loaded → imageObjectUrl が維持される（review 中に元画像を見られる前提）", () => {
    // 8-c-3 で初到達する状態だが、型レベル契約として helper 動作を固定。
    expect(
      currentImageObjectUrl({
        kind: "cells_loaded",
        imageObjectUrl: URL1,
        imageMeta: META,
        selection: SELECTION,
        cells: [],
        year: 2025,
        month: 7,
      })
    ).toBe(URL1);
  });
});
