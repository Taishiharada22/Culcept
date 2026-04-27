/**
 * CoAlter Stage 2 — 共有メモリ store (L2-i)
 *
 * 正本: UI spec §8.3 共有メモリ項目の 3 軸ラベル / Core UX v1.1 §10
 *
 * 責務:
 *   - MemoryItem の CRUD (純関数 + immutable state)
 *   - 書き込み時に §8.3.4 禁止組み合わせを enforce
 *   - 期限切れ transient_summary の自動 prune
 *
 * 非責務:
 *   - 永続化 (DB / Supabase realtime) → L2-f shared state (CEO 別審議)
 *   - UI 描画 → L1-h preview / L4 production
 *   - 介入価値判定 → executor watcher
 *
 * 設計選択:
 *   - immutable な MemoryStore (= ReadonlyArray<MemoryItem>) を使う pure store API
 *   - すべての操作は新しい store を返す (Stage 3 で reducer / state 統合時に
 *     Redux-style 集約しやすい)
 */

import type { MemoryItem, ModeContext } from "./memoryTypes";
import { isForbiddenCombination, getForbiddenReason } from "./memoryConstraints";

/**
 * Memory store (immutable list of items)。
 */
export type MemoryStore = ReadonlyArray<MemoryItem>;

/**
 * 空の store を返す。
 */
export function emptyMemoryStore(): MemoryStore {
  return [];
}

/**
 * Item 追加。§8.3.4 違反時は throw (defensive、構造的 enforce)。
 *
 * 既存 id がある場合は throw (重複禁止)。
 */
export function addMemoryItem(
  store: MemoryStore,
  item: MemoryItem,
): MemoryStore {
  if (isForbiddenCombination(item.origin, item.certainty, item.visibility)) {
    const reason = getForbiddenReason(
      item.origin,
      item.certainty,
      item.visibility,
    );
    throw new Error(
      `Forbidden memory combination (§8.3.4): ${reason ?? "unknown"}`,
    );
  }
  if (store.some((existing) => existing.id === item.id)) {
    throw new Error(`Memory item id already exists: ${item.id}`);
  }
  return [...store, item];
}

/**
 * Item 部分更新 (id 一致のもの)。3 軸変更も §8.3.4 enforce 経由。
 *
 * id が存在しない場合は store 不変 (no-op)。
 */
export function updateMemoryItem(
  store: MemoryStore,
  id: string,
  updater: (current: MemoryItem) => MemoryItem,
): MemoryStore {
  const idx = store.findIndex((m) => m.id === id);
  if (idx < 0) return store;
  const next = updater(store[idx]);
  if (isForbiddenCombination(next.origin, next.certainty, next.visibility)) {
    const reason = getForbiddenReason(next.origin, next.certainty, next.visibility);
    throw new Error(
      `Forbidden memory combination (§8.3.4): ${reason ?? "unknown"}`,
    );
  }
  // updatedAt は updater 側で更新する想定 (本関数では強制しない)
  return [...store.slice(0, idx), next, ...store.slice(idx + 1)];
}

/**
 * Item 削除。
 */
export function removeMemoryItem(store: MemoryStore, id: string): MemoryStore {
  return store.filter((m) => m.id !== id);
}

/**
 * 期限切れ (transient_summary expiresAt < now) の項目を除外する。
 *
 * 副作用なしの純関数。Stage 3 で定期 prune の hook として使用。
 */
export function pruneExpiredMemory(
  store: MemoryStore,
  now: number,
): MemoryStore {
  return store.filter((m) => {
    if (m.expiresAt === undefined) return true;
    return m.expiresAt > now;
  });
}

/**
 * 指定 mode 文脈で参照可能な項目のみ返す (§10.2 mode 別セッション文脈)。
 *
 * - 通常モード: 全 modeContext 参照 (ゆるく見続ける)
 * - Daily/Travel: 該当 modeContext + 共有メモリ (mode を問わない継続情報) のみ
 *
 * §10.1 の継続情報 (好み / リズム / 揉める論点 等) は origin=explicit_shared かつ
 * certainty=high 以上を「共有メモリ」と解釈する (実装側 heuristic、本節で固定)。
 */
export function filterByModeScope(
  store: MemoryStore,
  scope: ModeContext,
): MemoryStore {
  if (scope === "normal") {
    // 通常モード: 全項目参照 (§10.2 ゆるく見続ける)
    return store;
  }
  // Daily / Travel: 当該 mode で作成された項目 + 全 mode 共有メモリ
  return store.filter((m) => {
    if (m.modeContext === scope) return true;
    // 共有メモリ判定 heuristic: §10.1 の継続情報は explicit_shared + high 扱い
    if (m.origin === "explicit_shared" && m.certainty === "high") return true;
    return false;
  });
}

/**
 * 表示可視性で filter (UI 表示前の最終 gate)。
 *
 * - viewer = "both" : both_visible のみ表示
 * - viewer = "user_a": both_visible + user_a_only 表示
 * - viewer = "user_b": both_visible + user_b_only 表示
 * - internal_only は viewer に表示されない (CoAlter 内部参照のみ)
 */
export function filterByViewer(
  store: MemoryStore,
  viewer: "user_a" | "user_b",
): MemoryStore {
  return store.filter((m) => {
    if (m.visibility === "both_visible") return true;
    if (viewer === "user_a" && m.visibility === "user_a_only") return true;
    if (viewer === "user_b" && m.visibility === "user_b_only") return true;
    return false;
  });
}
