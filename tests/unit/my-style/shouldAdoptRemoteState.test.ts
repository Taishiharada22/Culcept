import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { shouldAdoptRemoteState, normalizeSavedState } from "@/app/(immersive)/my-style/_lib/state";
import type { SavedState, WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";

/**
 * Fix D（revision-aware）— 削除復活の停止。
 *
 * localStorage が quota で古い revision に stale 固定され、 reload で current になる一方、
 * IDB/server は新しい revision に進む。 current が meaningful というだけで remote を弾くと、
 * 古い current が新しい remote の削除結果を巻き戻す（実ログ: current 24/rev1 が server 23/rev2 を拒否）。
 * → revision を比較し、 remote が新しければ採用する。
 */

const item = (id: string): WardrobeItem =>
  ({ id, name: "x", category: "tops", color: "#000" } as WardrobeItem);

/** rev と wardrobe 件数を持つ SavedState を作る */
const mk = (rev: number, count: number): SavedState => ({
  ...normalizeSavedState({}),
  _revision: rev,
  wardrobe: Array.from({ length: count }, (_, i) => item(`i${i}`)),
});

describe("shouldAdoptRemoteState（revision-aware）", () => {
  it("① current rev1 meaningful / remote rev2 meaningful → adopt true（再現条件: 新しい削除後 remote を採用）", () => {
    expect(shouldAdoptRemoteState(mk(1, 24), mk(2, 23))).toBe(true);
  });

  it("② current rev2 meaningful / remote rev1 meaningful → adopt false（current が新しい）", () => {
    expect(shouldAdoptRemoteState(mk(2, 5), mk(1, 5))).toBe(false);
  });

  it("③ current rev2 / remote rev2（同 revision）→ adopt false（current 維持）", () => {
    expect(shouldAdoptRemoteState(mk(2, 5), mk(2, 5))).toBe(false);
  });

  it("④ current virgin（rev0 空）/ remote rev1 meaningful → adopt true（新規端末の復元）", () => {
    expect(shouldAdoptRemoteState(mk(0, 0), mk(1, 5))).toBe(true);
  });

  it("⑤ current rev2 meaningful / remote rev1 empty → adopt false（古い空 remote では消さない）", () => {
    expect(shouldAdoptRemoteState(mk(2, 5), mk(1, 0))).toBe(false);
  });

  it("⑥ current rev0 だが meaningful / remote rev0 meaningful → current 維持（adopt false）", () => {
    expect(shouldAdoptRemoteState(mk(0, 5), mk(0, 5))).toBe(false);
  });

  it("⑦ remote が delete-all（空）でも remoteRev > currentRev なら adopt true", () => {
    expect(shouldAdoptRemoteState(mk(1, 24), mk(2, 0))).toBe(true);
  });

  it("補: remote null/undefined → adopt false", () => {
    expect(shouldAdoptRemoteState(mk(1, 5), null)).toBe(false);
    expect(shouldAdoptRemoteState(mk(0, 0), undefined)).toBe(false);
  });

  it("補: current virgin / remote も空・同 rev → adopt false（採用しても無意味＝維持）", () => {
    expect(shouldAdoptRemoteState(mk(0, 0), mk(0, 0))).toBe(false);
  });
});

describe("page.tsx 配線（Fix C/D 構造固定）", () => {
  const SRC = readFileSync("app/(immersive)/my-style/page.tsx", "utf8").replace(/\s+/g, " ");

  it("quota 失敗時に main key を removeItem しない（IDB primary で継続）", () => {
    expect(SRC).not.toContain("localStorage.removeItem(STORAGE_KEY)");
  });

  it("remote-load は現在の state（prev）を shouldAdoptRemoteState で判定する", () => {
    expect(SRC).toContain("shouldAdoptRemoteState(prev, remoteState)");
    expect(SRC).not.toContain("!hasMeaningfulState(initialBundle.state) && json?.remoteState");
  });
});
