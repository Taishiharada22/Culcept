import { describe, it, expect } from "vitest";

import {
  mergeRemoteStateWithLocalImages,
  mergeRestoredWardrobeImageFields,
  normalizeSavedState,
  stripHeavyImageUrls,
} from "@/app/(immersive)/my-style/_lib/state";
import type { SavedState, WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";

/**
 * C1L-6 — 再読込時 heavy 画像フィールド復元（cutoutUrl が消える問題の hotfix）。
 *
 * localStorage は stripHeavyImageUrls で imageUrl/originalUrl/cutoutUrl を除去するため、
 * 再読込時に IDB(full state) から復元する。 旧実装は imageUrl だけ復元して cutout を落とし、
 * 直後の自動 persist が IDB を cutoutUrl 無しで上書きして透過表示を壊していた。
 */

function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return { name: "item", category: "tops", color: "#000", ...p } as WardrobeItem;
}

const IMG = "data:image/jpeg;base64,IMG";
const CUT = "data:image/png;base64,CUT";
const ORIG = "data:image/jpeg;base64,ORIG";

describe("C1L-6 — mergeRestoredWardrobeImageFields", () => {
  it("① cached に imageUrl → current に imageUrl を復元", () => {
    const out = mergeRestoredWardrobeImageFields([w({ id: "a" })], [w({ id: "a", imageUrl: IMG })]);
    expect(out[0].imageUrl).toBe(IMG);
  });

  it("② cached に cutoutUrl → current に cutoutUrl を復元", () => {
    const out = mergeRestoredWardrobeImageFields(
      [w({ id: "a", cutoutStatus: "success" })],
      [w({ id: "a", imageUrl: IMG, cutoutUrl: CUT, cutoutStatus: "success" })],
    );
    expect(out[0].cutoutUrl).toBe(CUT);
    expect(out[0].imageUrl).toBe(IMG);
  });

  it("③ cached に originalUrl → current に originalUrl を復元", () => {
    const out = mergeRestoredWardrobeImageFields([w({ id: "a" })], [w({ id: "a", originalUrl: ORIG })]);
    expect(out[0].originalUrl).toBe(ORIG);
  });

  it("④ cutoutStatus / cutoutMethod / cutoutConfidence は current 側を保持（cached metadata で上書きしない）", () => {
    const out = mergeRestoredWardrobeImageFields(
      [w({ id: "a", cutoutStatus: "success", cutoutMethod: "manual", cutoutConfidence: 0.9 })],
      [w({ id: "a", cutoutUrl: CUT, cutoutStatus: "needs_review", cutoutMethod: "heuristic_v1", cutoutConfidence: 0.1 })],
    );
    expect(out[0].cutoutStatus).toBe("success");
    expect(out[0].cutoutMethod).toBe("manual");
    expect(out[0].cutoutConfidence).toBe(0.9);
    expect(out[0].cutoutUrl).toBe(CUT); // heavy は復元される
  });

  it("⑤ cached に cutoutUrl が無い → current の cutoutUrl を undefined で潰さない", () => {
    const out = mergeRestoredWardrobeImageFields(
      [w({ id: "a", cutoutUrl: CUT, cutoutStatus: "success" })],
      [w({ id: "a", imageUrl: IMG })],
    );
    expect(out[0].cutoutUrl).toBe(CUT); // 維持
    expect(out[0].imageUrl).toBe(IMG); // imageUrl は復元
  });

  it("⑥ id 不一致の cached は無視（current を変えない・同参照）", () => {
    const current = [w({ id: "a" })];
    const out = mergeRestoredWardrobeImageFields(current, [w({ id: "z", imageUrl: IMG, cutoutUrl: CUT })]);
    expect(out[0].imageUrl).toBeUndefined();
    expect(out[0].cutoutUrl).toBeUndefined();
    expect(out).toBe(current);
  });

  it("⑦ wardrobe の順番を変えない", () => {
    const current = [w({ id: "a" }), w({ id: "b" }), w({ id: "c" })];
    const cached = [
      w({ id: "c", imageUrl: "C" }),
      w({ id: "a", imageUrl: "A" }),
      w({ id: "b", imageUrl: "B" }),
    ];
    const out = mergeRestoredWardrobeImageFields(current, cached);
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(out.map((i) => i.imageUrl)).toEqual(["A", "B", "C"]);
  });

  it("⑧ legacy item は imageUrl だけでも従来どおり復元される（cutout 無し）", () => {
    const out = mergeRestoredWardrobeImageFields([w({ id: "a" })], [w({ id: "a", imageUrl: IMG })]);
    expect(out[0].imageUrl).toBe(IMG);
    expect(out[0].cutoutUrl).toBeUndefined();
    expect(out[0].originalUrl).toBeUndefined();
  });

  it("⑨ 復元後も stripHeavyImageUrls の挙動は不変（base64 を再び除去・metadata 保持）", () => {
    const restored = mergeRestoredWardrobeImageFields(
      [w({ id: "a", cutoutStatus: "success" })],
      [w({ id: "a", imageUrl: IMG, cutoutUrl: CUT, originalUrl: ORIG, cutoutStatus: "success" })],
    );
    const stripped = stripHeavyImageUrls(restored);
    expect(stripped[0].imageUrl).toBeUndefined();
    expect(stripped[0].cutoutUrl).toBeUndefined();
    expect(stripped[0].originalUrl).toBeUndefined();
    expect(stripped[0].cutoutStatus).toBe("success"); // 軽量 metadata は残る
  });

  it("補: current に既に imageUrl がある場合は cached で上書きしない（同参照）", () => {
    const current = [w({ id: "a", imageUrl: "CURRENT" })];
    const out = mergeRestoredWardrobeImageFields(current, [w({ id: "a", imageUrl: "CACHED" })]);
    expect(out[0].imageUrl).toBe("CURRENT");
    expect(out).toBe(current);
  });

  it("補: 何も復元されなければ同じ配列参照を返す（再描画ゼロ）", () => {
    const current = [w({ id: "a", imageUrl: IMG })];
    expect(mergeRestoredWardrobeImageFields(current, [])).toBe(current);
  });
});

/**
 * 2026-05-31 — revision-aware remote-adopt の写真消失 hotfix。
 *
 * server snapshot は stripHeavyImageUrls 済で画像が無いため、 remote adopt をそのまま finalize すると
 * IDB 復元済の画像が消える。 mergeRemoteStateWithLocalImages は remote の wardrobe を base にして、
 * prev(IDB 復元済) の画像を id 一致で補完する。 削除は remote に従う（remote に無い id は復活しない）。
 */
function mkState(wardrobe: WardrobeItem[], rev = 0): SavedState {
  return { ...normalizeSavedState({}), wardrobe, _revision: rev };
}

describe("mergeRemoteStateWithLocalImages（remote 採用時の画像保持）", () => {
  it("⓵ remote(画像なし) + prev(画像あり・同id) → 画像が保持される", () => {
    const remote = mkState([w({ id: "a" }), w({ id: "b" })], 2);
    const prev = [w({ id: "a", imageUrl: IMG, cutoutUrl: CUT }), w({ id: "b", imageUrl: ORIG })];
    const out = mergeRemoteStateWithLocalImages(remote, prev);
    expect(out.wardrobe[0].imageUrl).toBe(IMG);
    expect(out.wardrobe[0].cutoutUrl).toBe(CUT);
    expect(out.wardrobe[1].imageUrl).toBe(ORIG);
  });

  it("⓶ remote の rev / 件数 / 並びは保持される（remote が source of truth）", () => {
    const remote = mkState([w({ id: "x" }), w({ id: "y" })], 5);
    const prev = [w({ id: "x", imageUrl: IMG })];
    const out = mergeRemoteStateWithLocalImages(remote, prev);
    expect(out._revision).toBe(5);
    expect(out.wardrobe.map((i) => i.id)).toEqual(["x", "y"]);
  });

  it("⓷ remote に無い id は復活しない（削除は remote に従う）", () => {
    const remote = mkState([w({ id: "a" })], 3);
    const prev = [w({ id: "a", imageUrl: IMG }), w({ id: "deleted", imageUrl: IMG })];
    const out = mergeRemoteStateWithLocalImages(remote, prev);
    expect(out.wardrobe.map((i) => i.id)).toEqual(["a"]);
    expect(out.wardrobe).toHaveLength(1);
  });

  it("⓸ metadata は remote 優先（name/category 等は最新の server を採用）", () => {
    const remote = mkState([w({ id: "a", name: "NEW NAME" })], 2);
    const prev = [w({ id: "a", name: "OLD NAME", imageUrl: IMG })];
    const out = mergeRemoteStateWithLocalImages(remote, prev);
    expect(out.wardrobe[0].name).toBe("NEW NAME");
    expect(out.wardrobe[0].imageUrl).toBe(IMG); // 画像だけ prev から
  });

  it("⓹ prev に画像が無ければ remote のまま（白抜きのまま・無害）", () => {
    const remote = mkState([w({ id: "a" })], 2);
    const prev = [w({ id: "a" })];
    const out = mergeRemoteStateWithLocalImages(remote, prev);
    expect(out.wardrobe[0].imageUrl).toBeUndefined();
  });

  it("⓺ remote が空（delete-all）→ wardrobe も空（画像保持に巻き戻らない）", () => {
    const remote = mkState([], 3);
    const prev = [w({ id: "a", imageUrl: IMG }), w({ id: "b", imageUrl: IMG })];
    const out = mergeRemoteStateWithLocalImages(remote, prev);
    expect(out.wardrobe).toEqual([]);
  });

  it("補: remote が全件画像あり（あり得ないが）→ remote の値を使う", () => {
    const remote = mkState([w({ id: "a", imageUrl: "REMOTE_IMG" })], 2);
    const prev = [w({ id: "a", imageUrl: IMG })];
    const out = mergeRemoteStateWithLocalImages(remote, prev);
    // mergeRestoredWardrobeImageFields は current に値がある場合上書きしない
    expect(out.wardrobe[0].imageUrl).toBe("REMOTE_IMG");
  });
});
