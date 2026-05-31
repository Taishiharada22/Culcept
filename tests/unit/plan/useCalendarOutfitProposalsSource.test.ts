import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * D1-3 — useCalendarOutfit が adapter の `patch.source` を VM の `proposalsSource` に流すことを固定する。
 *
 * 設計判断:
 *   - useCalendarOutfit は React hook（`useState` + `useEffect` 多用）で、 effect は dynamic import の
 *     facade を介する async path（外部 IDB / fetch / engine）に依存する。 renderHook + waitFor で
 *     full async flow を回すと test が脆くなり、 既存 hook test の慣習からも逸脱する。
 *   - D1-3 の本質は **「adapter の `source` を hook が握り潰さず proposalsSource に流す」** という 1 ライン
 *     の不変性。 これは source-assertion で完全に固定できる（既存テスト方針 = calendarTabAnchorsMemo.test.ts 等
 *     に合致）。
 *   - adapter 側で生成される `patch.source = "engine" | "engine_padded"` の正しさは D1-2 の adapter contract
 *     test（outfitEngineAdapter.test.ts 15 cases）で既に網羅済み。 hook 側は「流す経路」を固定すれば十分。
 *   - hydrated_mock / mock の path も同様に source-assertion で固定する。
 */

const SRC_PATH = "app/(culcept)/plan/tabs/_calendar-outfit/useCalendarOutfit.ts";
const NORM = readFileSync(SRC_PATH, "utf8").replace(/\s+/g, " ");

describe("useCalendarOutfit — D1-3 proposalsSource 経路の固定", () => {
  it("① engine path: patch.source を proposalsSource に流す（旧 hardcoded \"engine\" に戻っていない）", () => {
    // 新: patch.source をそのまま渡す
    expect(NORM).toContain("proposalsSource: patch.source");
    // 旧: hardcoded "engine"（D1-3 で除去）に戻っていないこと
    expect(NORM).not.toContain('proposalsSource: "engine" }');
  });

  it("② engine path: patch.proposals / patch.sync は今までどおり同じ箇所で受け渡し", () => {
    // 1 つのオブジェクトリテラル内で 3 つのフィールドが揃って渡っている構造を固定
    expect(NORM).toContain(
      "proposals: patch.proposals, sync: patch.sync, proposalsSource: patch.source",
    );
  });

  it("③ hydrate fallback path: \"hydrated_mock\" は維持（adapter が null で wardrobe あり）", () => {
    // hydrate path は既存通り
    expect(NORM).toContain('proposalsSource: "hydrated_mock"');
    // hydrate path で patch.source を参照していないこと（adapter null path で patch が無いため）
    expect(NORM).toMatch(/proposalsSource: "hydrated_mock" \}/);
  });

  it("④ engine path は patch オブジェクトに含まれる 3 フィールドのみで構成（過剰書込なし）", () => {
    // engine path で proposalsSource を上書きする箇所は 1 つだけ
    const engineMatches = NORM.match(/proposalsSource: patch\.source/g);
    expect(engineMatches).not.toBeNull();
    expect(engineMatches!.length).toBe(1);
  });

  it("⑤ hydrate path の上書きも 1 箇所だけ（経路混在なし）", () => {
    const hydrateMatches = NORM.match(/proposalsSource: "hydrated_mock"/g);
    expect(hydrateMatches).not.toBeNull();
    expect(hydrateMatches!.length).toBe(1);
  });

  it("⑥ engine path は adapter (generateCalendarOutfitProposal) の返り値から source を読む", () => {
    // adapter 呼び出し → patch 受け取り → patch.source 利用 の構造を固定
    expect(NORM).toContain("await generateCalendarOutfitProposal(");
    expect(NORM).toContain("if (patch)");
  });
});
