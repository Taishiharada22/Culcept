/**
 * キャッシュレイヤー
 *
 * メモリキャッシュ + Supabase recommendation_cache テーブルを使用
 * Redis は将来的にオプションで追加可能
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// メモリキャッシュ（サーバーレスでは限定的だが、同一リクエスト内では有効）
const memoryCache = new Map<string, CacheEntry<unknown>>();

// デフォルトTTL（秒）
const DEFAULT_TTL = 60 * 5; // 5分

/**
 * キャッシュキーを生成
 */
export function createCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  return [prefix, ...parts.filter(Boolean)].join(':');
}

/**
 * メモリキャッシュから取得
 */
function getFromMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * メモリキャッシュに保存
 */
function setToMemory<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): void {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Supabaseキャッシュから取得
 */
async function getFromSupabase<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('recommendation_cache')
      .select('payload, expires_at')
      .eq('cache_key', key)
      .single();

    if (error || !data) return null;

    if (new Date(data.expires_at) < new Date()) {
      // 期限切れは削除
      await supabase.from('recommendation_cache').delete().eq('cache_key', key);
      return null;
    }

    return data.payload as T;
  } catch {
    return null;
  }
}

/**
 * Supabaseキャッシュに保存
 */
async function setToSupabase<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await supabase
      .from('recommendation_cache')
      .upsert({
        cache_key: key,
        payload: data,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

/**
 * キャッシュから取得（メモリ → Supabase の順）
 */
export async function get<T>(key: string): Promise<T | null> {
  // 1. メモリキャッシュ
  const memoryResult = getFromMemory<T>(key);
  if (memoryResult !== null) return memoryResult;

  // 2. Supabase キャッシュ
  const supabaseResult = await getFromSupabase<T>(key);
  if (supabaseResult !== null) {
    // メモリキャッシュにも保存
    setToMemory(key, supabaseResult);
    return supabaseResult;
  }

  return null;
}

/**
 * キャッシュに保存（メモリ + Supabase）
 */
export async function set<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
  setToMemory(key, data, ttlSeconds);
  await setToSupabase(key, data, ttlSeconds);
}

/**
 * キャッシュを削除
 */
export async function del(key: string): Promise<void> {
  memoryCache.delete(key);
  await supabase.from('recommendation_cache').delete().eq('cache_key', key);
}

/**
 * パターンに一致するキャッシュを削除
 */
export async function delByPattern(pattern: string): Promise<void> {
  // メモリキャッシュから削除
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }

  // Supabaseから削除
  await supabase
    .from('recommendation_cache')
    .delete()
    .like('cache_key', `%${pattern}%`);
}

/**
 * キャッシュ付きで関数を実行
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL
): Promise<T> {
  const cached = await get<T>(key);
  if (cached !== null) return cached;

  const result = await fn();
  await set(key, result, ttlSeconds);
  return result;
}

/**
 * 全キャッシュをクリア（開発用）
 */
export async function clearAll(): Promise<void> {
  memoryCache.clear();
  await supabase.from('recommendation_cache').delete().neq('cache_key', '');
}

export default {
  createCacheKey,
  get,
  set,
  del,
  delByPattern,
  withCache,
  clearAll,
};
