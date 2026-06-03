import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * M1-1 — ensureStorageSpace の expendable key 拡張テスト。
 *
 * 観測結果（実機・2026-06-01）:
 *   - culcept_tryon_history_v1: 約 4.54 MB（localStorage 5 MB quota の主犯）
 *   - 静的監査で現行コードベースに reader/writer 不在（orphan）
 *
 * M1-1 の意図:
 *   - 該当 key を EXPENDABLE_EXACT_KEYS に追加し、 次回 ensureStorageSpace 実行時に削除回収
 *   - 即時削除ではなく、 quota 回復処理が走った時点で消える設計（既存 helper 流儀どおり）
 *   - 既存 expendable key の削除挙動は完全に維持（回帰防止）
 */

// ── localStorage stub（環境は vitest "node"、 jsdom 無し）─────────────
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
});

describe("ensureStorageSpace — M1-1 culcept_tryon_history_v1 expendable", () => {
  it("① culcept_tryon_history_v1 が expendable exact key として削除される（orphan 4.54MB 回収）", async () => {
    const store = installStorage({
      "culcept_tryon_history_v1": "X".repeat(1000), // 圧迫 stub
      "culcept_my_style_v3": "live",                // 触らない
    });
    const { ensureStorageSpace } = await import("@/lib/stargazer/localStorageHelper");
    const freed = ensureStorageSpace();
    expect(freed).toBe(true);
    expect(store.has("culcept_tryon_history_v1")).toBe(false);
    expect(store.has("culcept_my_style_v3")).toBe(true); // current は無傷
  });

  it("② 既存 expendable exact key（culcept_my_style_v3_backup / culcept_origin_memory_v5 / v6）の削除挙動が維持される", async () => {
    const store = installStorage({
      "culcept_my_style_v3_backup": "old-backup",
      "culcept_origin_memory_v5": "old-mem-v5",
      "culcept_origin_memory_v6": "old-mem-v6",
      "culcept_my_style_v3": "live",
    });
    const { ensureStorageSpace } = await import("@/lib/stargazer/localStorageHelper");
    const freed = ensureStorageSpace();
    expect(freed).toBe(true);
    expect(store.has("culcept_my_style_v3_backup")).toBe(false);
    expect(store.has("culcept_origin_memory_v5")).toBe(false);
    expect(store.has("culcept_origin_memory_v6")).toBe(false);
    expect(store.has("culcept_my_style_v3")).toBe(true);
  });

  it("③ unknown key は削除されない（live data 保護）", async () => {
    const store = installStorage({
      "culcept_my_style_v3": "live",
      "culcept_some_unrelated_key": "preserve",
      "aneurasync_anon_user_id": "uuid-1234",
      "culcept_calendar_worn_v1": "wear-data",
    });
    const { ensureStorageSpace } = await import("@/lib/stargazer/localStorageHelper");
    ensureStorageSpace();
    expect(store.has("culcept_my_style_v3")).toBe(true);
    expect(store.has("culcept_some_unrelated_key")).toBe(true);
    expect(store.has("aneurasync_anon_user_id")).toBe(true);
    expect(store.has("culcept_calendar_worn_v1")).toBe(true);
  });

  it("④ tryon_history が存在しない環境では何も壊さない（idempotent）", async () => {
    const store = installStorage({ "culcept_my_style_v3": "live" });
    const { ensureStorageSpace } = await import("@/lib/stargazer/localStorageHelper");
    ensureStorageSpace();
    expect(store.has("culcept_my_style_v3")).toBe(true);
  });

  it("⑤ 即時削除ではなく ensureStorageSpace 実行時に消える（呼ばれるまでは保持）", async () => {
    // import 時点では何も起きない（モジュール side-effect なし）。 ensureStorageSpace を呼んで初めて削除。
    const store = installStorage({ "culcept_tryon_history_v1": "Y".repeat(500) });
    const helper = await import("@/lib/stargazer/localStorageHelper");
    // import 直後は残っている
    expect(store.has("culcept_tryon_history_v1")).toBe(true);
    // 明示呼び出しで初めて消える
    helper.ensureStorageSpace();
    expect(store.has("culcept_tryon_history_v1")).toBe(false);
  });

  it("⑥ _backup suffix の generic 削除も維持（既存 EXPENDABLE_SUFFIXES）", async () => {
    const store = installStorage({
      "some_feature_backup": "anything",
      "culcept_my_style_v3": "live",
    });
    const { ensureStorageSpace } = await import("@/lib/stargazer/localStorageHelper");
    ensureStorageSpace();
    expect(store.has("some_feature_backup")).toBe(false);
    expect(store.has("culcept_my_style_v3")).toBe(true);
  });

  it("⑧ M1-2A: culcept_my_style_v2_backup が expendable exact key として削除される（v2 race 素因の物理回収）", async () => {
    const store = installStorage({
      "culcept_my_style_v2_backup": "old-v2-backup",
      "culcept_my_style_v3": "live",
    });
    const { ensureStorageSpace } = await import("@/lib/stargazer/localStorageHelper");
    const freed = ensureStorageSpace();
    expect(freed).toBe(true);
    expect(store.has("culcept_my_style_v2_backup")).toBe(false);
    expect(store.has("culcept_my_style_v3")).toBe(true); // current は無傷
  });

  it("⑦ 古い versioned key の cleanup も維持（既存 OLD_VERSION_RE: foo_v5 は foo_v7 があれば削除）", async () => {
    const store = installStorage({
      "demo_v5": "old",
      "demo_v6": "old",
      "demo_v7": "latest",
      "culcept_my_style_v3": "live",
    });
    const { ensureStorageSpace } = await import("@/lib/stargazer/localStorageHelper");
    ensureStorageSpace();
    expect(store.has("demo_v5")).toBe(false);
    expect(store.has("demo_v6")).toBe(false);
    expect(store.has("demo_v7")).toBe(true);
    expect(store.has("culcept_my_style_v3")).toBe(true);
  });
});
