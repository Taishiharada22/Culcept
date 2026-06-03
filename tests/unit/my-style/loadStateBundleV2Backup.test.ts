import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * M1-2A — loadStateBundle が PREVIOUS_BACKUP_STORAGE_KEY ("culcept_my_style_v2_backup") を
 *         読まないことを構造的に固定する。 D2 で確定した v2 race の素因を断つ修正。
 *
 * 不変原則（CEO 補正反映）:
 *   - v2 本体 ("culcept_my_style_v2") は legacy migration source として残す（M1-2B で別判断）
 *   - v3 / v3_backup は既存通り
 *   - IDB 正本 (D2-3, a77c8933) と組み合わせて、 削除済 item の蘇り経路を消す
 */

const SRC_PATH = "app/(immersive)/my-style/_lib/state.ts";
const NORM = readFileSync(SRC_PATH, "utf8").replace(/\s+/g, " ");

// ── localStorage stub（vitest "node" 環境）─────────────
type Store = Map<string, string>;
function installStorage(initial: Record<string, string> = {}): Store {
  const store: Store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
  vi.stubGlobal("window", { localStorage });
  return store;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ── 構造 assertion（source-level）─────────────────────

describe("loadStateBundle — M1-2A 構造固定", () => {
  it("② PREVIOUS_BACKUP_STORAGE_KEY を loadStateBundle 内で読まない（v2_backup race 素因を断つ）", () => {
    // 旧: readJsonStorage(BACKUP_STORAGE_KEY) ?? readJsonStorage(PREVIOUS_BACKUP_STORAGE_KEY)
    // 新: readJsonStorage(BACKUP_STORAGE_KEY)  ← fallback chain を切る
    expect(NORM).toContain("const backupRaw = readJsonStorage(BACKUP_STORAGE_KEY);");
    expect(NORM).not.toContain("readJsonStorage(BACKUP_STORAGE_KEY) ?? readJsonStorage(PREVIOUS_BACKUP_STORAGE_KEY)");
  });

  it("④ v2 本体 (PREVIOUS_STORAGE_KEY) の current 読込は維持（legacy migration source として保持）", () => {
    // currentRaw 側は変更しない（CEO 補正: v2 本体は M1-2B で別判断）
    expect(NORM).toContain("const currentRaw = readJsonStorage(STORAGE_KEY) ?? readJsonStorage(PREVIOUS_STORAGE_KEY);");
  });

  it("③ v3 backup (BACKUP_STORAGE_KEY) は既存通り読まれる", () => {
    expect(NORM).toContain("readJsonStorage(BACKUP_STORAGE_KEY)");
  });

  it("PREVIOUS_BACKUP_STORAGE_KEY 定数の宣言が unused にならない（commented out）", () => {
    // 宣言は M1-2A コメントアウト済（生きた const は無い）
    expect(NORM).not.toMatch(/^\s*const PREVIOUS_BACKUP_STORAGE_KEY = /m);
    // 文字列値は EXPENDABLE_EXACT_KEYS に列挙されているため、 ここに残す必要はない
  });
});

// ── 動作 assertion（loadStateBundle 実行で v2_backup 不読込）─

describe("loadStateBundle — 実行時に v2_backup を読まない", () => {
  it("v3 / v3_backup が無く v2_backup だけある状態 → backup として採用されない", async () => {
    installStorage({
      "culcept_my_style_v2_backup": JSON.stringify({ _revision: 99, wardrobe: [{ id: "old-v2", name: "old", category: "tops", color: "#000" }] }),
    });
    const { loadStateBundle } = await import("@/app/(immersive)/my-style/_lib/state");
    const bundle = loadStateBundle();
    // v2_backup を読まないので state は virgin（wardrobe 空・rev 0）扱い
    expect(bundle.state.wardrobe.find((w) => w.id === "old-v2")).toBeUndefined();
  });

  it("v3_backup あり + v2_backup あり → v3_backup のみ採用、 v2_backup は無視", async () => {
    installStorage({
      "culcept_my_style_v3_backup": JSON.stringify({ _revision: 5, wardrobe: [{ id: "v3b", name: "v3", category: "tops", color: "#000" }] }),
      "culcept_my_style_v2_backup": JSON.stringify({ _revision: 99, wardrobe: [{ id: "v2b", name: "v2", category: "tops", color: "#000" }] }),
    });
    const { loadStateBundle } = await import("@/app/(immersive)/my-style/_lib/state");
    const bundle = loadStateBundle();
    // v3_backup の id だけが見える可能性がある（current が空なので backup が backup の merge 経路）
    expect(bundle.state.wardrobe.every((w) => w.id !== "v2b")).toBe(true);
  });

  it("v2 本体（current）は引き続き読まれる（legacy migration 維持・CEO 補正）", async () => {
    installStorage({
      "culcept_my_style_v2": JSON.stringify({ _revision: 3, wardrobe: [{ id: "v2-current", name: "v2", category: "tops", color: "#000" }] }),
    });
    const { loadStateBundle } = await import("@/app/(immersive)/my-style/_lib/state");
    const bundle = loadStateBundle();
    // v3 が無いので v2 本体が current として読まれる（PREVIOUS_STORAGE_KEY fallback 維持）
    expect(bundle.state.wardrobe.some((w) => w.id === "v2-current")).toBe(true);
  });

  it("v3 本体あり → v3 が優先（既存挙動・回帰なし）", async () => {
    installStorage({
      "culcept_my_style_v3": JSON.stringify({ _revision: 10, wardrobe: [{ id: "v3-cur", name: "v3", category: "tops", color: "#000" }] }),
      "culcept_my_style_v2": JSON.stringify({ _revision: 99, wardrobe: [{ id: "v2-cur", name: "v2", category: "tops", color: "#000" }] }),
    });
    const { loadStateBundle } = await import("@/app/(immersive)/my-style/_lib/state");
    const bundle = loadStateBundle();
    expect(bundle.state.wardrobe.some((w) => w.id === "v3-cur")).toBe(true);
    expect(bundle.state.wardrobe.every((w) => w.id !== "v2-cur")).toBe(true);
  });
});
