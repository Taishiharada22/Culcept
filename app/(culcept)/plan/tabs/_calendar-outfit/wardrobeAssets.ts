/**
 * Slice 2 (Option B-1) — Wardrobe 画像の read-only リーダ (client 専用)
 *
 * 目的:
 *   - おすすめコーデカードに実 wardrobe 画像を流し込むため、 画像付き wardrobe を **読むだけ**。
 *
 * なぜ `lib/shared/wardrobe.ts` の `loadWardrobeWithFallback` を使わないか:
 *   - 同関数は localStorage を最優先で返す (`if (local.length>0) return local;`)。
 *   - localStorage 側の wardrobe は `stripHeavyImageUrls` で base64 `data:` 画像が除去済み
 *     (my-style/_lib/state.ts)。 → 典型ユーザーでは **画像なし** が返り、 hydration が空振りする。
 *   - 画像の正本は **IndexedDB** (my-style が `cacheState("my-style-state", 正規化state)` で全状態を保存。
 *     my-style/page.tsx 自身も localStorage 読込後に IDB から画像を復元している)。
 *   - そこで本リーダは IDB を直接 (read-only で) 読む。 将来は shared 側に
 *     `loadWardrobeWithImages()` として昇格すべき (← 将来債務)。 今回は in-scope に閉じる。
 *
 * 安全制約 (CEO/GPT Option B-1):
 *   - **read-only**: write / put / createObjectStore / deleteDatabase / migration を一切しない。
 *   - IndexedDB には「存在すれば開く」プリミティブが無く、 `open()` は無ければ DB を**作ってしまう**。
 *     空 DB を作ると my-style 側の後続 write を壊し得るため、 `indexedDB.databases()` で
 *     **存在確認してからのみ開く**。 `databases()` 非対応 (例: Firefox) では hydration を諦め `[]`
 *     を返す (= mock 表示にフォールバック、 退化なし)。
 *   - browser 専用: module top-level で window/indexedDB に触らない。 失敗しても throw せず `[]`。
 */

import type { WardrobeItem } from "@/lib/shared/wardrobe";

/** my-style が使う IndexedDB の正本スキーマ (_lib/stateCache.ts と一致させる) */
const DB_NAME = "culcept_mystyle";
const STORE_NAME = "state_cache";
const STATE_KEY = "my-style-state";

/**
 * IndexedDB から画像付き wardrobe を読む (read-only)。
 * 取得不能・未存在・非対応・失敗時はすべて `[]` を返す (caller は mock を維持する)。
 */
export async function loadWardrobeImagesFromMyStyleIDB(): Promise<WardrobeItem[]> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return [];

  try {
    // read-only 安全策: 既存の DB だけを開く。 indexedDB.databases() で副作用なく存在確認できる。
    // 非対応ブラウザ (Firefox 等) では新規作成のリスクを避けるため hydration を諦める。
    if (typeof indexedDB.databases !== "function") return [];
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === DB_NAME)) return [];

    return await new Promise<WardrobeItem[]>((resolve) => {
      let settled = false;
      const done = (items: WardrobeItem[]) => {
        if (settled) return;
        settled = true;
        resolve(items);
      };

      let req: IDBOpenDBRequest;
      try {
        // version 指定なし = 現行 version で開く (既存 DB を upgrade しない)。
        req = indexedDB.open(DB_NAME);
      } catch {
        done([]);
        return;
      }

      req.onupgradeneeded = () => {
        // 想定外 (直前まで存在した DB が消えた等)。 store を作らず read-only で撤退する。
        try {
          req.transaction?.abort();
        } catch {
          /* noop */
        }
        done([]);
      };
      req.onerror = () => done([]);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.close();
            done([]);
            return;
          }
          const tx = db.transaction(STORE_NAME, "readonly");
          tx.onabort = () => {
            try {
              db.close();
            } catch {
              /* noop */
            }
            done([]);
          };
          const getReq = tx.objectStore(STORE_NAME).get(STATE_KEY);
          getReq.onsuccess = () => {
            const value = getReq.result as { wardrobe?: unknown } | null | undefined;
            try {
              db.close();
            } catch {
              /* noop */
            }
            done(Array.isArray(value?.wardrobe) ? (value!.wardrobe as WardrobeItem[]) : []);
          };
          getReq.onerror = () => {
            try {
              db.close();
            } catch {
              /* noop */
            }
            done([]);
          };
        } catch {
          try {
            db.close();
          } catch {
            /* noop */
          }
          done([]);
        }
      };
    });
  } catch {
    return [];
  }
}
