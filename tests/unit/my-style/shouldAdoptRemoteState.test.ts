import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { shouldAdoptRemoteState, normalizeSavedState } from "@/app/(immersive)/my-style/_lib/state";
import type { SavedState, WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";

/**
 * Fix D — 削除復活の停止。 server remote は「現在の state（mount 時に IDB から復元され得る）」が
 * virgin のときだけ採用する。 IDB/current が meaningful なら server で上書きしない（IDB > server）。
 * Fix C — quota 失敗時に main snapshot を removeItem しない（virgin 化→server 巻き戻りを防ぐ）。
 */

const empty = (): SavedState => normalizeSavedState({});
const withWardrobe = (): SavedState => ({
  ...empty(),
  wardrobe: [{ id: "a", name: "x", category: "tops", color: "#000" } as WardrobeItem],
});
const withRev = (n: number): SavedState => ({ ...empty(), _revision: n });

describe("shouldAdoptRemoteState（Fix D: IDB/current > server）", () => {
  it("① current が meaningful（IDB 復元済 wardrobe）→ remote 不採用", () => {
    expect(shouldAdoptRemoteState(withWardrobe(), withWardrobe())).toBe(false);
  });

  it("② current._revision > 0 → remote 不採用（wardrobe 空でも = delete-all 尊重）", () => {
    expect(shouldAdoptRemoteState(withRev(3), withWardrobe())).toBe(false);
  });

  it("③ current に wardrobe があれば remote 不採用（server に何があっても）", () => {
    expect(shouldAdoptRemoteState(withWardrobe(), withRev(99))).toBe(false);
  });

  it("④ current が本当に virgin かつ remote に中身 → 採用（新規端末の復元のみ）", () => {
    expect(shouldAdoptRemoteState(empty(), withWardrobe())).toBe(true);
    expect(shouldAdoptRemoteState(empty(), withRev(2))).toBe(true);
  });

  it("補: current virgin かつ remote も空 → 不採用", () => {
    expect(shouldAdoptRemoteState(empty(), empty())).toBe(false);
  });

  it("補: remote が null / undefined → 不採用", () => {
    expect(shouldAdoptRemoteState(empty(), null)).toBe(false);
    expect(shouldAdoptRemoteState(withWardrobe(), undefined)).toBe(false);
  });
});

describe("page.tsx 配線（Fix C/D 構造固定）", () => {
  const SRC = readFileSync("app/(immersive)/my-style/page.tsx", "utf8").replace(/\s+/g, " ");

  it("⑤⑥ quota 失敗時に main key を removeItem しない（IDB primary で継続）", () => {
    expect(SRC).not.toContain("localStorage.removeItem(STORAGE_KEY)");
  });

  it("⑦ remote-load は現在の state（prev）を shouldAdoptRemoteState で判定（stale initialBundle で判定しない）", () => {
    expect(SRC).toContain("shouldAdoptRemoteState(prev, remoteState)");
    expect(SRC).not.toContain("!hasMeaningfulState(initialBundle.state) && json?.remoteState");
  });
});
