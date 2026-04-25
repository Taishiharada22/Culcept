/**
 * Place Cache Store — Supabase 永続キャッシュ層（L2）
 *
 * Phase B-2: in-memory（L1）の背後に Supabase を追加し、
 * プロセス再起動後もキャッシュを保持する。
 *
 * 設計:
 *   - fail-open: DB 障害時は null / no-op で返し、解決フローを止めない
 *   - fire-and-forget: usage bump / write は await しない（L1 が正本）
 *   - TTL: 30日（last_used_at ベース）— 期限切れは読み取り時に削除
 *   - low / unresolved は保存しない（アプリケーション層で制御）
 *
 * テーブル: place_resolution_cache
 *   migration: supabase/migrations/20260416100000_place_resolution_cache.sql
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ResolutionConfidence } from "./planState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** DB 行の型 */
interface PlaceCacheRow {
  id: string;
  user_id: string;
  place_text: string;
  coarse_area: string;
  resolved_name: string;
  address: string | null;
  place_id: string | null;
  place_type: string;
  confidence: string;
  source: string;
  lat: number | null;
  lng: number | null;
  use_count: number;
  created_at: string;
  last_used_at: string;
}

/** L2 から返すエントリ型（L1 の PlaceResolutionCacheEntry と互換） */
export interface PersistedCacheEntry {
  resolvedName: string;
  address?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  confidence: ResolutionConfidence;
  cachedAt: string;
  lastUsedAt: string;
  useCount: number;
}

/** L2 書き込み用パラメータ */
export interface CacheWriteParams {
  resolvedName: string;
  address?: string;
  placeId?: string;
  confidence: "high" | "medium";
  source: "web_search" | "places_api";
  placeType: string;
  lat?: number;
  lng?: number;
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Read
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Supabase からキャッシュエントリを読み取る。
 *
 * - 3要素キー（user_id, place_text, coarse_area）で検索
 * - TTL 超過エントリは削除して null を返す
 * - ヒット時は use_count / last_used_at を fire-and-forget で更新
 * - 全エラーで null を返す（fail-open）
 */
export async function readFromSupabase(
  userId: string,
  placeText: string,
  area?: string,
): Promise<PersistedCacheEntry | null> {
  try {
    const normalizedPlace = placeText.trim().toLowerCase();
    const normalizedArea = area?.trim().toLowerCase() ?? "unknown";

    const { data, error } = await supabaseAdmin
      .from("place_resolution_cache")
      .select("*")
      .eq("user_id", userId)
      .eq("place_text", normalizedPlace)
      .eq("coarse_area", normalizedArea)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as PlaceCacheRow;

    // TTL check
    const age = Date.now() - new Date(row.last_used_at).getTime();
    if (age > TTL_MS) {
      // 期限切れ → 削除（fire-and-forget）
      void supabaseAdmin
        .from("place_resolution_cache")
        .delete()
        .eq("id", row.id);
      return null;
    }

    // Usage bump（fire-and-forget）
    void supabaseAdmin
      .from("place_resolution_cache")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: row.use_count + 1,
      })
      .eq("id", row.id);

    return {
      resolvedName: row.resolved_name,
      address: row.address ?? undefined,
      placeId: row.place_id ?? undefined,
      lat: row.lat ?? undefined,
      lng: row.lng ?? undefined,
      confidence: row.confidence as ResolutionConfidence,
      cachedAt: row.created_at,
      lastUsedAt: row.last_used_at,
      useCount: row.use_count,
    };
  } catch (err) {
    console.warn("[PlaceCacheStore] Read failed:", err);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Write
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Supabase にキャッシュエントリを書き込む（upsert）。
 *
 * - UNIQUE(user_id, place_text, coarse_area) で upsert
 * - low / unresolved は書き込まない
 * - 全エラーを握りつぶす（fail-open）
 */
export async function writeToSupabase(
  userId: string,
  placeText: string,
  area: string | undefined,
  params: CacheWriteParams,
): Promise<void> {
  try {
    const normalizedPlace = placeText.trim().toLowerCase();
    const normalizedArea = area?.trim().toLowerCase() ?? "unknown";

    await supabaseAdmin
      .from("place_resolution_cache")
      .upsert(
        {
          user_id: userId,
          place_text: normalizedPlace,
          coarse_area: normalizedArea,
          resolved_name: params.resolvedName,
          address: params.address ?? null,
          place_id: params.placeId ?? null,
          place_type: params.placeType,
          confidence: params.confidence,
          source: params.source,
          lat: params.lat ?? null,
          lng: params.lng ?? null,
          use_count: 1,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "user_id,place_text,coarse_area" },
      );
  } catch (err) {
    // fail-open: DB 書き込み失敗はプラン生成を止めない
    console.warn("[PlaceCacheStore] Write failed:", err);
  }
}
