/**
 * Shared Wardrobe Domain — 正本
 *
 * ワードローブアイテムの型定義とリポジトリ。
 * Calendar も My-Style もここから型を読む。
 * UIロジック（スコアリング、提案、可視化）は各機能側に置く。
 *
 * 現時点のストレージ:
 *   - Client正本: localStorage `culcept_my_style_v3` 内の `wardrobe` 配列
 *   - Server正本: Supabase `user_style_summary.quiz_result.myStyleState.wardrobe`
 *   - 書き込み: My-Style のみ（CRUD は my-style の責務）
 *   - 読み取り: Calendar, Genome Card, Rendezvous 等
 */

// 型は my-style の types.ts から re-export（将来的に移動予定）
// 現時点では import path を統一するための中継点
export type {
  WardrobeItem,
  SavedSetup,
  SetupMoodCode,
  WearRecord,
} from "@/app/(immersive)/my-style/_lib/types";

export type {
  CategoryMain,
  SeasonCode,
  ThicknessCode,
  FormalityCode,
  SilhouetteCode,
  PatternCode,
} from "@/app/(immersive)/my-style/_lib/taxonomy";

/**
 * ワードローブの読み取り（サーバーサイド）
 * `/api/my-style/bridge` GET を経由して取得する
 */
export async function fetchWardrobe(): Promise<
  import("@/app/(immersive)/my-style/_lib/types").WardrobeItem[]
> {
  try {
    const res = await fetch("/api/my-style/bridge", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    const remote = json?.remoteState?.wardrobe;
    return Array.isArray(remote) ? remote : [];
  } catch {
    return [];
  }
}

/**
 * ワードローブの読み取り（localStorage フォールバック）
 * サーバー未到達時のクライアント側正本
 */
const STYLE_STATE_KEY = "culcept_my_style_v3";
const IDB_NAME = "culcept_mystyle";
const IDB_STORE = "state_cache";
const IDB_KEY = "my-style-state";

export function loadWardrobeFromLocal(): import("@/app/(immersive)/my-style/_lib/types").WardrobeItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STYLE_STATE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data?.wardrobe) ? data.wardrobe : [];
  } catch {
    return [];
  }
}

/**
 * ワードローブの読み取り（IndexedDB → localStorage → server の優先順）
 * localStorage がクォータ超過等で空の場合の救済策。
 * 呼び出し側が非同期を扱える場合はこちらを使う。
 */
export async function loadWardrobeWithFallback(): Promise<import("@/app/(immersive)/my-style/_lib/types").WardrobeItem[]> {
  // 1. localStorage（最速）
  const local = loadWardrobeFromLocal();
  if (local.length > 0) return local;

  // 2. IndexedDB（画像付きフルステートが入っている）
  if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    try {
      const items = await loadWardrobeFromIDB();
      if (items.length > 0) return items;
    } catch { /* IndexedDB unavailable */ }
  }

  // 3. Server via bridge API（最終手段）
  return fetchWardrobe();
}

/** IndexedDB から直接ワードローブを読み取る */
function loadWardrobeFromIDB(): Promise<import("@/app/(immersive)/my-style/_lib/types").WardrobeItem[]> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) { db.close(); resolve([]); return; }
          const tx = db.transaction(IDB_STORE, "readonly");
          const store = tx.objectStore(IDB_STORE);
          const get = store.get(IDB_KEY);
          get.onsuccess = () => {
            db.close();
            const data = get.result;
            resolve(Array.isArray(data?.wardrobe) ? data.wardrobe : []);
          };
          get.onerror = () => { db.close(); resolve([]); };
        } catch { resolve([]); }
      };
      // DB doesn't exist yet — resolve empty
      req.onupgradeneeded = () => { req.result.close(); resolve([]); };
    } catch { resolve([]); }
  });
}
