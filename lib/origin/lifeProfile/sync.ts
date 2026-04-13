// lib/origin/lifeProfile/sync.ts
// #3 Supabase同期 — localStorage ↔ Supabase の双方向同期

import type { LifeProfileStore } from "./types";
import { retryFetch } from "@/lib/retryFetch";

/**
 * localStorageの全データをSupabaseに一括同期
 * ログイン後の初回同期に使う
 */
export async function syncToSupabase(store: LifeProfileStore): Promise<void> {
  const result = await retryFetch("/api/origin/life-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "sync_all",
      entries: store.entries,
      rendezvousConsentAt: store.rendezvousConsentAt,
    }),
  });
  if (!result.ok) {
    throw new Error(result.error ?? "プロフィール一括同期に失敗しました");
  }
}

/**
 * 1件のエントリをSupabaseにupsert
 */
export async function upsertEntryToSupabase(
  entry: LifeProfileStore["entries"][number],
): Promise<void> {
  const result = await retryFetch("/api/origin/life-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upsert_entry", entry }),
  });
  if (!result.ok) {
    throw new Error(result.error ?? "エントリ保存に失敗しました");
  }
}

/**
 * エントリ削除をSupabaseに反映
 */
export async function deleteEntryFromSupabase(entryId: string): Promise<void> {
  const result = await retryFetch("/api/origin/life-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete_entry", entryId }),
  });
  if (!result.ok) {
    throw new Error(result.error ?? "エントリ削除に失敗しました");
  }
}

/**
 * Rendezvous同意をSupabaseに反映
 */
export async function syncConsentToSupabase(): Promise<void> {
  const result = await retryFetch("/api/origin/life-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_consent" }),
  });
  if (!result.ok) {
    throw new Error(result.error ?? "同意の保存に失敗しました");
  }
}

/**
 * SupabaseからデータをフェッチしてlocalStorageとマージ
 */
export async function fetchFromSupabase(): Promise<{
  entries: LifeProfileStore["entries"];
  rendezvousConsentAt: string | null;
} | null> {
  try {
    const res = await fetch("/api/origin/life-profile");
    if (!res.ok) return null;
    const data = await res.json();
    return {
      entries: (data.entries ?? []).map((e: Record<string, unknown>) => ({
        id: e.id,
        category: e.category,
        title: e.title,
        note: e.note,
        thumbnail: e.thumbnail,
        audioUrl: null, // blob URLはセッション固有のため復元しない
        voiceTranscript: e.voice_transcript,
        location: e.location,
        depthResponses: e.depth_responses ?? [],
        active: e.active,
        since: e.since,
        until: e.until,
        impact: e.impact,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      })),
      rendezvousConsentAt: data.meta?.rendezvous_consent_at ?? null,
    };
  } catch {
    return null;
  }
}
