/**
 * V2a — 描画時 cutout の **session-only in-memory cache**（永続化なし）
 *
 * 役割:
 *   - 同じ画像 (data URL) を何度も背景除去しないための module-level cache。
 *   - **localStorage / IndexedDB / server には保存しない**（cutout data URL は巨大になりやすく、
 *     永続化すると別の問題を生むため）。 セッション中のみ・件数上限つき（LRU 風）。
 *
 * 不変原則:
 *   - 永続化ゼロ。 ブラウザを閉じれば消える。 wardrobe item / My-Style には書かない。
 */

/** 原画像 data URL → cutout data URL（成功時のみ）。 LRU 風に挿入順で剪定。 */
const CACHE = new Map<string, string>();
/** メモリ保護のための件数上限（cutout data URL は大きいので控えめ）。 */
const MAX_ENTRIES = 48;

/** cutout を取得（無ければ null）。 取得時に LRU として末尾へ移動。 */
export function getCachedCutout(src: string): string | null {
  const value = CACHE.get(src);
  if (value === undefined) return null;
  CACHE.delete(src);
  CACHE.set(src, value);
  return value;
}

/** cutout を保存（同 key は上書き、 上限超過分は古いものから剪定）。 */
export function setCachedCutout(src: string, cutout: string): void {
  if (CACHE.has(src)) CACHE.delete(src);
  CACHE.set(src, cutout);
  while (CACHE.size > MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
}

/** テスト用: cache を空にする。 */
export function clearCutoutCache(): void {
  CACHE.clear();
}

/** テスト用: 現在の件数。 */
export function cutoutCacheSize(): number {
  return CACHE.size;
}
