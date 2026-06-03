import { describe, it, expect } from "vitest";

import {
  mergeCachedStateWithLocalImages,
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

/**
 * 2026-05-31 — branch3 IDB 正本化（写真消失 hotfix 第2弾）。
 *
 * localStorage v3 が quota で消えると v2_backup（古い画像込み 24件）が initialBundle になる。
 * 旧 branch3 merge は prev(v2_backup) を base にしていたため、 IDB の新しい id 集合との id 不一致で
 * 画像補完が効かず、 結果 prev のまま state 化 → persist で IDB が古い state で上書き → 写真消失。
 * IDB cache を正本にして prev の画像で同 id のみ補完する設計に変える。
 */
describe("mergeCachedStateWithLocalImages（branch3 IDB 正本化）", () => {
  const cachedFull = (n: number, rev: number): unknown => ({
    wardrobe: Array.from({ length: n }, (_, i) => w({ id: `new-${i}`, imageUrl: IMG, cutoutUrl: CUT })),
    _revision: rev,
  });

  it("① cached(IDB) 7件 画像あり → 7件 画像保持 (cached.rev を採用)", () => {
    const out = mergeCachedStateWithLocalImages(cachedFull(7, 26), []);
    expect(out).not.toBeNull();
    expect(out!.wardrobe).toHaveLength(7);
    expect(out!.wardrobe[0].imageUrl).toBe(IMG);
    expect(out!.wardrobe[0].cutoutUrl).toBe(CUT);
    expect(out!._revision).toBe(26);
  });

  it("② cached が null / undefined / 非オブジェクト → null（caller は prev 維持）", () => {
    expect(mergeCachedStateWithLocalImages(null, [])).toBeNull();
    expect(mergeCachedStateWithLocalImages(undefined, [])).toBeNull();
    expect(mergeCachedStateWithLocalImages("not-an-object", [])).toBeNull();
  });

  it("③ cached.wardrobe が空 → null（caller は prev 維持）", () => {
    expect(mergeCachedStateWithLocalImages({ wardrobe: [], _revision: 1 }, [])).toBeNull();
  });

  it("④ 削除は cached に従う（prev にあって cached に無い id は復活しない）", () => {
    const cached = {
      wardrobe: [w({ id: "new-1", imageUrl: IMG })],
      _revision: 26,
    };
    const prev = [
      w({ id: "v2-old-1", imageUrl: "OLD_IMG_1" }),
      w({ id: "v2-old-2", imageUrl: "OLD_IMG_2" }),
    ];
    const out = mergeCachedStateWithLocalImages(cached, prev);
    expect(out!.wardrobe).toHaveLength(1);
    expect(out!.wardrobe[0].id).toBe("new-1");
  });

  it("⑤ rev は cached を採用（prev.rev で上書きしない）— wrapper bump 回避の前提", () => {
    const cached = { wardrobe: [w({ id: "a", imageUrl: IMG })], _revision: 26 };
    const out = mergeCachedStateWithLocalImages(cached, [w({ id: "a", imageUrl: IMG })] /* rev 1 想定 */);
    expect(out!._revision).toBe(26);
  });

  it("⑥ cached に画像が欠落していて、 prev に同 id の画像があれば補完される（保険）", () => {
    const cached = { wardrobe: [w({ id: "a" })], _revision: 2 };
    const prev = [w({ id: "a", imageUrl: IMG, cutoutUrl: CUT })];
    const out = mergeCachedStateWithLocalImages(cached, prev);
    expect(out!.wardrobe[0].imageUrl).toBe(IMG);
    expect(out!.wardrobe[0].cutoutUrl).toBe(CUT);
  });

  it("⑦ CEO 観測の構図再現: cached 7件 新 id + prev 24件 古い id → state = 7件 cached 通り", () => {
    const cached = {
      wardrobe: Array.from({ length: 7 }, (_, i) => w({ id: `new-${i}`, imageUrl: IMG })),
      _revision: 26,
    };
    const prev = Array.from({ length: 24 }, (_, i) => w({ id: `v2-${i}`, imageUrl: "V2_IMG" }));
    const out = mergeCachedStateWithLocalImages(cached, prev);
    expect(out!.wardrobe).toHaveLength(7);
    // cached の画像が全部残る (cached 自身が画像を持っているため、 prev からの補完は不要)
    expect(out!.wardrobe.every((i) => i.imageUrl === IMG)).toBe(true);
    expect(out!._revision).toBe(26);
  });
});

import { readFileSync } from "node:fs";

describe("page.tsx 配線（IDB 正本化 + remote-load gate）", () => {
  const SRC = readFileSync("app/(immersive)/my-style/page.tsx", "utf8").replace(/\s+/g, " ");

  it("branch3 は mergeCachedStateWithLocalImages を rawSetState 経由で適用（rev wrapper bump を回避）", () => {
    expect(SRC).toContain("mergeCachedStateWithLocalImages(cached, prev.wardrobe)");
    expect(SRC).toContain("rawSetState((prev) => { const merged = mergeCachedStateWithLocalImages");
  });

  it("旧設計（prev base + cached patch）に戻っていない", () => {
    expect(SRC).not.toContain("mergeRestoredWardrobeImageFields(prev.wardrobe, cachedWardrobe)");
  });

  it("remote-load は restorationResolved 完了後に走る（race 解消）", () => {
    // remote-load effect の guard と deps
    expect(SRC).toContain("if (!restorationResolved) return; let active = true; async function loadRemote()");
    expect(SRC).toMatch(/loadRemote\(\); return \(\) => \{ active = false; \}; \}, \[restorationResolved\]\);/);
  });
});
